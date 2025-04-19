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


// --- Export and Installation ---

// Array containing all command definitions
export const ALL_COMMANDS = [TEST_COMMAND, PING_COMMAND, INFO_COMMAND, HELP_COMMAND]; // Add HELP_COMMAND here

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