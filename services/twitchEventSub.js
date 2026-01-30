import db from '../database.js';
import { announce, giveRole, removeRole, clearLiveMessage } from './announcer.js';

export async function handleTwitchEvent(payload, client) {
  const subscriptionType = payload.subscription?.type; // stream.online | stream.offline
  const event = payload.event || {};

  const userId = event.broadcaster_user_id;
  const displayName = event.broadcaster_user_name || '';
  const categoryName = event.category_name || '';
  const thumbnailUrl = event.thumbnail_url || '';
  const streamTitle =
    event.title?.trim() ||
    categoryName?.trim() ||
    'Live now!';

  const streamers = db.prepare(
    "SELECT * FROM streamers WHERE platform='twitch' AND platformUserId=?"
  ).all(userId);

  for (const s of streamers) {
    const guild = await client.guilds.fetch(s.guildId).catch(() => null);
    if (!guild) continue;

    // 🔑 ALWAYS re-read live state from DB (prevents race conditions)
    const currentLive = db.prepare(
      "SELECT isLive FROM streamers WHERE guildId=? AND discordUserId=? AND platform=?"
    ).get(s.guildId, s.discordUserId, s.platform)?.isLive || 0;

    let { announceChannelId, liveRoleId } = s;

    // Load guild defaults if missing
    if (!announceChannelId || !liveRoleId) {
      const defaults = db.prepare(
        "SELECT announceChannelId, liveRoleId FROM guild_settings WHERE guildId=?"
      ).get(s.guildId);

      announceChannelId ??= defaults?.announceChannelId || null;
      liveRoleId ??= defaults?.liveRoleId || null;

      db.prepare(
        `UPDATE streamers 
         SET announceChannelId=?, liveRoleId=? 
         WHERE guildId=? AND discordUserId=? AND platform=?`
      ).run(
        announceChannelId,
        liveRoleId,
        s.guildId,
        s.discordUserId,
        s.platform
      );
    }

    // Optional game filter
    if (s.gameFilter && s.gameFilter !== categoryName) continue;

    // =========================
    // 🔴 GOING LIVE
    // =========================
    if (subscriptionType === 'stream.online' && currentLive !== 1) {
      db.prepare(
        "UPDATE streamers SET isLive=1 WHERE guildId=? AND discordUserId=? AND platform=?"
      ).run(s.guildId, s.discordUserId, s.platform);

      if (liveRoleId) {
        await giveRole(guild, s.discordUserId, liveRoleId);
      }

      if (announceChannelId) {
        await announce(
          client,
          { ...s, displayName },
          `https://twitch.tv/${s.platformUsername}`,
          streamTitle,
          thumbnailUrl,
          s.platform,
          s.guildId,
          s.discordUserId
        );
      }

      console.log(`🟢 ${displayName} is LIVE in ${s.guildId}`);
    }

    // =========================
    // ⚫ GOING OFFLINE
    // =========================
    if (subscriptionType === 'stream.offline' && currentLive === 1) {
      db.prepare(
        "UPDATE streamers SET isLive=0 WHERE guildId=? AND discordUserId=? AND platform=?"
      ).run(s.guildId, s.discordUserId, s.platform);

      if (liveRoleId) {
        await removeRole(guild, s.discordUserId, liveRoleId);
      }

      await clearLiveMessage(s.guildId, s.discordUserId);

      console.log(`⚫ ${displayName} went OFFLINE in ${s.guildId}`);
    }
  }
}
