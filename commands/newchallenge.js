import { InteractionResponseType, InteractionResponseFlags, MessageComponentTypes, ButtonStyleTypes } from 'discord-interactions'; // Add MessageComponentTypes, ButtonStyleTypes
import { DiscordRequest } from '../utils.js';

export const newchallenge = {
    name: 'newchallenge',
    description: '在当前分类下创建一个新的题目频道。',
    options: [
        {
            name: 'name',
            description: '新题目的名称 (将作为频道名)',
            type: 3, // STRING type
            required: true,
        },
    ],
    integration_types: [0], // Guild install only
    contexts: [0], // Guild context only
    execute: async (req, res) => {
        const guildId = req.body.guild_id;
        const channelId = req.body.channel_id;
        const member = req.body.member;
        const options = req.body.data.options;
        const challengeName = options.find(opt => opt.name === 'name')?.value;

        if (!challengeName) {
            return res.send({
                type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: {
                    content: '❌ 无效的频道名称。名称不能为空。',
                    flags: InteractionResponseFlags.EPHEMERAL,
                },
            });
        }

        const sanitizedChannelName = challengeName
            .toLowerCase()
            .replace(/\s+/g, '-') // Replace spaces with hyphens
            .replace(/[^a-z0-9-]/g, ''); // Remove invalid characters

        if (!sanitizedChannelName || sanitizedChannelName.length < 1 || sanitizedChannelName.length > 100) {
            return res.send({
                type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: {
                    content: '❌ 无效的频道名称。名称只能包含小写字母、数字和连字符，长度在 1 到 100 个字符之间。',
                    flags: InteractionResponseFlags.EPHEMERAL,
                },
            });
        }

        try {
            const currentChannel = await DiscordRequest(`/channels/${channelId}`, { method: 'GET' });
            if (!currentChannel || !currentChannel.parent_id) {
                return res.send({
                    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                    data: {
                        content: '❌ 当前频道不在任何分类下，无法创建题目频道。',
                        flags: InteractionResponseFlags.EPHEMERAL,
                    },
                });
            }
            const categoryId = currentChannel.parent_id;

            const newChannelData = {
                name: sanitizedChannelName,
                type: 0, // GUILD_TEXT
                topic: `[CHALLENGE]`,
                parent_id: categoryId,
            };

            const newChannel = await DiscordRequest(`/guilds/${guildId}/channels`, {
                method: 'POST',
                body: newChannelData,
            });

            if (!newChannel || !newChannel.id) {
                throw new Error('Failed to create new channel.');
            }

            const confirmationEmbed = {
                color: 0x4CAF50,
                title: '✅ 成功创建题目频道',
                description: `新题目 ${challengeName}！`,
                fields: [
                    { name: `频道位置`, value: `<#${newChannel.id}>`, inline: true },
                    { name: `创建者`, value: `<@${member.user.id}>`, inline: true },
                ],
                footer: { text: '此频道已被标记为题目频道，贡献者统计功能已启用' },
                timestamp: new Date().toISOString(),
            };

            await res.send({
                type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: {
                    embeds: [confirmationEmbed],
                },
            });

            const welcomeEmbed = {
                color: 0x2196F3, // Blue
                title: `欢迎来到题目 ${challengeName}`,
                description: `这是一个新的题目频道，由 <@${member.user.id}> 创建。`,
                fields: [
                    {
                        name: '当前贡献者名单',
                        value: '无', // Initial state
                        inline: false,
                    },
                ],
                footer: {
                    text: '祝各位好运！',
                },
            };

            const messagePayload = {
                embeds: [welcomeEmbed],
                components: [
                    {
                        type: MessageComponentTypes.ACTION_ROW,
                        components: [
                            {
                                type: MessageComponentTypes.BUTTON,
                                custom_id: 'view_contributors_info',
                                label: '点击查看贡献者相关信息',
                                style: ButtonStyleTypes.PRIMARY, // Blue button
                            },
                        ],
                    },
                ],
            };

            const messageResponse = await DiscordRequest(`/channels/${newChannel.id}/messages`, {
                method: 'POST',
                body: messagePayload,
            });

            if (!messageResponse || typeof messageResponse !== 'object' || !messageResponse.id) {
                console.warn(`[Command:newchallenge] Failed to get message ID after sending welcome message to ${newChannel.id}. Cannot pin.`);
                return;
            }
            const welcomeMessageId = messageResponse.id;

            try {
                console.log(`[Command:newchallenge] Attempting to pin welcome message (ID: ${welcomeMessageId}) in channel ${newChannel.id}`);
                await DiscordRequest(`/channels/${newChannel.id}/pins/${welcomeMessageId}`, {
                    method: 'PUT',
                });
                console.log(`[Command:newchallenge] Welcome message pinned successfully.`);
            } catch (pinError) {
                console.error(`[Command:newchallenge] Failed to pin welcome message:`, pinError);
            }

        } catch (error) {
            console.error('执行 /newchallenge 命令时出错:', error);
            let errorMessage = `❌ 创建题目频道时发生错误。`;
            if (error.message && (error.message.includes('403') || error.message.includes('Missing Permissions'))) {
                errorMessage += '\n请确保机器人拥有创建频道、发送消息和管理消息的权限 (`MANAGE_CHANNELS`, `SEND_MESSAGES`, `MANAGE_MESSAGES`)。';
            } else if (error.responseBody && error.responseBody.message) {
                errorMessage += `\n错误详情: ${error.responseBody.message}`;
            } else if (error.message) {
                errorMessage += `\n错误详情: ${error.message}`;
            }

            try {
                if (!res.headersSent) {
                    await res.send({
                        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                        data: {
                            content: errorMessage,
                            flags: InteractionResponseFlags.EPHEMERAL,
                        },
                    });
                } else {
                    console.error("无法发送错误消息，因为初始响应已发送。错误:", errorMessage);
                    const followupEndpoint = `/webhooks/${process.env.APP_ID}/${req.body.token}`;
                    try {
                        await DiscordRequest(followupEndpoint, {
                            method: 'POST',
                            body: {
                                content: errorMessage,
                                flags: InteractionResponseFlags.EPHEMERAL,
                            },
                        });
                    } catch (followupError) {
                        console.error("发送后续错误消息失败:", followupError);
                    }
                }
            } catch (errorSendingError) {
                console.error("发送错误消息时发生额外错误:", errorSendingError);
            }
        }
    },
};