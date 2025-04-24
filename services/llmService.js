// Import availableProviders structure AND the initial config
import { llmConfig as initialLlmConfig, availableProviders } from '../config/llmConfig.js';

// --- LLM Runtime State Management (Merged from llmState.js) ---
let currentLlmConfig = {
    provider: initialLlmConfig.provider,
    model: initialLlmConfig.settings.model,
};

console.log(`Initial LLM State: Provider=${currentLlmConfig.provider}, Model=${currentLlmConfig.model}`);

/**
 * Updates the current runtime LLM configuration.
 * Exported for use by the config command handler.
 * @param {string} providerKey - The key of the selected provider (e.g., 'siliconflow').
 * @param {string} modelId - The ID of the selected model.
 */
export function updateLlmConfig(providerKey, modelId) {
    const providerInfo = availableProviders[providerKey];
    // Correctly check if the modelId exists in the array of model objects
    const modelExists = providerInfo?.models.some(modelObj => modelObj.id === modelId);

    if (providerInfo && modelExists) {
        currentLlmConfig.provider = providerKey;
        currentLlmConfig.model = modelId;
        console.log(`LLM State Updated: Provider=${currentLlmConfig.provider}, Model=${currentLlmConfig.model}`);
    } else {
        console.error(`Attempted to update LLM config with invalid provider/model: ${providerKey}/${modelId}`);
    }
}
// --- End LLM Runtime State Management ---

// --- Constants ---
const MAX_ATTACHMENT_DOWNLOAD_SIZE_MB = 5; // Increase download limit slightly if needed, but be mindful
const MAX_ATTACHMENT_DOWNLOAD_SIZE_BYTES = MAX_ATTACHMENT_DOWNLOAD_SIZE_MB * 1024 * 1024;
// Character limit for embedding content directly into the prompt
const MAX_EMBEDDED_CONTENT_CHARS = 15000; // Adjust as needed (approx < 32k tokens)
const ALLOWED_TEXT_CONTENT_TYPES = [
    'text/', // Matches text/plain, text/html, text/csv, etc.
    'application/json',
    'application/xml',
    'application/javascript',
    'application/x-python', // Common for Python scripts
    'application/x-sh',     // Common for shell scripts
    // Add other reasonably safe text-based types if needed
];

// --- Helper to download text content ---
/**
 * Attempts to download text content from a URL if it matches allowed types and size.
 * Truncates content if it exceeds MAX_EMBEDDED_CONTENT_CHARS.
 * @param {string} url - The URL of the attachment.
 * @param {string} contentType - The content type of the attachment.
 * @param {number} size - The size of the attachment in bytes.
 * @returns {Promise<{success: boolean, content?: string, truncated?: boolean, reason?: string}>}
 *          - {success: true, content: string, truncated: boolean} if downloaded.
 *          - {success: false, reason: 'too-large' | 'non-text' | 'download-failed'} otherwise.
 */
async function downloadTextAttachment(url, contentType, size) {
    // 1. Check size limit first
    if (size > MAX_ATTACHMENT_DOWNLOAD_SIZE_BYTES) {
        console.warn(`Attachment size (${size} bytes) exceeds download limit (${MAX_ATTACHMENT_DOWNLOAD_SIZE_BYTES} bytes). Skipping download.`);
        return { success: false, reason: 'too-large' };
    }

    // 2. Check content type
    // const isAllowedType = ALLOWED_TEXT_CONTENT_TYPES.some(prefix => contentType?.startsWith(prefix));
    const isAllowedType = true; // 注意: 暂时禁用类型检查以允许处理 CTF 相关文件
    if (!isAllowedType) {
        console.log(`Attachment content type (${contentType}) is not in the allowed list for download. Skipping content download.`);
        return { success: false, reason: 'non-text' };
    }

    // 3. Attempt download
    try {
        console.log(`Downloading text-based content for type: ${contentType}`);
        const response = await fetch(url);
        if (!response.ok) {
            console.error(`Failed to download attachment from ${url}, status: ${response.status}`);
            return { success: false, reason: 'download-failed' };
        }
        let content = await response.text();
        let truncated = false;

        // 4. Check character limit and truncate if necessary
        if (content.length > MAX_EMBEDDED_CONTENT_CHARS) {
            content = content.substring(0, MAX_EMBEDDED_CONTENT_CHARS);
            truncated = true;
            console.log(`Attachment content truncated to ${MAX_EMBEDDED_CONTENT_CHARS} characters.`);
        }

        return { success: true, content: content, truncated: truncated };
    } catch (error) {
        console.error(`Error downloading or processing attachment from ${url}:`, error);
        return { success: false, reason: 'download-failed' };
    }
}

// --- API Call Functions ---

async function callOpenAI(prompt, config) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        throw new Error("OpenAI API key (OPENAI_API_KEY) not found in environment variables.");
    }
    console.log(`Calling OpenAI model: ${config.model}`);

    try {
        const response = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: config.model,
                messages: [{ role: "user", content: prompt }],
                temperature: config.temperature || 0.7,
            }),
        });

        if (!response.ok) {
            const errorBody = await response.json();
            console.error("OpenAI API Error:", errorBody);
            throw new Error(`OpenAI API request failed with status ${response.status}: ${errorBody.error?.message || 'Unknown error'}`);
        }

        const data = await response.json();
        // Return content and usage
        return {
            content: data.choices[0]?.message?.content?.trim() || "No response content from OpenAI.",
            usage: data.usage || null // { prompt_tokens, completion_tokens, total_tokens }
        };

    } catch (error) {
        console.error("Error calling OpenAI:", error);
        throw error; // Re-throw the error to be caught by the handler
    }
}

async function callSiliconFlow(prompt, config) {
    const apiKey = process.env.SILICONFLOW_API_KEY;
    if (!apiKey) {
        throw new Error("SiliconFlow API key (SILICONFLOW_API_KEY) not found in environment variables.");
    }
    const endpoint = config.endpoint; // Get endpoint from config
    console.log(`Calling SiliconFlow model: ${config.model} at ${endpoint}`);

    try {
        const response = await fetch(endpoint, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${apiKey}` // Assuming Bearer token auth
            },
            body: JSON.stringify({
                model: config.model,
                messages: [{ role: "user", content: prompt }],
                temperature: config.temperature || 0.7,
            }),
        });

        if (!response.ok) {
            // Try to parse error body, but handle cases where it might not be JSON
            let errorBodyText = await response.text();
            let errorMessage = `SiliconFlow API request failed with status ${response.status}`;
            try {
                const errorBody = JSON.parse(errorBodyText);
                console.error("SiliconFlow API Error:", errorBody);
                errorMessage += `: ${errorBody.error?.message || errorBody.message || errorBodyText || 'Unknown error'}`;
            } catch (parseError) {
                console.error("SiliconFlow API Error (non-JSON response):", errorBodyText);
                errorMessage += `: ${errorBodyText || 'Unknown error'}`;
            }
            throw new Error(errorMessage);
        }

        const data = await response.json();
        // Return content and usage (assuming SiliconFlow matches OpenAI format)
        return {
            content: data.choices[0]?.message?.content?.trim() || "No response content from SiliconFlow.",
            usage: data.usage || null // { prompt_tokens, completion_tokens, total_tokens }
        };

    } catch (error) {
        console.error("Error calling SiliconFlow:", error);
        throw error; // Re-throw the error to be caught by the handler
    }
}

async function callGemini(prompt, config) {
    console.warn("Gemini provider called but not implemented.");
    // Return structure consistent with others, even for errors
    return { content: "Gemini provider not yet implemented.", usage: null };
}

async function callCustomLLM(prompt, config) {
    console.warn("Custom LLM provider called but not implemented.");
    // Return structure consistent with others, even for errors
    return { content: "Custom LLM provider not yet implemented.", usage: null };
}

/**
 * Gets a response from the configured LLM provider using the current runtime state.
 * @param {string} prompt - The user's prompt.
 * @param {object | null} attachmentDetails - Details of the uploaded attachment (if any).
 * @returns {Promise<{content: string, usage: object | null}>} The LLM's response content and token usage.
 * @throws {Error} If configuration is invalid or API call fails.
 */
export async function getLLMResponse(prompt, attachmentDetails = null) {
    // Use the provider and model from the runtime state (defined in this file)
    const provider = currentLlmConfig.provider;
    const model = currentLlmConfig.model;

    // Get the full settings object for the CURRENT provider from the availableProviders structure
    const providerSettings = availableProviders[provider]?.settings;

    if (!providerSettings) {
        throw new Error(`Configuration settings for the current LLM provider "${provider}" could not be loaded from availableProviders. Check config/llmConfig.js.`);
    }

    // Create a settings object to pass to the API call function, ensuring the CURRENT model is used
    const activeSettings = {
        ...providerSettings, // Copy base settings (like endpoint, temperature)
        model: model,        // Override with the currently selected model
    };

    let processedPrompt = prompt; // Start with the original prompt
    let fileContext = ""; // Context string related to the file

    // --- Attachment Handling ---
    if (attachmentDetails) {
        console.log(`Processing attachment: ${attachmentDetails.filename} (Type: ${attachmentDetails.content_type}, Size: ${attachmentDetails.size}, URL: ${attachmentDetails.url})`);

        const downloadResult = await downloadTextAttachment(
            attachmentDetails.url,
            attachmentDetails.content_type,
            attachmentDetails.size
        );

        if (downloadResult.success) {
            // Successfully downloaded text content (potentially truncated)
            fileContext = `用户上传了一个文件 "${attachmentDetails.filename}" (类型: ${attachmentDetails.content_type}, 大小: ${attachmentDetails.size}字节)。\n`;
            if (downloadResult.truncated) {
                fileContext += `注意：文件内容已被截断，仅显示前 ${MAX_EMBEDDED_CONTENT_CHARS} 个字符。\n`;
            }
            fileContext += `文件内容如下:\n\`\`\`\n${downloadResult.content}\n\`\`\`\n`;
            console.log(`Attachment content included in prompt (Truncated: ${downloadResult.truncated}).`);
        } else {
            // Content not downloaded, provide metadata instead
            let reasonText = "";
            switch (downloadResult.reason) {
                case 'too-large':
                    reasonText = `文件大小超过了 ${MAX_ATTACHMENT_DOWNLOAD_SIZE_MB}MB 的下载限制。`;
                    break;
                case 'non-text':
                    reasonText = `文件类型 (${attachmentDetails.content_type}) 不适合直接处理内容。`;
                    break;
                case 'download-failed':
                    reasonText = `尝试下载文件时出错。`;
                    break;
                default:
                    reasonText = `由于未知原因无法处理文件内容。`;
            }
            // Include file URL for potential manual inspection by the user or if the LLM *could* access URLs (though unlikely for most chat models)
            fileContext = `用户上传了一个文件 "${attachmentDetails.filename}" (类型: ${attachmentDetails.content_type}, 大小: ${attachmentDetails.size}字节)。\n注意: ${reasonText} 文件内容未包含在提示中。\n文件URL (可能无法直接访问): ${attachmentDetails.url}\n`;
            console.log(`Attachment metadata included in prompt (Reason: ${downloadResult.reason}).`);
        }
        // Prepend file context to the user's original prompt
        processedPrompt = `${fileContext}\n用户的提问: ${prompt}`;
    }
    // --- End Attachment Handling ---

    try {
        let result = { content: '', usage: null }; // Default result structure
        switch (provider) {
            case 'siliconflow':
                result = await callSiliconFlow(processedPrompt, activeSettings);
                break;
            case 'openai':
                result = await callOpenAI(processedPrompt, activeSettings);
                break;
            case 'gemini':
                result = await callGemini(processedPrompt, activeSettings); // Call the stub function
                break;
            case 'custom':
                result = await callCustomLLM(processedPrompt, activeSettings); // Call the stub function
                break;
            default:
                // Return error content in the standard structure
                return { content: `Unsupported LLM provider: "${provider}"`, usage: null };
        }
        // Ensure result is always in the expected format
        return result || { content: 'Provider returned undefined result.', usage: null };
    } catch (error) {
        console.error(`Error getting response from LLM provider "${provider}" (Model: ${model}):`, error);
        // Return error content, usage remains null
        return { content: `抱歉，调用 AI 时出错: ${error.message}`, usage: null };
    }
}

// Export currentLlmConfig for read-only access if needed elsewhere (like chat.js for prefix)
export { currentLlmConfig };
