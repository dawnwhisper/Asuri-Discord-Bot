import {
    InteractionResponseType,
    InteractionResponseFlags,
} from 'discord-interactions';
import { getUserCost } from '../utils.js'; // Import the cost reading function
import fs from 'fs/promises'; // Need fs promises for reading directory
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const costsDir = path.join(__dirname, '..', 'data', 'user_costs'); // Path relative to this file

// --- Handler for 'check' subcommand ---
async function handleCheckSubcommand(req, res, user) {
    if (!user?.id) {
        return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: { content: '❌ 无法识别您的用户身份。', flags: InteractionResponseFlags.EPHEMERAL },
        });
    }

    try {
        const totalCost = await getUserCost(user.id);
        const formattedCost = totalCost.toFixed(6);

        return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
                content: `💰 <@${user.id}>，您当前累计的 AI 调用费用约为：¥${formattedCost}`,
                flags: InteractionResponseFlags.EPHEMERAL,
                allowed_mentions: { parse: [] }
            },
        });
    } catch (error) {
        console.error(`Error fetching cost for user ${user.id}:`, error);
        return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: { content: '❌ 查询费用时出错，请稍后再试。', flags: InteractionResponseFlags.EPHEMERAL },
        });
    }
}

// --- Handler for 'all' subcommand ---
async function handleAllSubcommand(req, res) {
    // TODO: Add permission check here - only allow specific users/roles

    try {
        await fs.access(costsDir); // Check if directory exists
        const files = await fs.readdir(costsDir);
        const jsonFiles = files.filter(file => file.endsWith('.json'));

        if (jsonFiles.length === 0) {
            return res.send({
                type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: { content: 'ℹ️ 暂无任何用户的费用记录。', flags: InteractionResponseFlags.EPHEMERAL },
            });
        }

        const costPromises = jsonFiles.map(async (file) => {
            const userId = path.basename(file, '.json');
            if (!/^\d+$/.test(userId)) { // Basic validation for user ID format
                 console.warn(`Skipping invalid filename in costs directory: ${file}`);
                 return null;
            }
            const cost = await getUserCost(userId);
            return { userId, cost };
        });

        const results = (await Promise.all(costPromises)).filter(r => r !== null); // Filter out nulls from invalid filenames

        // Sort results by cost descending
        results.sort((a, b) => b.cost - a.cost);

        let totalOverallCost = 0;
        const summaryLines = results.map(r => {
            totalOverallCost += r.cost;
            // Attempt to mention user, fallback to ID if mention fails or is too long
            // Mentions might not work well in ephemeral messages or across servers
            return `<@${r.userId}> : ¥${r.cost.toFixed(6)}`;
        });

        // Discord message length limit is 2000 characters
        let messageContent = `📊 **所有用户 AI 费用汇总** (共 ${results.length} 人):\n\n`;
        messageContent += summaryLines.join('\n');
        messageContent += `\n\n**总计:** ¥${totalOverallCost.toFixed(6)}`;

        if (messageContent.length > 2000) {
            messageContent = messageContent.substring(0, 1990) + '\n...（内容过长已截断）';
        }

        return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
                content: messageContent,
                flags: InteractionResponseFlags.EPHEMERAL, // Keep summary private by default
                allowed_mentions: { parse: [] } // Avoid pinging everyone
            },
        });

    } catch (error) {
        if (error.code === 'ENOENT') {
             return res.send({
                type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: { content: 'ℹ️ 暂无任何用户的费用记录。', flags: InteractionResponseFlags.EPHEMERAL },
            });
        }
        console.error(`Error handling /money all:`, error);
        return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: { content: '❌ 查询所有用户费用时出错。', flags: InteractionResponseFlags.EPHEMERAL },
        });
    }
}


export const money = {
    name: 'money',
    description: '查询 AI 调用费用。',
    // options defined in commands.js
    integration_types: [0, 1],
    contexts: [0, 1, 2],
    execute: async (req, res) => {
        const subcommand = req.body.data.options[0];
        const user = req.body.member?.user ?? req.body.user;

        switch (subcommand.name) {
            case 'check':
                return await handleCheckSubcommand(req, res, user);
            case 'all':
                // Consider adding permission checks before calling
                return await handleAllSubcommand(req, res);
            default:
                console.error(`Unknown money subcommand: ${subcommand.name}`);
                return res.send({
                    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                    data: { content: '❌ 未知的子命令。', flags: InteractionResponseFlags.EPHEMERAL },
                });
        }
    },
};
