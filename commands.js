import 'dotenv/config';
import { InstallGlobalCommands } from './utils.js';

// Simple test command
const TEST_COMMAND = {
    name: 'test',
    description: '测试指令',
    type: 1,
    integration_types: [0, 1],
    contexts: [0, 1, 2],
};

// Ping
const PING_COMMAND = {
    name: 'ping',
    description: '测试延迟',
    type: 1,
    integration_types: [0, 1],
    contexts: [0, 1, 2],
};

const ALL_COMMANDS = [TEST_COMMAND, PING_COMMAND];

InstallGlobalCommands(process.env.APP_ID, ALL_COMMANDS);
