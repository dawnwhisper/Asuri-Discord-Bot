import 'dotenv/config';
import { DiscordRequest, InstallGlobalCommands } from './utils.js'; // Ensure InstallGlobalCommands is imported if used directly here

// --- Command Definitions ---

// Simple test command
const TEST_COMMAND = {
  name: 'test',
  description: '基础测试指令',
  type: 1,
  integration_types: [0, 1],
  contexts: [0, 1, 2],
};

// Ping command definition
const PING_COMMAND = {
    name: 'ping',
    description: '计算并显示机器人和 API 延迟。',
    type: 1,
    integration_types: [0, 1],
    contexts: [0, 1, 2],
};

// Info command definition
const INFO_COMMAND = {
    name: 'info',
    description: '显示有关机器人的信息。',
    type: 1,
    integration_types: [0, 1],
    contexts: [0, 1, 2],
};

// Help command definition
const HELP_COMMAND = {
    name: 'help',
    description: '显示所有命令或特定命令的帮助信息。',
    type: 1,
    integration_types: [0, 1],
    contexts: [0, 1, 2],
    options: [ // Added options array
        {
            name: 'command', // Option name
            description: '要获取帮助的特定命令的名称', // Option description
            type: 3, // STRING type
            required: false, // Make it optional
            // If you want autocomplete, you can add choices later based on ALL_COMMANDS
            // choices: ALL_COMMANDS.map(cmd => ({ name: cmd.name, value: cmd.name }))
        }
    ]
};

// New Challenge command definition
const NEWCHALLENGE_COMMAND = {
    name: 'newchallenge',
    description: '在当前分类下创建一个新的题目频道。',
    type: 1, // CHAT_INPUT
    options: [
        {
            name: 'name',
            description: '新题目的名称 (将作为频道名)',
            type: 3, // STRING
            required: true,
        },
    ],
    integration_types: [0], // Guild install only
    contexts: [0], // Guild context only
};

// Solved command definition
const SOLVED_COMMAND = {
    name: 'solved',
    description: '将当前题目频道标记为已解决并重命名。',
    type: 1, // CHAT_INPUT
    integration_types: [0], // Guild install only
    contexts: [0], // Guild context only
    // No options needed for this command
};

// Chat command definition with subcommands
const CHAT_COMMAND = {
    name: 'chat',
    description: '与 AI 进行对话或配置 AI。', // Updated description
    type: 1, // CHAT_INPUT
    integration_types: [0, 1],
    contexts: [0, 1, 2],
    options: [
        { // Default chat interaction (now a subcommand)
            name: 'ask', // Renamed from implicit root command
            description: '与 AI 进行对话（可附带文件）。',
            type: 1, // SUB_COMMAND
            options: [ // Options moved under the subcommand
                {
                    name: 'prompt',
                    description: '您想对 AI 说的话',
                    type: 3, // STRING
                    required: true,
                },
                {
                    name: 'attachment',
                    description: '上传文件进行提问 (可选)',
                    type: 11, // ATTACHMENT
                    required: false,
                }
            ],
        },
        { // Config subcommand
            name: 'config',
            description: '配置聊天 AI 的提供商和模型。',
            type: 1, // SUB_COMMAND
            // No options needed for the config subcommand itself
        }
    ],
};

// Money command definition with subcommands
const MONEY_COMMAND = {
    name: 'money',
    description: '查询 AI 调用费用。', // Updated description
    type: 1, // CHAT_INPUT
    integration_types: [0, 1],
    contexts: [0, 1, 2],
    options: [
        {
            name: 'check',
            description: '查询您自己已产生的 AI 调用费用。',
            type: 1, // SUB_COMMAND
        },
        {
            name: 'all',
            description: '查询所有用户的 AI 调用费用汇总 (仅部分用户可见)。', // Added description about visibility
            type: 1, // SUB_COMMAND
            // Add permission checks later if needed
        }
    ],
};

// --- Export and Installation ---

// Array containing all command definitions
export const ALL_COMMANDS = [
    TEST_COMMAND,
    PING_COMMAND,
    INFO_COMMAND,
    HELP_COMMAND,
    NEWCHALLENGE_COMMAND,
    SOLVED_COMMAND,
    CHAT_COMMAND,
    MONEY_COMMAND, // Add the money command
];

// Function to install commands (usually called via 'node commands.js')
async function installCommands() {
    const appId = process.env.APP_ID;
    if (!appId) {
        console.error("Error: APP_ID is not defined in your .env file.");
        process.exit(1); // Exit if APP_ID is missing
    }
    console.log(`Installing ${ALL_COMMANDS.length} commands for App ID: ${appId}`);
    await InstallGlobalCommands(appId, ALL_COMMANDS);
}

// Execute the installation if this script is run directly
// Check if the module is the main module
if (import.meta.url === `file://${process.argv[1]}`) {
    installCommands().catch(error => {
        console.error("Failed to install commands:", error);
        process.exit(1);
    });
}

// Note: If you were previously calling InstallGlobalCommands directly with an array,
// ensure it now uses the ALL_COMMANDS export or this installCommands function.