import 'dotenv/config';
import express from 'express';
import {
  InteractionResponseType,
  InteractionType,
  verifyKeyMiddleware,
} from 'discord-interactions';
import { DiscordRequest } from './utils.js';
import { getShuffledOptions, getResult } from './game.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

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
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  // Use dynamic import for ES modules
  const commandModule = await import(filePath);
  // Assuming each command file exports an object with name and execute properties
  // Adjust based on your actual export structure (e.g., default export)
  const commandName = Object.keys(commandModule)[0]; // Get the exported variable name
  if (commandModule[commandName] && commandModule[commandName].name && commandModule[commandName].execute) {
    commands[commandModule[commandName].name] = commandModule[commandName];
  } else {
    console.warn(`[WARNING] The command at ${filePath} is missing a required "name" or "execute" property.`);
  }
}

/**
 * Interactions endpoint URL where Discord will send HTTP requests
 * Parse request body and verifies incoming requests using discord-interactions package
 */
app.post('/interactions', verifyKeyMiddleware(process.env.PUBLIC_KEY), async function (req, res) {
  // Interaction id, type and data
  const { type, data } = req.body;

  /**
   * Handle verification requests
   */
  if (type === InteractionType.PING) {
    return res.send({ type: InteractionResponseType.PONG });
  }

  /**
   * Handle slash command requests
   * See https://discord.com/developers/docs/interactions/application-commands#slash-commands
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
      // Send a generic error response or a more specific one if possible
      // Ensure a response is sent, otherwise the interaction will fail
      if (!res.headersSent) {
         return res.status(500).send({ 
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: { content: 'Something went wrong while executing the command.' }
         });
      }
    }
    return; // Explicitly return after handling the command or error
  }

  // ... (Keep other interaction type handlers like BUTTON, SELECT_MENU, MODAL if they exist or will be added later)

  console.error('Unknown interaction type', type);
  // Ensure a response is sent for unhandled types too
  if (!res.headersSent) {
    return res.status(400).json({ error: 'Unknown interaction type' });
  }
});

app.listen(PORT, () => {
  console.log('Listening on port', PORT);
  // Optional: Log loaded commands
  console.log(`Loaded commands: ${Object.keys(commands).join(', ')}`);
});
