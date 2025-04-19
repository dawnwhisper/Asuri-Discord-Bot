import {
    InteractionResponseType,
    InteractionResponseFlags,
    MessageComponentTypes,
    ButtonStyleTypes,
} from 'discord-interactions';
import { DiscordRequest, isChallengeChannel } from '../utils.js';

/**
 * Handles the 'view_contributors_info' button interaction.
 * Prompts the user if they want to be added to the contributors list.
 * @param {object} req - The request object from Express.
 * @param {object} res - The response object from Express.
 * @param {string} channel_id - The ID of the channel where the interaction occurred.
 */
export async function handleViewContributorsInfo(req, res, channel_id) {
    try {
        const channel = await DiscordRequest(`/channels/${channel_id}`, { method: 'GET' });
        if (!isChallengeChannel(channel)) {
            return res.send({
                type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: {
                    content: '❌ 此按钮只能在题目频道中使用。',
                    flags: InteractionResponseFlags.EPHEMERAL,
                },
            });
        }

        return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
                content: '是否将自己添加至贡献列表？',
                flags: InteractionResponseFlags.EPHEMERAL,
                components: [
                    {
                        type: MessageComponentTypes.ACTION_ROW,
                        components: [
                            {
                                type: MessageComponentTypes.BUTTON,
                                custom_id: 'add_contributor',
                                label: '是',
                                style: ButtonStyleTypes.SUCCESS,
                            },
                            {
                                type: MessageComponentTypes.BUTTON,
                                custom_id: 'cancel_contribution',
                                label: '不再显示',
                                style: ButtonStyleTypes.SECONDARY,
                            },
                        ],
                    },
                ],
            },
        });
    } catch (error) {
        console.error("Error handling 'view_contributors_info':", error);
        return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: { content: '处理按钮点击时出错。', flags: InteractionResponseFlags.EPHEMERAL },
        });
    }
}

/**
 * Handles the 'add_contributor' button interaction.
 * Adds the interacting user to the pinned welcome message's contributor list.
 * @param {object} req - The request object from Express.
 * @param {object} res - The response object from Express.
 * @param {string} channel_id - The ID of the channel where the interaction occurred.
 * @param {string} userId - The ID of the user who interacted.
 * @param {string} token - The interaction token.
 * @param {string} appId - The application ID.
 */
export async function handleAddContributor(req, res, channel_id, userId, token, appId) {
    try {
        // Defer the update first
        await res.send({ type: InteractionResponseType.DEFERRED_UPDATE_MESSAGE });

        const channel = await DiscordRequest(`/channels/${channel_id}`, { method: 'GET' });
        if (!isChallengeChannel(channel)) {
            await DiscordRequest(`/webhooks/${appId}/${token}/messages/@original`, {
                method: 'PATCH',
                body: { content: '❌ 此操作只能在题目频道中进行。', components: [] }
            });
            return;
        }

        const pinnedMessages = await DiscordRequest(`/channels/${channel_id}/pins`, { method: 'GET' });
        let welcomeMessage = null;
        let originalEmbed = null;

        if (pinnedMessages && Array.isArray(pinnedMessages)) {
            for (const pinnedMsg of pinnedMessages) {
                if (pinnedMsg.author.id === appId && pinnedMsg.embeds && pinnedMsg.embeds.length > 0 && pinnedMsg.embeds[0].title?.startsWith('欢迎来到题目')) {
                    welcomeMessage = pinnedMsg;
                    originalEmbed = pinnedMsg.embeds[0];
                    break;
                }
            }
        }

        if (!welcomeMessage || !originalEmbed) {
            console.error(`[add_contributor] Could not find the pinned welcome message in channel ${channel_id}`);
             await DiscordRequest(`/webhooks/${appId}/${token}/messages/@original`, {
                method: 'PATCH',
                body: { content: '❌ 无法找到原始的欢迎/贡献者消息。', components: [] }
            });
            return;
        }

        const contributorFieldIndex = originalEmbed.fields?.findIndex(field => field.name === '当前贡献者名单');
        if (contributorFieldIndex === -1 || !originalEmbed.fields) {
             console.error(`[add_contributor] Could not find contributor field in embed for message ${welcomeMessage.id}`);
             await DiscordRequest(`/webhooks/${appId}/${token}/messages/@original`, {
                method: 'PATCH',
                body: { content: '❌ 无法处理贡献者列表（字段丢失）。', components: [] }
            });
            return;
        }

        let contributors = originalEmbed.fields[contributorFieldIndex].value;
        const userMention = `<@${userId}>`;

        if (contributors.includes(userMention)) {
             await DiscordRequest(`/webhooks/${appId}/${token}/messages/@original`, {
                method: 'PATCH',
                body: { content: 'ℹ️ 您已在贡献列表中。', components: [] }
            });
            return;
        }

        if (contributors === '无') {
            contributors = userMention;
        } else {
            // Use a consistent separator like '、'
            const contributorList = contributors.split('、').map(c => c.trim()).filter(c => c);
            contributorList.push(userMention);
            contributors = contributorList.join('、');
        }

        originalEmbed.fields[contributorFieldIndex].value = contributors;

        // Edit the original pinned message
        await DiscordRequest(`/channels/${channel_id}/messages/${welcomeMessage.id}`, {
            method: 'PATCH',
            body: { embeds: [originalEmbed] },
        });

        const originalChallengeName = channel.topic?.replace('[CHALLENGE]', '').trim() || channel.name;

        // Send a public follow-up confirmation
        await DiscordRequest(`/webhooks/${appId}/${token}`, {
            method: 'POST',
            body: {
                content: `✅ ${userMention} 已添加到题目 **${originalChallengeName}** 的贡献列表！`,
                // Make this message visible to everyone
                // flags: InteractionResponseFlags.EPHEMERAL // Remove this line or set to 0 for public
            },
        });

    } catch (error) {
        console.error("Error handling 'add_contributor':", error);
         try {
             // Send an ephemeral follow-up error message
             await DiscordRequest(`/webhooks/${appId}/${token}`, {
                 method: 'POST',
                 body: { content: '处理添加贡献者时出错。', flags: InteractionResponseFlags.EPHEMERAL }
             });
         } catch (followupError) {
             console.error("Failed to send followup error for add_contributor:", followupError);
         }
    }
}

/**
 * Handles the 'cancel_contribution' button interaction.
 * Sends an ephemeral message indicating cancellation.
 * @param {object} req - The request object from Express.
 * @param {object} res - The response object from Express.
 */
export async function handleCancelContribution(req, res) {
    return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
            content: '❎ 已取消添加到贡献列表，不再提示。',
            flags: InteractionResponseFlags.EPHEMERAL,
        },
    });
}
