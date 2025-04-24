import { InteractionResponseType } from 'discord-interactions';
import { DiscordRequest } from '../utils.js';
import process from 'process'; // For uptime and Node.js version

/**
 * Formats seconds into a human-readable uptime string (d h m s).
 * @param {number} totalSeconds - Total seconds to format.
 * @returns {string} Formatted uptime string.
 */
function formatUptime(totalSeconds) {
    const days = Math.floor(totalSeconds / (3600 * 24));
    totalSeconds %= 3600 * 24;
    const hours = Math.floor(totalSeconds / 3600);
    totalSeconds %= 3600;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.floor(totalSeconds % 60);

    let uptime = '';
    if (days > 0) uptime += `${days}天 `;
    if (hours > 0) uptime += `${hours}小时 `;
    if (minutes > 0) uptime += `${minutes}分钟 `;
    uptime += `${seconds}秒`;

    return uptime.trim();
}

export const info = {
    name: 'info',
    description: '显示有关机器人的信息。',
    execute: async (req, res) => {
        const applicationId = process.env.APP_ID;

        if (!applicationId) {
            console.error("APP_ID is not defined in environment variables.");
            return res.send({
                type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: {
                    content: '机器人配置错误，无法获取信息 (Missing APP_ID)',
                    flags: 64 // Ephemeral message
                },
            });
        }

        try {
            // Fetch bot's own user information
            // DiscordRequest now returns parsed JSON or the raw response
            const botUserResponse = await DiscordRequest('/users/@me', { method: 'GET' });
            // Check if the response was successful and has a body (DiscordRequest might return raw response on non-JSON)
            let botUser;
             if (botUserResponse && typeof botUserResponse === 'object' && botUserResponse.id) {
                     botUser = botUserResponse;
             } else {
                     // Attempt to parse if it looks like a Response object (e.g., from retry logic returning raw)
                     try {
                             if (botUserResponse && typeof botUserResponse.json === 'function') {
                                     botUser = await botUserResponse.json();
                             } else {
                                     throw new Error("Invalid response format received for bot user data.");
                             }
                     } catch(parseError) {
                                console.error('Failed to parse bot user response:', parseError);
                                throw new Error('无法解析机器人用户信息。');
                     }
             }


            // Calculate uptime
            const uptimeSeconds = Math.floor(process.uptime());
            const formattedUptime = formatUptime(uptimeSeconds);

            // Construct invite link (basic permissions for slash commands)
            const githubLink = "https://github.com/dawnwhisper/Asuri-Discord-Bot";

            // Build the embed message
            const embed = {
                color: 0x7289DA, // Discord Blurple
                title: `关于 ${botUser.username}#${botUser.discriminator}`,
                thumbnail: {
                    url: botUser.avatar ? `https://cdn.discordapp.com/avatars/${botUser.id}/${botUser.avatar}.png` : null, // Handle no avatar case
                },
                fields: [
                    { name: '🤖 机器人标签', value: `\`${botUser.username}#${botUser.discriminator}\``, inline: true },
                    // { name: '🆔 机器人 ID', value: `\`${botUser.id}\``, inline: true },
                    { name: '⏳ 运行时间', value: formattedUptime, inline: true },
                    { name: '🛠️ 开发人员', value: 'Dawn-whisper', inline: true },
                    { name: '📦 Node.js 版本', value: process.version, inline: true },
                    // Placeholder for server count - requires specific intents/logic
                    // { name: '🌐 服务器数量', value: 'N/A', inline: true },
                    // Optional: Add a link to your bot's support server or GitHub repository
                    // { name: '❓ 支持服务器', value: '[加入](your-invite-link)', inline: true },
                    { name: '💻 GITHUB', value: `[查看源码](${githubLink})`, inline: true },
                ],
                timestamp: new Date().toISOString(),
                footer: {
                    text: `请求者: ${req.body.member.user.username}#${req.body.member.user.discriminator}`,
                    icon_url: req.body.member.user.avatar ? `https://cdn.discordapp.com/avatars/${req.body.member.user.id}/${req.body.member.user.avatar}.png` : null,
                },
            };

            // Send the response with the embed
            return res.send({
                type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: {
                    embeds: [embed],
                },
            });

        } catch (error) {
            console.error('执行 /info 命令时出错:', error);
            // Send an ephemeral error message back to the user
            return res.send({
                type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: {
                    content: `❌ 获取机器人信息时发生错误: ${error.message}`,
                    flags: 64 // Ephemeral (only visible to the user who issued the command)
                }
            });
        }
    },
};