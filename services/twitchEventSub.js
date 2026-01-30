import db from '../database.js';
import fetch from 'node-fetch';
import {
  announce,
  giveRole,
  removeRole,
  clearLiveMessage
} from './announcer.js';

/* =========================
   TWITCH TITLE FETCH
========================= */

async function fetchTwitchTitle(userId) {
  const res = await fetch(
    `https://api.twitch.tv/helix/streams?user_id=${userId}`,
    {
      headers: {
        'Client-ID': process.env.TWITCH_CLIENT_ID,
        'Authorization': `Bearer ${process.env.TWITCH_APP_TOKEN}`
      }
    }
  );

  const data = await res.json();
  return data?.data?.[0]?.title || 'Live now!';
}

/* =========================
   EVENT HANDLER
========================= */

export async function handleTwitchEvent(payload, client) {
  const subscriptionType = payload.subscription?.type;
  const event = payload.event || {};

  const twitchUserId = event.broadcaster_user_id;
  const displayName = event.broadcaster_user_name || '';
  const thumbnailUrl = event.thumbnail_url || '';
  const streamUrl = `https://twitch.tv/${displayName}`;

  if (!twitchUserId) return;

  const streamTitle = await fetchTwitchTitle(twitchUserId);

  const streamers = db.prepare(
    "SELECT * FROM streamers WHERE platform='twitch' AND platformUserId=?"
  ).all(twitchUserId);

  for (const s of streamers) {
    const guild = await client.guilds.fetch(s.guildId).catch(() => null);
    if (!guild) continue;

    let { announceChannelId, liveRoleId } = s;

    if (!announceChannelId || !liveRoleId) {
      const defaults = db.prepare(
        "SELECT announceChannelId, liveRoleId FROM guild_settings WHERE guildId=?"
      ).get(s.guildId);

      announceChannelId ||= defaults?.announceChannelId || null;
      liveRoleId ||= defaults?.liveRoleId || null;

      db.prepare(
        "UPDATE streamers SET announceChannelId=?, liveRoleId=? WHERE guildId=? AND discordUserId=? AND platform=?"
      ).run(
        announceChannelId,
        liveRoleId,
        s.guildId,
        s.discordUserId,
        s.platform
      );
    }

    const currentLive = s.isLive || 0;

    /* ========= GOING LIVE ========= */
    if (subscriptionType === 'stream.online' && currentLive !== 1) {
      db.prepare(
        "UPDATE streamers SET isLive=1 WHERE guildId=? AND discordUserId=? AND platform=?"
      ).run(s.guildId, s.discordUserId, s.platform);

      if (liveRoleId) await giveRole(guild, s.discordUserId, liveRoleId);

      if (announceChannelId) {
        await announce(
          client,
          { ...s, displayName },
          streamUrl,
          streamTitle,
          thumbnailUrl,
          'twitch',
          s.guildId,
          s.discordUserId
        );
      }

      console.log(`✅ ${displayName} LIVE in ${s.guildId}`);
    }

    /* ========= GOING OFFLINE ========= */
    if (subscriptionType === 'stream.offline' && currentLive === 1) {
      db.prepare(
        "UPDATE streamers SET isLive=0 WHERE guildId=? AND discordUserId=? AND platform=?"
      ).run(s.guildId, s.discordUserId, s.platform);

      if (liveRoleId) await removeRole(guild, s.discordUserId, liveRoleId);
      await clearLiveMessage(s.guildId, s.discordUserId);

      console.log(`⛔ ${displayName} OFFLINE in ${s.guildId}`);
    }
  }
}
