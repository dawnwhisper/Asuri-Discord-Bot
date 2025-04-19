import { InteractionResponseType, InteractionResponseFlags } from 'discord-interactions';
import { DiscordRequest } from '../utils.js'; // Removed isChallengeChannel import as it's not used here

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
        const member = req.body.member; // Get member info for creator tag
        const options = req.body.data.options;
        const challengeName = options.find(opt => opt.name === 'name')?.value;

        if (!guildId) {
                return res.send({
                        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                        data: {
                                content: '❌ 此命令只能在服务器频道中使用。',
                                flags: InteractionResponseFlags.EPHEMERAL,
                        },
                });
        }
        if (!challengeName) {
                return res.send({
                        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                        data: {
                                content: '❌ 请提供题目名称。',
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

            if (!currentChannel || typeof currentChannel !== 'object') {
                    throw new Error('无法获取当前频道信息。');
            }

            const categoryId = currentChannel.parent_id;

            if (!categoryId) {
                return res.send({
                    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                    data: {
                        content: '❌ 当前频道不在任何分类下，无法创建题目频道。',
                        flags: InteractionResponseFlags.EPHEMERAL,
                    },
                });
            }

            const newChannelData = {
                name: sanitizedChannelName,
                type: 0, // GUILD_TEXT channel
                topic: `[CHALLENGE]`, // Set the topic including original name
                parent_id: categoryId,
            };

            const newChannel = await DiscordRequest(`/guilds/${guildId}/channels`, {
                method: 'POST',
                body: newChannelData,
            });

            if (!newChannel || typeof newChannel !== 'object' || !newChannel.id) {
                    throw new Error('创建频道时收到无效响应。');
            }

            const confirmationEmbed = {
                    color: 0x4CAF50, // Green
                    title: '✅ 成功创建题目频道',
                    description: `新题目 ${challengeName}！`,
                    fields: [
                        { name: `频道位置`, value: `<#${newChannel.id}>`, inline: true },
                        { name: `创建者`, value: `<@${member.user.id}>`, inline: true },
                    ],
                    footer: {
                            text: '此频道已被标记为题目频道，贡献者统计功能已启用',
                    },
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
                    title: `欢迎来到题目 ${challengeName}`, // Use original name here
                    description: `这是一个新的题目频道，由 <@${member.user.id}> 创建。\n首次在此频道发言的用户将被询问是否加入贡献者列表。`,
                    footer: {
                            text: '祝各位好运！',
                    },
            };

            await DiscordRequest(`/channels/${newChannel.id}/messages`, {
                    method: 'POST',
                    body: {
                            embeds: [welcomeEmbed],
                    },
            });

        } catch (error) {
            console.error('执行 /newchallenge 命令时出错:', error);
            let errorMessage = `❌ 创建题目频道时发生错误。`;
            if (error.message && (error.message.includes('403') || error.message.includes('Missing Permissions'))) {
                    errorMessage += '\n请确保机器人拥有在此服务器创建频道和发送消息的权限 (`MANAGE_CHANNELS`, `SEND_MESSAGES`)。';
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
                    }
            } catch (errorSendingError) {
                    console.error("发送错误消息时发生额外错误:", errorSendingError);
            }
        }
    },
};