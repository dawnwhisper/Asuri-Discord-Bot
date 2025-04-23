import 'dotenv/config';
import express from 'express';
import {
  InteractionType,
  InteractionResponseType,
  InteractionResponseFlags,
  verifyKeyMiddleware,
  MessageComponentTypes,
} from 'discord-interactions';
import { DiscordRequest, isChallengeChannel } from './utils.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
// Import contributor interaction handlers
import {
    handleViewContributorsInfo,
    handleAddContributor,
    handleCancelContribution
} from './interactions/contributors.js';
// Keep import for now, might be used by other modals
import { handleChatModalSubmit } from './interactions/chatHandler.js';
// Import config for select menu options
import { availableProviders } from './config/llmConfig.js';
// Update imports from chat.js
import { handleConfigSelect, handleCancelConfig } from './commands/chat.js';

// Determine __dirname equivalent in ES module scope
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create an express app
const app = express();
// Get port, or default to 3000
const PORT = process.env.PORT || 3000;
// Get status URL from environment variables
const STATUS_URL = process.env.STATUS_URL;
// To keep track of our active games
const activeGames = {};

// Load commands dynamically
const commands = {};
const commandsPath = path.join(__dirname, 'commands');
// Ensure commands directory exists
if (fs.existsSync(commandsPath)) {
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
    for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        try {
            const commandModule = await import(filePath);
            const commandName = Object.keys(commandModule)[0];
            if (commandModule[commandName] && commandModule[commandName].name && commandModule[commandName].execute) {
                commands[commandModule[commandName].name] = commandModule[commandName];
            } else {
                 // Check for discord.js style command export
                 if (commandModule.default && commandModule.default.data && commandModule.default.execute) {
                     commands[commandModule.default.data.name] = commandModule.default;
                 } else if (commandModule[commandName] && commandModule[commandName].data && commandModule[commandName].execute) {
                     commands[commandModule[commandName].data.name] = commandModule[commandName];
                 } else {
                    console.warn(`[WARNING] The command at ${filePath} is missing a required "name"/"data" or "execute" property.`);
                 }
            }
        } catch (error) {
            console.error(`Error loading command from ${filePath}:`, error);
        }
    }
} else {
    console.warn(`Commands directory not found at ${commandsPath}`);
}

// --- Heartbeat Function ---
async function sendHeartbeat() {
    if (!STATUS_URL) {
        // console.log('STATUS_URL not defined, skipping heartbeat.'); // Optional: Log if URL is not set
        return;
    }
    try {
        const response = await fetch(STATUS_URL);
        if (response.ok) {
            // console.log(`Heartbeat sent successfully at ${new Date().toISOString()}`); // Optional: Log success
        } else {
            console.warn(`Heartbeat failed with status: ${response.status} at ${new Date().toISOString()}`);
        }
    } catch (error) {
        console.error(`Error sending heartbeat at ${new Date().toISOString()}:`, error.message);
    }
}
// --- End Heartbeat Function ---

/**
 * Interactions endpoint URL where Discord will send HTTP requests
 * Parse request body and verifies incoming requests using discord-interactions package
 */
app.post('/interactions', verifyKeyMiddleware(process.env.PUBLIC_KEY), async function (req, res) {
  const { type, id, data, member, channel_id, message, token } = req.body;
  const user = member?.user ?? req.body.user; // Get user info correctly for guild/DM

  /**
   * Handle verification requests
   */
  if (type === InteractionType.PING) {
    return res.send({ type: InteractionResponseType.PONG });
  }

  /**
   * Handle slash command requests
   */
  if (type === InteractionType.APPLICATION_COMMAND) {
    const { name } = data;
    // Check if it's a subcommand interaction by looking at options[0].type
    const isSubcommand = data.options?.[0]?.type === 1 || data.options?.[0]?.type === 2; // 1: SUB_COMMAND, 2: SUB_COMMAND_GROUP

    const command = commands[name];

    if (!command) {
      console.error(`Unknown command: ${name}`);
      return res.status(400).json({ error: 'Unknown command' });
    }

    try {
      // The execute function in chat.js now handles subcommand routing internally
      await command.execute(req, res);
    } catch (error) {
      console.error(`Error executing command ${name}:`, error);
      if (!res.headersSent) {
         try {
             await res.status(500).send({
                type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: { content: '执行命令时出错。', flags: InteractionResponseFlags.EPHEMERAL }
             });
         } catch (sendError) {
             console.error("Failed to send error response:", sendError);
         }
      }
    }
    return;
  }

  /**
   * Handle Message Component interactions (Buttons, Select Menus)
   */
  if (type === InteractionType.MESSAGE_COMPONENT) {
    const { custom_id } = data;
    const userId = member?.user?.id ?? user?.id; // Ensure userId is available
    const appId = process.env.APP_ID;

    if (!userId || !appId || !channel_id || !token) {
        console.error('Missing essential data for MESSAGE_COMPONENT interaction:', { userId, appId, channel_id, token: !!token });
        if (!res.headersSent) {
            return res.status(400).send({
                type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: { content: '交互数据不完整，无法处理。', flags: InteractionResponseFlags.EPHEMERAL }
            });
        }
        return;
    }

    console.log(`[Interaction] Button clicked: ${custom_id} by User: ${userId} in Channel: ${channel_id}`);

    // --- Handler for Contributor Buttons ---
    if (custom_id === 'view_contributors_info' || custom_id === 'add_contributor' || custom_id === 'cancel_contribution') {
        if (!userId || !appId || !channel_id || !token) {
             console.error('Missing essential data for contributor interaction:', { userId, appId, channel_id, token: !!token });
             return res.status(400).send({
                 type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                 data: { content: '交互数据不完整，无法处理。', flags: InteractionResponseFlags.EPHEMERAL }
             });
        }
        console.log(`[Interaction] Contributor Button clicked: ${custom_id} by User: ${userId} in Channel: ${channel_id}`);
        if (custom_id === 'view_contributors_info') {
            return await handleViewContributorsInfo(req, res, channel_id);
        }
        if (custom_id === 'add_contributor') {
            return await handleAddContributor(req, res, channel_id, userId, token, appId);
        }
        if (custom_id === 'cancel_contribution') {
            return await handleCancelContribution(req, res);
        }
        return;
    }
    // --- End Contributor Buttons ---

    // --- Handler for Combined LLM Config Selection Menu ---
    if (custom_id === 'select_llm_config') { // Use the new custom ID
        // Handles selection and shows final public confirmation
        return await handleConfigSelect(req, res, data, custom_id);
    }
    // --- End Combined LLM Config Selection Menu ---

    // --- Handler for LLM Config Cancel Button ---
    if (custom_id === 'cancel_llm_config') {
        // Cancels the config process
        return await handleCancelConfig(req, res);
    }
    // --- End LLM Config Cancel Button ---

    console.warn('Unknown component interaction custom_id:', custom_id);
    if (!res.headersSent) {
        return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
                content: '未知的按钮交互。',
                flags: InteractionResponseFlags.EPHEMERAL,
            },
        });
    }
    return;
  }

  /**
   * Handle Modal Submit interactions
   */
  if (type === InteractionType.MODAL_SUBMIT) {
    const { custom_id } = data;
    const appId = process.env.APP_ID;

    console.warn('未知的 modal submit custom_id:', custom_id);
    if (!res.headersSent) {
        return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
                content: '未知的模态框提交。',
                flags: InteractionResponseFlags.EPHEMERAL,
            },
        });
    }
    return;
  }

  console.error('Unknown interaction type', type);
  if (!res.headersSent) {
    return res.status(400).json({ error: 'Unknown interaction type' });
  }
});

app.listen(PORT, () => {
  console.log('Listening on port', PORT);
  console.log(`Loaded commands: ${Object.keys(commands).join(', ')}`);

  // --- Start Heartbeat ---
  if (STATUS_URL) {
      console.log(`Heartbeat configured for URL: ${STATUS_URL}`);
      // Send initial heartbeat immediately
      sendHeartbeat();
      // Then send every 60 seconds
      setInterval(sendHeartbeat, 60 * 1000);
      console.log('Heartbeat service started.');
  } else {
      console.log('Heartbeat service not started (STATUS_URL not configured).');
  }
  // --- End Start Heartbeat ---
});
