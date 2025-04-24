import {
    InteractionResponseType,
    InteractionResponseFlags,
    MessageComponentTypes,
    ButtonStyleTypes,
} from 'discord-interactions';
import { DiscordRequest } from '../utils.js';
// Import state management functions and state from llmService.js
import { currentLlmConfig, updateLlmConfig, getLLMResponse } from '../services/llmService.js';
// Keep config imports for availableProviders
import { availableProviders, formatCost, llmConfig as initialConfig } from '../config/llmConfig.js'; // Use initialConfig for default display
// Import cost tracking functions
import { updateUserCost } from '../utils.js';

// --- Handler for the 'ask' subcommand ---
async function handleAskSubcommand(req, res, subcommandOptions, user, token, appId) {
    const promptOption = subcommandOptions?.find(opt => opt.name === 'prompt');
    const attachmentOption = subcommandOptions?.find(opt => opt.name === 'attachment');

    const prompt = promptOption?.value;
    const attachmentId = attachmentOption?.value;

    // 从 resolved 数据中获取附件详情
    let attachmentDetails = null;
    if (attachmentId && req.body.data.resolved?.attachments) {
        attachmentDetails = req.body.data.resolved.attachments[attachmentId];
    }

    if (!prompt) {
        return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: { content: '❌ 请提供有效的 Prompt。', flags: InteractionResponseFlags.EPHEMERAL },
        });
    }

    if (!appId || !token) {
         console.error("Missing APP_ID or interaction token.");
         return res.send({
             type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
             data: { content: '❌ 机器人配置错误，无法处理请求。', flags: InteractionResponseFlags.EPHEMERAL },
         });
    }

    // 1. Defer response
    await res.send({
        type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
    });

    // 2. Call LLM Service - expecting { content, usage }
    let llmResult = { content: '调用 AI 时发生未知错误。', usage: null }; // Default error structure
    try {
        llmResult = await getLLMResponse(prompt, attachmentDetails);
    } catch (llmError) {
        llmResult.content = llmError.message || '调用 AI 时发生未知错误。';
        console.error("LLM Service Error:", llmError);
    }

    // 3. Edit original response
    const endpoint = `/webhooks/${appId}/${token}/messages/@original`;
    let calculatedCostYuan = 0; // Variable to store calculated cost

    try {
        // Get current provider info and model info including cost
        const providerInfo = availableProviders[currentLlmConfig.provider];
        const modelInfo = providerInfo?.models.find(m => m.id === currentLlmConfig.model);
        const providerName = providerInfo?.name || currentLlmConfig.provider;
        const modelId = currentLlmConfig.model || '未知模型';
        const responsePrefix = `**${providerName} (${modelId}) 回答:**`;

        let finalContent = `**<@${user.id}> 问:**\n${prompt}\n\n`;
        if (attachmentDetails) {
             finalContent += `*附带文件: ${attachmentDetails.filename}*\n\n`;
        }
        finalContent += `${responsePrefix}\n${llmResult.content}`; // Use content from result object

        // --- Calculate and Append Cost ---
        let costString = "";
        if (llmResult.usage && modelInfo?.cost?.input != null && modelInfo?.cost?.output != null) { // Check if costs are defined
            const inputCost = (llmResult.usage.prompt_tokens / 1000000) * modelInfo.cost.input;
            const outputCost = (llmResult.usage.completion_tokens / 1000000) * modelInfo.cost.output;
            calculatedCostYuan = inputCost + outputCost; // Store the calculated cost
            costString = `\n\n*费用: ¥${calculatedCostYuan.toFixed(6)} (输入: ${llmResult.usage.prompt_tokens} tokens, 输出: ${llmResult.usage.completion_tokens} tokens)*`;
        } else if (llmResult.usage) {
            costString = `\n\n*用量: (输入: ${llmResult.usage.prompt_tokens} tokens, 输出: ${llmResult.usage.completion_tokens} tokens) - 价格未知*`;
        }
        finalContent += costString;
        // --- End Cost Calculation ---

        await DiscordRequest(endpoint, {
            method: 'PATCH',
            body: {
                content: finalContent,
                allowed_mentions: { parse: ['users'] }
            },
        });

        // --- Update User's Total Cost (After successful response edit) ---
        if (calculatedCostYuan > 0 && user?.id) {
            await updateUserCost(user.id, calculatedCostYuan);
        }
        // --- End Update User's Total Cost ---

    } catch (err) {
        console.error('编辑后续消息时出错:', err);
        try {
            await DiscordRequest(endpoint, {
                method: 'PATCH',
                body: { content: '处理您的请求时出错，无法显示结果。' },
            });
        } catch (finalErr) {
            console.error('发送最终错误消息时出错:', finalErr);
        }
    }
}

// --- Handler for the 'config' subcommand ---
async function handleConfigSubcommand(req, res) {
    const combinedOptions = [];
    Object.entries(availableProviders).forEach(([providerKey, provider]) => {
        provider.models.forEach(modelInfo => { // Iterate through modelInfo objects
            const value = `${providerKey}|${modelInfo.id}`;
            if (value.length <= 100) {
                combinedOptions.push({
                    label: `${provider.name} - ${modelInfo.id}`,
                    value: value,
                    // Add cost to description
                    description: formatCost(modelInfo.cost),
                    // Mark the currently active combination based on runtime state
                    default: providerKey === currentLlmConfig.provider && modelInfo.id === currentLlmConfig.model,
                });
            } else {
                 console.warn(`Skipping option due to length > 100: ${value}`);
            }
        });
    });

    // Sort options alphabetically by label
    combinedOptions.sort((a, b) => a.label.localeCompare(b.label));

    // Send ephemeral message with the combined selection menu and a cancel button
    return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
            content: '请选择 AI 提供商和模型:',
            flags: InteractionResponseFlags.EPHEMERAL,
            components: [
                {
                    type: MessageComponentTypes.ACTION_ROW,
                    components: [
                        {
                            type: MessageComponentTypes.STRING_SELECT,
                            custom_id: 'select_llm_config', // New custom ID for the combined menu
                            placeholder: '选择提供商和模型',
                            options: combinedOptions,
                            min_values: 1,
                            max_values: 1,
                        },
                    ],
                },
                { // Add a cancel button row
                    type: MessageComponentTypes.ACTION_ROW,
                    components: [
                         {
                            type: MessageComponentTypes.BUTTON,
                            custom_id: 'cancel_llm_config',
                            label: '取消',
                            style: ButtonStyleTypes.SECONDARY,
                        }
                    ]
                }
            ],
        },
    });
}

// --- Handler for Combined Config Selection Menu ---
async function handleConfigSelect(req, res, data, custom_id) {
    const selectedValue = data.values[0];
    const parts = selectedValue.split('|');
    const user = req.body.member?.user ?? req.body.user;

    if (parts.length !== 2) {
        console.error(`Invalid combined config value format: ${selectedValue}`);
        return res.send({
            type: InteractionResponseType.UPDATE_MESSAGE,
            data: { content: '❌ 内部错误：选择值格式无效。', components: [], flags: InteractionResponseFlags.EPHEMERAL }
        });
    }

    const [providerKey, selectedModel] = parts;
    const providerInfo = availableProviders[providerKey];
    const modelExists = providerInfo?.models.some(modelObj => modelObj.id === selectedModel);

    if (!providerInfo || !modelExists) {
         console.error(`Invalid model or provider in combined value: ${selectedModel} / ${providerKey}`);
         return res.send({
             type: InteractionResponseType.UPDATE_MESSAGE,
             data: { content: '❌ 内部错误：选择的模型或提供商无效。', components: [], flags: InteractionResponseFlags.EPHEMERAL }
         });
    }

    const modelInfo = providerInfo.models.find(m => m.id === selectedModel);

    updateLlmConfig(providerKey, selectedModel);

    const costText = formatCost(modelInfo?.cost);

    return res.send({
        type: InteractionResponseType.UPDATE_MESSAGE,
        data: {
            content: `✅ <@${user?.id}> 已将 AI 配置更新为:\n提供商: **${providerInfo.name}**\n模型: **${selectedModel}**\n价格: ${costText}`,
            allowed_mentions: { parse: ['users'] },
            components: [],
            flags: 0,
        },
    });
}

// --- Handler for Cancel Button ---
async function handleCancelConfig(req, res) {
    return res.send({
        type: InteractionResponseType.UPDATE_MESSAGE,
        data: {
            content: '❎ AI 配置已取消。',
            flags: InteractionResponseFlags.EPHEMERAL,
            components: [],
        },
    });
}

// --- Main command export ---
export const chat = {
    name: 'chat',
    description: '与 AI 进行对话或配置 AI。',
    integration_types: [0, 1],
    contexts: [0, 1, 2],
    execute: async (req, res) => {
        const subcommand = req.body.data.options[0];
        const user = req.body.member?.user ?? req.body.user;
        const token = req.body.token;
        const appId = process.env.APP_ID;

        switch (subcommand.name) {
            case 'ask':
                return await handleAskSubcommand(req, res, subcommand.options, user, token, appId);
            case 'config':
                return await handleConfigSubcommand(req, res);
            default:
                console.error(`Unknown chat subcommand: ${subcommand.name}`);
                return res.send({
                    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                    data: { content: '❌ 未知的子命令。', flags: InteractionResponseFlags.EPHEMERAL },
                });
        }
    },
};

export { handleConfigSelect, handleCancelConfig };
