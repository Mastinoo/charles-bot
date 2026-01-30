import fetch from 'node-fetch';
import dotenv from 'dotenv';
dotenv.config();

let token = null;
let expiresAt = 0;

export async function getTwitchAppToken() {
  const now = Date.now();
  if (token && now < expiresAt) return token;

  const res = await fetch(`https://id.twitch.tv/oauth2/token?client_id=${process.env.TWITCH_CLIENT_ID}&client_secret=${process.env.TWITCH_CLIENT_SECRET}&grant_type=client_credentials`, { method: 'POST' });
  const data = await res.json();
  token = data.access_token;
  expiresAt = now + data.expires_in * 1000 - 60_000;
  return token;
}

export async function getTwitchUserId(username) {
  const token = await getTwitchAppToken();
  const res = await fetch(`https://api.twitch.tv/helix/users?login=${username}`, {
    headers: { 'Client-ID': process.env.TWITCH_CLIENT_ID, 'Authorization': `Bearer ${token}` }
  });
  const data = await res.json();
  return data.data?.[0]?.id || null;
}

