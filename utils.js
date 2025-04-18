import 'dotenv/config';

// Function to introduce a delay
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

export async function DiscordRequest(endpoint, options, retries = 3) {
  // append endpoint to root API URL
  const url = 'https://discord.com/api/v10/' + endpoint;
  // Stringify payloads
  if (options.body) options.body = JSON.stringify(options.body);

  let attempt = 0;
  while (attempt < retries) {
    attempt++;
    try {
      // Use fetch to make requests
      const res = await fetch(url, {
        headers: {
          Authorization: `Bot ${process.env.DISCORD_TOKEN}`,
          'Content-Type': 'application/json; charset=UTF-8',
          'User-Agent': 'DiscordBot (https://github.com/discord/discord-example-app, 1.0.0)', // Consider updating this User-Agent if it's not accurate
        },
        ...options
      });

      // throw API errors
      if (!res.ok) {
        // Don't retry on specific client errors like 4xx unless it's 429 (Rate Limit)
        if (res.status === 429) {
           const data = await res.json();
           const retryAfter = data.retry_after ? parseFloat(data.retry_after) * 1000 : 1000 * attempt; // Use retry_after header or exponential backoff
           console.warn(`Rate limited. Retrying after ${retryAfter}ms... (Attempt ${attempt}/${retries})`);
           await delay(retryAfter);
           continue; // Go to next attempt
        } else if (res.status >= 400 && res.status < 500) {
            const data = await res.json();
            console.error(`Client error ${res.status}: ${JSON.stringify(data)}`);
            throw new Error(`API Client Error (${res.status}): ${JSON.stringify(data)}`); // Don't retry client errors other than 429
        }
        // For server errors (5xx), retry might help
        const data = await res.json();
        console.warn(`API Server Error (${res.status}). Retrying... (Attempt ${attempt}/${retries})`);
        await delay(1000 * attempt); // Simple exponential backoff
        continue; // Go to next attempt
      }
      // return original response if successful
      return res;

    } catch (error) {
      // Check if it's a network error potentially worth retrying
      // Node fetch errors often have a 'cause' property for underlying network issues
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
  // Should not be reached if retries are exhausted, as the error is rethrown in the catch block
  throw new Error(`DiscordRequest failed after ${retries} attempts for endpoint: ${endpoint}`);
}

// ... rest of the file (InstallGlobalCommands, getRandomEmoji, capitalize) ...
export async function InstallGlobalCommands(appId, commands) {
  // API endpoint to overwrite global commands
  const endpoint = `applications/${appId}/commands`;

  try {
    // This is calling the bulk overwrite endpoint: https://discord.com/developers/docs/interactions/application-commands#bulk-overwrite-global-application-commands
    // Use the updated DiscordRequest with retry logic
    await DiscordRequest(endpoint, { method: 'PUT', body: commands });
    console.log('Successfully installed global commands.'); // Add success log
  } catch (err) {
    // Error is already logged within DiscordRequest, but maybe add context here
    console.error('Failed to install global commands:', err.message);
  }
}

// Simple method that returns a random emoji from list
export function getRandomEmoji() {
  const emojiList = ['😭','😄','😌','🤓','😎','😤','🤖','😶‍🌫️','🌏','📸','💿','👋','🌊','✨'];
  return emojiList[Math.floor(Math.random() * emojiList.length)];
}

export function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}