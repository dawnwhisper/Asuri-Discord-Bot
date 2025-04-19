import { InteractionResponseType } from 'discord-interactions';
import { ALL_COMMANDS } from '../commands.js'; // Assuming ALL_COMMANDS is exported from commands.js

export const help = {
    name: 'help',
    description: '显示所有命令或特定命令的帮助信息。',
    integration_types: [0, 1],
    contexts: [0, 1, 2],
    // The actual definition with options is in commands.js
    execute: async (req, res) => {
        const options = req.body.data.options;
        const commandOption = options?.find(opt => opt.name === 'command');
        const requestedCommandName = commandOption?.value;

        const footerUser = req.body.member?.user ?? req.body.user; // Get user info correctly for guild/DM
        const footerText = `请求者: ${footerUser?.username ?? '未知用户'}${footerUser?.discriminator === '0' ? '' : `#${footerUser?.discriminator}`}`; // Handle new username system
        const footerIcon = footerUser?.avatar ? `https://cdn.discordapp.com/avatars/${footerUser.id}/${footerUser.avatar}.png` : null;


        let embed;

        if (requestedCommandName) {
            // User requested help for a specific command
            const command = ALL_COMMANDS.find(cmd => cmd.name.toLowerCase() === requestedCommandName.toLowerCase());

            if (command) {
                // Found the command, display its details
                embed = {
                    color: 0x2196F3, // Blue color for specific help
                    title: `命令帮助: /${command.name}`,
                    description: command.description || '该命令没有提供描述。',
                    fields: [], // Initialize fields array
                    timestamp: new Date().toISOString(),
                    footer: { text: footerText, icon_url: footerIcon },
                };

                // Add options if they exist in the command definition
                if (command.options && command.options.length > 0) {
                        embed.fields.push({
                                name: '参数 (Options)',
                                value: command.options.map(opt => `\`${opt.name}\`: ${opt.description} ${opt.required ? '(必需)' : '(可选)'}`).join('\n'),
                                inline: false,
                        });
                }

                // // Add contexts if defined
                // if (command.contexts) {
                //         const contextMap = { 0: '服务器', 1: '机器人私聊', 2: '私人群组' };
                //         const contextString = command.contexts.map(c => contextMap[c] || `未知 (${c})`).join(', ');
                //         embed.fields.push({ name: '可用环境', value: contextString, inline: true });
                // }
                // // Add integration types if defined
                // if (command.integration_types) {
                //         const integrationMap = { 0: '服务器安装', 1: '用户安装' };
                //         const integrationString = command.integration_types.map(i => integrationMap[i] || `未知 (${i})`).join(', ');
                //         embed.fields.push({ name: '安装类型', value: integrationString, inline: true });
                // }


            } else {
                // Command not found
                embed = {
                    color: 0xF44336, // Red color for error
                    title: '错误',
                    description: `未找到名为 \`/${requestedCommandName}\` 的命令。请使用 \`/help\` 查看所有可用命令。`,
                    timestamp: new Date().toISOString(),
                    footer: { text: footerText, icon_url: footerIcon },
                };
            }
        } else {
            // No specific command requested, list all commands (excluding help itself)
            const availableCommands = ALL_COMMANDS.filter(cmd => cmd.name !== 'help');
            embed = {
                color: 0x4CAF50, // Green color for general help
                title: '帮助菜单 - 可用命令',
                description: '以下是您可以使用的所有命令。\n要获取特定命令的详细信息，请使用 `/help command:<命令名称>`。\n\n',
                fields: availableCommands.map(cmd => ({
                    name: `/${cmd.name}`,
                    value: cmd.description || '无描述',
                    inline: false,
                })),
                timestamp: new Date().toISOString(),
                footer: { text: footerText, icon_url: footerIcon },
            };
            if (availableCommands.length === 0) {
                embed.description += '_当前没有其他可用命令。_';
            }
        }

        return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
                embeds: [embed],
            },
        });
    },
};