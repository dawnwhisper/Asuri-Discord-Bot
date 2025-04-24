// LLM Configuration

// Helper function to format cost
const formatCost = (cost) => {
    if (!cost) return '价格未知';
    return `(输入: ¥${cost.input?.toFixed(2)}/M, 输出: ¥${cost.output?.toFixed(2)}/M)`;
};

// Define available models for each provider with cost
const availableProviders = {
    siliconflow: {
        name: '硅基流动 (SiliconFlow)',
        models: [
            { id: 'THUDM/GLM-Z1-9B-0414', cost: { input: 0.0, output: 0.0 } },
            { id: 'deepseek-ai/DeepSeek-R1-Distill-Qwen-7B', cost: { input: 0.0, output: 0.0 } },
            { id: 'Qwen/Qwen2.5-7B-Instruct', cost: { input: 0.0, output: 0.0 } },
            { id: 'Qwen/Qwen2.5-Coder-7B-Instruct', cost: { input: 0.0, output: 0.0 } },
            { id: 'deepseek-ai/DeepSeek-V3', cost: { input: 2.0, output: 8.0 } },
            // Add other SiliconFlow models here with their costs
        ],
        settings: {
            model: process.env.SILICONFLOW_MODEL || 'THUDM/GLM-Z1-9B-0414',
            temperature: 0.7,
            endpoint: process.env.SILICONFLOW_ENDPOINT || 'https://api.siliconflow.cn/v1/chat/completions',
        }
    },
    // custom: {
    //     name: '自定义 (Custom)',
    //     models: [
    //         { id: process.env.CUSTOM_LLM_MODEL || 'custom-default', cost: null }, // Custom models likely have unknown cost structure
    //     ],
    //     settings: {
    //         model: process.env.CUSTOM_LLM_MODEL || 'custom-default',
    //         endpoint: process.env.CUSTOM_LLM_ENDPOINT,
    //         apiKeyEnv: 'CUSTOM_LLM_API_KEY',
    //     }
    // }
    // Add other providers here
};

// Determine the active provider and its settings
const activeProviderKey = process.env.LLM_PROVIDER || 'siliconflow'; // Default to siliconflow
const activeProviderConfig = availableProviders[activeProviderKey];

if (!activeProviderConfig) {
    console.error(`Error: Configured LLM_PROVIDER "${activeProviderKey}" is not defined in availableProviders.`);
    // Fallback to the first available provider or a default
    // For now, let's just log the error and potentially fail later
}

// Export the active config and the available providers structure
export const llmConfig = {
    provider: activeProviderKey,
    // Ensure settings includes the model determined by env var or default
    settings: {
        ...(activeProviderConfig?.settings || {}),
        model: activeProviderConfig?.settings?.model || (activeProviderConfig?.models[0]?.id), // Fallback to first model ID if needed
    }
};

// Export the structure for the config command and the helper
export { availableProviders, formatCost };
