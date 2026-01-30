import fetch from 'node-fetch';
import { getTwitchAppToken } from './twitchAuth.js';
import dotenv from 'dotenv';
dotenv.config();

export async function subscribeTwitchStreamer(userId) {
  const token = await getTwitchAppToken();
  const callback = process.env.TWITCH_CALLBACK_URL;
  const webhookSecret = process.env.TWITCH_WEBHOOK_SECRET;

  for (const type of ['stream.online', 'stream.offline']) {
    try {
      const res = await fetch('https://api.twitch.tv/helix/eventsub/subscriptions', {
        method: 'POST',
        headers: {
          'Client-ID': process.env.TWITCH_CLIENT_ID,
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type,
          version: '1',
          condition: { broadcaster_user_id: userId },
          transport: { method: 'webhook', callback, secret: webhookSecret }
        })
      });

      const data = await res.json();
      console.log(`📩 Twitch subscription (${type}) response for ${userId}:`, data);

      if (!res.ok) {
        console.error(`❌ Failed to subscribe ${userId} for ${type}:`, data);
      }
    } catch (err) {
      console.error(`❌ Error subscribing ${userId} for ${type}:`, err);
    }
  }
}
