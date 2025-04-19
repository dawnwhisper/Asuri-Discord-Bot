import { InteractionResponseType, InteractionResponseFlags } from 'discord-interactions';
import { DiscordRequest, isChallengeChannel } from '../utils.js';
import 'dotenv/config'; // Import dotenv to access APP_ID

export const solved = {
    name: 'solved',
    description: '将当前题目频道标记为已解决并重命名。',
    integration_types: [0], // Guild install only
    contexts: [0], // Guild context only
    execute: async (req, res) => {
        const guildId = req.body.guild_id;
        const channelId = req.body.channel_id;
        const member = req.body.member; // For logging or confirmation message
        const appId = process.env.APP_ID; // Get bot's App ID

        // This command must be run in a server channel
        if (!guildId) {
            return res.send({
                type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: {
                    content: '❌ 此命令只能在服务器频道中使用。',
                    flags: InteractionResponseFlags.EPHEMERAL,
                },
            });
        }

        try {
            // 1. Get the current channel's details
            const currentChannel = await DiscordRequest(`/channels/${channelId}`, { method: 'GET' });

            if (!currentChannel || typeof currentChannel !== 'object') {
                throw new Error('无法获取当前频道信息。');
            }

            // 2. Check if it's a challenge channel using the function from utils.js
            if (!isChallengeChannel(currentChannel)) {
                return res.send({
                    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                    data: {
                        content: '❌ 此命令只能在标记为 "[CHALLENGE]" 的题目频道中使用。',
                        flags: InteractionResponseFlags.EPHEMERAL,
                    },
                });
            }

            // --- Fetch Contributors from Pinned Message ---
            let contributorsString = '';
            try {
                const pinnedMessages = await DiscordRequest(`/channels/${channelId}/pins`, { method: 'GET' });
                let welcomeMessageEmbed = null;

                if (pinnedMessages && Array.isArray(pinnedMessages)) {
                    for (const pinnedMsg of pinnedMessages) {
                        // Find the message pinned by our bot with the specific embed structure
                        if (pinnedMsg.author.id === appId && pinnedMsg.embeds && pinnedMsg.embeds.length > 0 && pinnedMsg.embeds[0].title?.startsWith('欢迎来到题目')) {
                            welcomeMessageEmbed = pinnedMsg.embeds[0];
                            break;
                        }
                    }
                }

                if (welcomeMessageEmbed) {
                    const contributorField = welcomeMessageEmbed.fields?.find(field => field.name === '当前贡献者名单');
                    if (contributorField && contributorField.value !== '无') {
                        contributorsString = contributorField.value; // Get the list like "xxx、xxx"
                    }
                } else {
                    console.warn(`[solved] Could not find the pinned welcome message in channel ${channelId} to extract contributors.`);
                }
            } catch (pinError) {
                console.error(`[solved] Error fetching or parsing pinned messages in channel ${channelId}:`, pinError);
                // Proceed without contributor list if fetching fails
            }
            // --- End Fetch Contributors ---

            // 3. Construct the new name
            const originalName = currentChannel.name;
            let newName = `solved-${originalName}`;

            // Ensure the new name doesn't exceed Discord's 100 character limit
            if (newName.length > 100) {
                // Truncate the original name part to fit "solved-" prefix
                const availableLength = 100 - 'solved-'.length;
                newName = `solved-${originalName.substring(0, availableLength)}`;
            }

            // Ensure the name doesn't already start with solved- to prevent solved-solved-...
            if (originalName.startsWith('solved-')) {
                return res.send({
                    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                    data: {
                        content: '❌ 此频道似乎已经被标记为已解决。',
                        flags: InteractionResponseFlags.EPHEMERAL,
                    },
                });
            }

            // 4. Modify the channel using PATCH request
            const updatedChannelData = {
                name: newName,
            };

            await DiscordRequest(`/channels/${channelId}`, {
                method: 'PATCH',
                body: updatedChannelData,
            });

            // 5. Send confirmation message
            let description = `🎉 恭喜！题目「${originalName}」已被 <@${member.user.id}> 标记为解出！。`;
            // Append contributor thank you message if contributors were found
            if (contributorsString) {
                description += `\n\n感谢以下成员的付出：${contributorsString}`;
            }

            const confirmationEmbed = {
                color: 0x9C27B0, // Purple color for solved
                title: '🏆 题目已解决',
                description: description, // Use the combined description
                timestamp: new Date().toISOString(),
            };

            return res.send({
                type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: {
                    embeds: [confirmationEmbed],
                },
            });

        } catch (error) {
            console.error('执行 /solved 命令时出错:', error);
            let errorMessage = `❌ 标记频道为已解决时发生错误。`;
            if (error.message && (error.message.includes('403') || error.message.includes('Missing Permissions'))) {
                errorMessage += '\n请确保机器人拥有修改此频道的权限 (`MANAGE_CHANNELS`)。';
            } else if (error.responseBody && error.responseBody.message) {
                errorMessage += `\n错误详情: ${error.responseBody.message}`;
            } else if (error.message) {
                errorMessage += `\n错误详情: ${error.message}`;
            }

            // Send an ephemeral error message back to the user
            return res.send({
                type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: {
                    content: errorMessage,
                    flags: InteractionResponseFlags.EPHEMERAL,
                },
            });
        }
    },
};