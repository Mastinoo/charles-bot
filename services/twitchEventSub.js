import db from '../database.js';
import { announce, giveRole, removeRole, clearLiveMessage } from './announcer.js';

export async function handleTwitchEvent(payload, client) {
  const subscriptionType = payload.subscription?.type; // 'stream.online' | 'stream.offline'
  const event = payload.event || {};

  const userId = event.broadcaster_user_id;
  const displayName = event.broadcaster_user_name || '';
  const categoryName = event.category_name || '';
  const thumbnailUrl = event.thumbnail_url || '';

  const streamers = db.prepare(
    "SELECT * FROM streamers WHERE platform='twitch' AND platformUserId=?"
  ).all(userId);

  for (const s of streamers) {
    const guild = await client.guilds.fetch(s.guildId).catch(() => null);
    if (!guild) continue;

    // Fill defaults if missing
    let { announceChannelId, liveRoleId } = s;
    if (!announceChannelId || !liveRoleId) {
      const defaults = db.prepare(
        "SELECT announceChannelId, liveRoleId FROM guild_settings WHERE guildId=?"
      ).get(s.guildId);

      announceChannelId = announceChannelId || defaults?.announceChannelId || null;
      liveRoleId = liveRoleId || defaults?.liveRoleId || null;

      db.prepare(
        "UPDATE streamers SET announceChannelId=?, liveRoleId=? WHERE guildId=? AND discordUserId=? AND platform=?"
      ).run(announceChannelId, liveRoleId, s.guildId, s.discordUserId, s.platform);

      console.log(`ℹ️ Updated defaults for ${displayName} in guild ${s.guildId}`);
    }

    // Skip if game filter doesn't match
    if (s.gameFilter && s.gameFilter !== categoryName) continue;

    // 🔹 Use latest DB live state
    const currentLive = db.prepare(
      "SELECT isLive FROM streamers WHERE guildId=? AND discordUserId=? AND platform=?"
    ).get(s.guildId, s.discordUserId, s.platform)?.isLive || 0;

    // 🔹 Going live
    if (subscriptionType === 'stream.online' && currentLive !== 1) {
      db.prepare(
        "UPDATE streamers SET isLive=1 WHERE guildId=? AND discordUserId=? AND platform=?"
      ).run(s.guildId, s.discordUserId, s.platform);

      if (liveRoleId) {
        // Give role once
        await giveRole(guild, s.discordUserId, liveRoleId);
        console.log(`✅ Gave role to ${displayName} in guild ${s.guildId}`);
      }

      if (announceChannelId) {
        await announce(
          client,
          { ...s, displayName },
          event.title || 'Live now!',
          thumbnailUrl,
          s.platform,
          s.guildId,
          s.discordUserId
        );
      }

      console.log(`✅ Marked ${displayName} as live in guild ${s.guildId}`);
    }

    // 🔹 Going offline
    if (subscriptionType === 'stream.offline' && currentLive === 1) {
      db.prepare(
        "UPDATE streamers SET isLive=0 WHERE guildId=? AND discordUserId=? AND platform=?"
      ).run(s.guildId, s.discordUserId, s.platform);

      if (liveRoleId) {
        // Only remove role on confirmed offline event
        await removeRole(guild, s.discordUserId, liveRoleId);
        console.log(`✅ Removed role from ${displayName} in guild ${s.guildId}`);
      }

      await clearLiveMessage(s.guildId, s.discordUserId);

      console.log(`✅ Marked ${displayName} as offline in guild ${s.guildId}`);
    }
  }
}
