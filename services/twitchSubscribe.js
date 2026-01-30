import fetch from 'node-fetch';
import { getTwitchAppToken } from './twitchAuth.js';
import dotenv from 'dotenv';
dotenv.config();

export async function subscribeTwitchStreamer(userId) {
  const token = await getTwitchAppToken();
  const callback = process.env.TWITCH_CALLBACK_URL;

  for (const type of ['stream.online','stream.offline']) {
    await fetch('https://api.twitch.tv/helix/eventsub/subscriptions', {
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
        transport: { method: 'webhook', callback, secret: process.env.TWITCH_CLIENT_SECRET }
      })
    });
  }
}

