import 'dotenv/config';
import express from 'express';
import {
  InteractionType,
  InteractionResponseType,
  InteractionResponseFlags,
  verifyKeyMiddleware,
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

// Determine __dirname equivalent in ES module scope
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create an express app
const app = express();
// Get port, or default to 3000
const PORT = process.env.PORT || 3000;
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

/**
 * Interactions endpoint URL where Discord will send HTTP requests
 * Parse request body and verifies incoming requests using discord-interactions package
 */
app.post('/interactions', verifyKeyMiddleware(process.env.PUBLIC_KEY), async function (req, res) {
  const { type, id, data, member, channel_id, message, token } = req.body;

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
    const command = commands[name];

    if (!command) {
      console.error(`Unknown command: ${name}`);
      return res.status(400).json({ error: 'Unknown command' });
    }

    try {
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
   * Handle Message Component interactions (Buttons!)
   */
  if (type === InteractionType.MESSAGE_COMPONENT) {
    const { custom_id } = data;
    const userId = member?.user?.id;
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

    if (custom_id === 'view_contributors_info') {
        return await handleViewContributorsInfo(req, res, channel_id);
    }

    if (custom_id === 'add_contributor') {
        return await handleAddContributor(req, res, channel_id, userId, token, appId);
    }

    if (custom_id === 'cancel_contribution') {
        return await handleCancelContribution(req, res);
    }

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

  console.error('Unknown interaction type', type);
  if (!res.headersSent) {
    return res.status(400).json({ error: 'Unknown interaction type' });
  }
});

app.listen(PORT, () => {
  console.log('Listening on port', PORT);
  console.log(`Loaded commands: ${Object.keys(commands).join(', ')}`);
});
