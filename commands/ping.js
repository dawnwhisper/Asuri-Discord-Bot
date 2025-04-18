import { InteractionResponseType } from 'discord-interactions';
import { DiscordRequest } from '../utils.js'; // 确保从正确的路径导入

// Discord epoch (2015-01-01T00:00:00.000Z)
const DISCORD_EPOCH = 1420070400000;

/**
 * 将 Discord Snowflake ID 转换为 Unix 时间戳 (毫秒)
 * @param {string} snowflake - Discord Snowflake ID.
 * @returns {number | null} - Unix timestamp in milliseconds or null if conversion fails.
 */
function snowflakeToTimestamp(snowflake) {
  try {
    // 将字符串转换为 BigInt
    const idBigInt = BigInt(snowflake);
    // 右移 22 位获取时间戳部分 (相对于 Discord Epoch)
    const timestampBigInt = idBigInt >> 22n;
    // 加上 Discord Epoch 得到 Unix 时间戳
    return Number(timestampBigInt) + DISCORD_EPOCH;
  } catch (e) {
    console.error("Error converting snowflake to timestamp:", e);
    return null;
  }
}

export const ping = {
  name: 'ping',
  description: '计算并显示机器人和 API 延迟。',
  execute: async (req, res) => {
    const interactionId = req.body.id;
    const interactionToken = req.body.token;
    const applicationId = process.env.APP_ID; // 确保 .env 文件中有 APP_ID

    if (!applicationId) {
        console.error("APP_ID is not defined in environment variables.");
        // Send an immediate error response if APP_ID is missing
         return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
                content: '机器人配置错误，无法计算延迟。 (Missing APP_ID)',
                flags: 64 // Ephemeral message
            },
         });
    }

    // 1. 计算机器人延迟
    const interactionTimestamp = snowflakeToTimestamp(interactionId);
    const processingTimestamp = Date.now();
    let botLatency = 'N/A';
    if (interactionTimestamp) {
      botLatency = `${processingTimestamp - interactionTimestamp}ms`;
    } else {
       console.warn("无法从 ID 计算交互时间戳:", interactionId);
    }

    // 2. 发送初始 "Thinking..." 响应 (Deferred)
    // 必须先发送这个，才能后续编辑消息
    await res.send({ type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE });

    // 3. 测量编辑响应所需的时间 (作为 API 延迟的估算)
    const t1 = Date.now();
    const endpoint = `/webhooks/${applicationId}/${interactionToken}/messages/@original`;
    const initialContent = `🏓 Pong!\n延迟: ${botLatency} | API延迟: 计算中...`;

    try {
      // 第一次编辑，包含机器人延迟，显示 API 延迟正在计算
      await DiscordRequest(endpoint, {
        method: 'PATCH',
        body: { content: initialContent },
      });

      // 计算编辑操作耗时
      const t2 = Date.now();
      const apiLatency = `${t2 - t1}ms`;

      // 最终编辑，包含两种延迟
      const finalContent = `🏓 Pong!\n延迟: ${botLatency} | API延迟: ${apiLatency}`;
      await DiscordRequest(endpoint, {
        method: 'PATCH',
        body: { content: finalContent },
      });

    } catch (err) {
      console.error('发送后续消息时出错:', err);
      // 如果编辑失败，尝试发送一条错误消息
      try {
         await DiscordRequest(endpoint, {
           method: 'PATCH',
           body: { content: '计算延迟时出错。' },
         });
      } catch (finalErr) {
         console.error('发送最终错误消息时出错:', finalErr);
      }
    }
    // 由于我们已经发送了 deferred response 并通过 followup 编辑了它，
    // 这里不需要再返回任何东西给 express 的 res 对象。
  },
};
