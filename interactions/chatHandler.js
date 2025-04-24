import {
    InteractionResponseType,
    InteractionResponseFlags,
    MessageComponentTypes,
} from 'discord-interactions';
import { DiscordRequest } from '../utils.js';
// 导入 LLM 服务
import { getLLMResponse } from '../services/llmService.js';

/**
 * 处理来自 /chat 命令的模态框提交。
 * @param {object} req - Express 请求对象。
 * @param {object} res - Express 响应对象。
 * @param {object} data - 交互数据 (req.body.data)。
 * @param {object} user - 发起交互的用户对象。
 * @param {string} token - 交互令牌 (req.body.token)。
 * @param {string} appId - 机器人应用 ID (process.env.APP_ID)。
 */
export async function handleChatModalSubmit(req, res, data, user, token, appId) {
    // 从提交的数据中提取 prompt
    let prompt = '';
    if (data.components) {
        const actionRow = data.components.find(comp => comp.type === MessageComponentTypes.ACTION_ROW);
        if (actionRow && actionRow.components) {
            const textInput = actionRow.components.find(comp => comp.custom_id === 'chat_prompt_input');
            if (textInput) {
                prompt = textInput.value;
            }
        }
    }

    if (!prompt) {
        console.error('未能从 chat_modal 提交中提取 prompt:', data);
        // 注意：这里直接返回，因为 res 对象是从 app.js 传递过来的
        return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
                content: '❌ 无法读取您输入的 Prompt。',
                flags: InteractionResponseFlags.EPHEMERAL,
            },
        });
    }

    // 1. 立即发送一个 "Thinking..." 响应 (Deferred)
    await res.send({
        type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
            // 可以选择让这个 "Thinking..." 消息是临时的
            // flags: InteractionResponseFlags.EPHEMERAL
        }
    });

    // 2. 调用 LLM 服务获取响应
    let llmResponse;
    try {
        // 注意：此处尚未传递附件信息给 getLLMResponse，需要在 llmService.js 中实现附件处理
        llmResponse = await getLLMResponse(prompt /*, attachmentDetails */);
    } catch (llmError) {
        // 如果 getLLMResponse 内部处理了错误并返回了消息，则直接使用
        // 如果它抛出了未处理的错误，则显示通用错误
        llmResponse = llmError.message || '调用 AI 时发生未知错误。';
        console.error("LLM Service Error:", llmError);
    }

    // 3. 编辑原始的 "Thinking..." 消息，显示 LLM 的回复
    const endpoint = `/webhooks/${appId}/${token}/messages/@original`;
    try {
        await DiscordRequest(endpoint, {
            method: 'PATCH',
            body: {
                content: `**<@${user.id}> 问:**\n${prompt}\n\n**AI 回答:**\n${llmResponse}`,
                // 如果需要，可以添加 components: [] 来移除按钮等
            },
        });
    } catch (err) {
        console.error('编辑后续消息时出错:', err);
        // 尝试发送一条错误消息
        try {
            await DiscordRequest(endpoint, {
                method: 'PATCH',
                body: { content: '处理您的请求时出错。' },
            });
        } catch (finalErr) {
            console.error('发送最终错误消息时出错:', finalErr);
        }
    }
    // 注意：这里不需要返回，因为 res 已经被处理了 (deferred response)
}
