import db from '../database.js';
import fetch from 'node-fetch';
import { announce, giveRole, removeRole, clearLiveMessage } from './announcer.js';

// 🔹 Fetch Twitch stream info directly via Helix API
async function fetchTwitchStreamInfo(userId) {
  try {
    const token = process.env.TWITCH_APP_TOKEN; // make sure you generate/store this
    const res = await fetch(`https://api.twitch.tv/helix/streams?user_id=${userId}`, {
      headers: {
        'Client-ID': process.env.TWITCH_CLIENT_ID,
        'Authorization': `Bearer ${token}`
      }
    });
    const data = await res.json();
    const stream = data?.data?.[0];
    if (!stream) return { title: 'Live now!', thumbnail: null };
    return {
      title: stream.title || 'Live now!',
      thumbnail: stream.thumbnail_url || null
    };
  } catch (err) {
    console.error('❌ fetchTwitchStreamInfo error:', err, userId);
    return { title: 'Live now!', thumbnail: null };
  }
}

export async function handleTwitchEvent(payload, client) {
  const subscriptionType = payload.subscription?.type; // 'stream.online' | 'stream.offline'
  const event = payload.event || {};

  const userId = event.broadcaster_user_id;
  const displayName = event.broadcaster_user_name || '';
  const categoryName = event.category_name || '';

  // Fetch all streamer entries for this user across all guilds
  const streamers = db.prepare(
    "SELECT * FROM streamers WHERE platform='twitch' AND platformUserId=?"
  ).all(userId);

  // Only fetch Twitch stream info when going live
  let streamInfo = { title: 'Live now!', thumbnail: null };
  if (subscriptionType === 'stream.online') {
    streamInfo = await fetchTwitchStreamInfo(userId);
  }

  for (const s of streamers) {
    const guild = await client.guilds.fetch(s.guildId).catch(() => null);
    if (!guild) continue;

    let { announceChannelId, liveRoleId, isLive } = s;

    if (!announceChannelId || !liveRoleId) {
      const defaults = db.prepare(
        "SELECT announceChannelId, liveRoleId FROM guild_settings WHERE guildId=?"
      ).get(s.guildId);

      announceChannelId = announceChannelId || defaults?.announceChannelId || null;
      liveRoleId = liveRoleId || defaults?.liveRoleId || null;

      db.prepare(
        "UPDATE streamers SET announceChannelId=?, liveRoleId=? WHERE guildId=? AND discordUserId=? AND platform=?"
      ).run(announceChannelId, liveRoleId, s.guildId, s.discordUserId, s.platform);
    }

    if (s.gameFilter && s.gameFilter !== categoryName) continue;

    // 🔹 GOING LIVE
    if (subscriptionType === 'stream.online' && isLive !== 1) {
      db.prepare(
        "UPDATE streamers SET isLive=1 WHERE guildId=? AND discordUserId=? AND platform=?"
      ).run(s.guildId, s.discordUserId, s.platform);

      if (liveRoleId) await giveRole(guild, s.discordUserId, liveRoleId);
      if (announceChannelId) {
        await announce(
          client,
          { ...s, displayName },
          `https://twitch.tv/${s.platformUsername}`,
          streamInfo.title,
          streamInfo.thumbnail,
          s.platform,
          s.guildId,
          s.discordUserId
        );
      }

      console.log(`✅ Marked ${displayName} as live in guild ${s.guildId}`);
    }

    // 🔹 GOING OFFLINE
    if (subscriptionType === 'stream.offline' && isLive === 1) {
      db.prepare(
        "UPDATE streamers SET isLive=0 WHERE guildId=? AND discordUserId=? AND platform=?"
      ).run(s.guildId, s.discordUserId, s.platform);

      if (liveRoleId) await removeRole(guild, s.discordUserId, liveRoleId);
      await clearLiveMessage(s.guildId, s.discordUserId);

      console.log(`✅ Marked ${displayName} as offline in guild ${s.guildId}`);
    }
  }
}
