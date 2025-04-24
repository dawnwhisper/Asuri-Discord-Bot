import 'dotenv/config';
import fetch from 'node-fetch';
import { verifyKey } from 'discord-interactions';
import fs from 'fs/promises'; // Use promises API for async operations
import path from 'path';
import { fileURLToPath } from 'url';

// Function to introduce a delay
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// Store for rate limit information per bucket
// { bucketId: { remaining: number, resetTimestamp: number } }
const rateLimits = {};
// Timestamp when the global rate limit resets (in milliseconds)
let globalRateLimitResetTimestamp = 0;

export async function DiscordRequest(endpoint, options, retries = 3) {
    const url = 'https://discord.com/api/v10/' + endpoint;
    if (options.body) options.body = JSON.stringify(options.body);

    // --- Rate Limit Handling ---
    // Basic bucket identification (can be improved, Discord API is complex here)
    // Typically, major parameters define the bucket (e.g., channel_id, guild_id)
    // For simplicity, we'll use the method + endpoint path structure as a proxy
    const method = options.method || 'GET';
    const bucketId = `${method}:${endpoint.replace(/\d{17,19}/g, ':id')}`; // Replace snowflakes with :id

    let attempt = 0;
    while (attempt < retries) {
        attempt++;

        // 1. Check Global Rate Limit
        const now = Date.now();
        if (globalRateLimitResetTimestamp > now) {
            const waitTime = globalRateLimitResetTimestamp - now;
            console.warn(`[GLOBAL RATE LIMIT] Waiting ${waitTime}ms before next request.`);
            await delay(waitTime);
        }

        // 2. Check Bucket Rate Limit
        const bucketInfo = rateLimits[bucketId];
        if (bucketInfo && bucketInfo.remaining === 0 && bucketInfo.resetTimestamp > now) {
            const waitTime = bucketInfo.resetTimestamp - now;
            console.warn(`[BUCKET RATE LIMIT ${bucketId}] Waiting ${waitTime}ms before next request.`);
            await delay(waitTime);
            // Reset remaining after wait, assuming the bucket resets
            bucketInfo.remaining = undefined; // Let the next response update it accurately
        }

        try {
            const res = await fetch(url, {
                headers: {
                    Authorization: `Bot ${process.env.DISCORD_TOKEN}`,
                    'Content-Type': 'application/json; charset=UTF-8',
                    'User-Agent': 'DiscordBot (https://github.com/discord/discord-example-app, 1.0.0)',
                },
                ...options
            });

            // --- Update Rate Limit Info from Headers ---
            const headers = res.headers;
            const limit = headers.get('x-ratelimit-limit');
            const remaining = headers.get('x-ratelimit-remaining');
            const resetAfter = headers.get('x-ratelimit-reset-after'); // Seconds until reset
            const bucketHeader = headers.get('x-ratelimit-bucket'); // Actual bucket ID from Discord

            // Use the actual bucket ID from the header if available
            const actualBucketId = bucketHeader || bucketId;

            if (resetAfter && remaining) {
                 const resetTimestamp = Date.now() + (parseFloat(resetAfter) * 1000);
                 rateLimits[actualBucketId] = {
                     remaining: parseInt(remaining, 10),
                     resetTimestamp: resetTimestamp,
                     limit: limit ? parseInt(limit, 10) : undefined, // Store limit for context
                 };
                 // console.log(`[RATE LIMIT ${actualBucketId}] Remaining: ${remaining}, Resets in: ${resetAfter}s`);
            }
            // --- End Rate Limit Update ---


            if (!res.ok) {
                const responseBody = await res.json(); // Read body once

                if (res.status === 429) {
                    const retryAfter = responseBody.retry_after ? parseFloat(responseBody.retry_after) * 1000 : 1000 * attempt;
                    const isGlobal = responseBody.global || headers.get('x-ratelimit-global') === 'true'; // Check body and headers

                    if (isGlobal) {
                        console.warn(`[GLOBAL RATE LIMIT HIT] Retrying after ${retryAfter}ms...`);
                        globalRateLimitResetTimestamp = Date.now() + retryAfter;
                    } else {
                        console.warn(`[BUCKET RATE LIMIT HIT ${actualBucketId}] Retrying after ${retryAfter}ms...`);
                        // Update specific bucket reset time based on 429 response
                        rateLimits[actualBucketId] = {
                            ...rateLimits[actualBucketId], // Keep existing limit if known
                            remaining: 0,
                            resetTimestamp: Date.now() + retryAfter,
                        };
                    }
                    await delay(retryAfter);
                    continue; // Go to next attempt

                } else if (res.status >= 400 && res.status < 500) {
                    console.error(`Client error ${res.status}: ${JSON.stringify(responseBody)}`);
                    // Wrap the original body in the error
                    const error = new Error(`API Client Error (${res.status}): ${JSON.stringify(responseBody)}`);
                    error.responseBody = responseBody;
                    throw error;
                }

                // Server errors (5xx)
                console.warn(`API Server Error (${res.status}). Retrying... (Attempt ${attempt}/${retries}) Body: ${JSON.stringify(responseBody)}`);
                await delay(1000 * attempt); // Simple exponential backoff
                continue; // Go to next attempt
            }

            // Return original response if successful
            // If response has no body (e.g., 204 No Content), return the response object itself
            // Otherwise, parse JSON body
            if (res.status === 204) {
                    return res;
            }
            // Try to parse JSON, return raw response if fails (e.g., image data)
            try {
                    return await res.json();
            } catch (e) {
                    console.warn("Response was not JSON, returning raw response object.");
                    return res;
            }


        } catch (error) {
            // Check if it's a network error potentially worth retrying
            const causeCode = error.cause?.code;
            if (causeCode === 'ECONNRESET' || causeCode === 'ECONNREFUSED' || causeCode === 'ETIMEDOUT' || causeCode === 'ENOTFOUND' || error.message.includes('fetch failed')) {
                console.warn(`Network error (${causeCode || error.message}). Retrying... (Attempt ${attempt}/${retries})`);
                if (attempt >= retries) {
                    console.error(`Failed after ${retries} attempts.`);
                    throw error; // Rethrow error after final attempt
                }
                await delay(1000 * attempt); // Simple exponential backoff
                continue; // Go to next attempt
            } else {
                // Don't retry other types of errors
                console.error("Unhandled error during DiscordRequest:", error);
                throw error; // Rethrow unexpected errors immediately
            }
        }
    }
    throw new Error(`DiscordRequest failed after ${retries} attempts for endpoint: ${endpoint}`);
}

// --- Cost Tracking Utilities ---

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const costsDir = path.join(__dirname, 'data', 'user_costs');

// Ensure the costs directory exists
async function ensureCostsDir() {
    try {
        await fs.mkdir(costsDir, { recursive: true });
    } catch (error) {
        if (error.code !== 'EEXIST') {
            console.error("Failed to create costs directory:", error);
            throw error; // Re-throw if it's not just directory exists error
        }
    }
}

/**
 * Gets the total cost for a given user ID.
 * @param {string} userId - The Discord user ID.
 * @returns {Promise<number>} The total cost in Yuan (元), defaults to 0.
 */
export async function getUserCost(userId) {
    await ensureCostsDir(); // Ensure directory exists before reading
    const filePath = path.join(costsDir, `${userId}.json`);
    try {
        const data = await fs.readFile(filePath, 'utf-8');
        const costData = JSON.parse(data);
        return costData.totalCostYuan || 0;
    } catch (error) {
        if (error.code === 'ENOENT') {
            return 0; // File not found, user has no recorded cost yet
        }
        console.error(`Error reading cost file for user ${userId}:`, error);
        return 0; // Return 0 on other errors to avoid breaking functionality
    }
}

/**
 * Updates the total cost for a given user ID by adding the cost of the latest API call.
 * @param {string} userId - The Discord user ID.
 * @param {number} costToAddYuan - The cost in Yuan (元) to add to the user's total.
 */
export async function updateUserCost(userId, costToAddYuan) {
    if (!userId || typeof costToAddYuan !== 'number' || costToAddYuan <= 0) {
        console.warn(`Invalid attempt to update cost for user ${userId} with amount ${costToAddYuan}`);
        return;
    }
    await ensureCostsDir(); // Ensure directory exists before writing
    const filePath = path.join(costsDir, `${userId}.json`);
    try {
        let currentCost = 0;
        try {
            const data = await fs.readFile(filePath, 'utf-8');
            const costData = JSON.parse(data);
            currentCost = costData.totalCostYuan || 0;
        } catch (readError) {
            if (readError.code !== 'ENOENT') {
                console.error(`Error reading existing cost file for user ${userId} before update:`, readError);
                // Decide if you want to proceed or stop. Let's proceed assuming 0 cost.
            }
        }

        const newTotalCost = currentCost + costToAddYuan;
        const newCostData = { totalCostYuan: newTotalCost };

        await fs.writeFile(filePath, JSON.stringify(newCostData, null, 2), 'utf-8');
        console.log(`Updated cost for user ${userId}: Added ${costToAddYuan.toFixed(6)}, New Total: ${newTotalCost.toFixed(6)}`);

    } catch (error) {
        console.error(`Error writing cost file for user ${userId}:`, error);
    }
}

// --- End Cost Tracking Utilities ---

// Make sure InstallGlobalCommands uses the updated DiscordRequest
export async function InstallGlobalCommands(appId, commands) {
    const endpoint = `applications/${appId}/commands`;
    console.log(`Installing ${commands.length} global commands...`);
    try {
        // This is calling the bulk overwrite endpoint
        await DiscordRequest(endpoint, { method: 'PUT', body: commands });
        console.log('Successfully installed global commands.');
    } catch (err) {
        console.error('Failed to install global commands:', err.message, err.responseBody || '');
    }
}

// --- Helper Functions ---

/**
 * Checks if a Discord channel object is a challenge channel based on its topic.
 * @param {object} channel - The Discord channel object (needs 'topic' property).
 * @returns {boolean} True if the channel topic contains "[CHALLENGE]", false otherwise.
 */
export function isChallengeChannel(channel) {
  // Check if channel exists and has a topic property which is a string
  return channel && typeof channel.topic === 'string' && channel.topic.includes('[CHALLENGE]');
}

// Simple method that returns a random emoji from list
export function getRandomEmoji() {
    const emojiList = ['😭','😄','😌','🤓','😎','😤','🤖','😶‍🌫️','🌏','📸','💿','👋','🌊','✨'];
    return emojiList[Math.floor(Math.random() * emojiList.length)];
}

export function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}