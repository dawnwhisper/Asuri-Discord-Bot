import { InteractionResponseType } from 'discord-interactions';
import { getRandomEmoji } from '../utils.js';

export const test = {
    name: 'test',
    description: '基础测试指令',
    execute: async (req, res) => {
        // Send a message into the channel where command was triggered from
        return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
                // Fetches a random emoji to send from a helper function
                content: `hello world ${getRandomEmoji()}`,
            },
        });
    },
};
