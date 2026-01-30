import db from '../database.js';
import { announce, giveRole, removeRole, clearLiveMessage } from './announcer.js';

export async function handleTwitchEvent(payload, client) {
  const subscriptionType = payload.subscription?.type; // 'stream.online' | 'stream.offline'
  const event = payload.event || {};

  const userId = event.broadcaster_user_id;
  const displayName = event.broadcaster_user_name || '';
  const categoryName = event.category_name || '';
  const thumbnailUrl = event.thumbnail_url || '';

  // Fetch all streamer entries for this user across all guilds
  const streamers = db.prepare(
    "SELECT * FROM streamers WHERE platform='twitch' AND platformUserId=?"
  ).all(userId);

  for (const s of streamers) {
    const guild = await client.guilds.fetch(s.guildId).catch(() => null);
    if (!guild) continue;

    // 🔹 Fill in guild defaults if missing
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

    // 🔹 Read latest live status
    const currentLive = s.isLive || 0;

    // --------------------------
    // Going live
    // --------------------------
    if (subscriptionType === 'stream.online' && currentLive !== 1) {
      db.prepare(
        "UPDATE streamers SET isLive=1 WHERE guildId=? AND discordUserId=? AND platform=?"
      ).run(s.guildId, s.discordUserId, s.platform);

      // Assign role only if we haven’t already
      if (liveRoleId) {
        const member = await guild.members.fetch(s.discordUserId).catch(() => null);
        if (member && !member.roles.cache.has(liveRoleId)) {
          await giveRole(guild, s.discordUserId, liveRoleId);
        }
      }

      // Send or update embed announcement
      if (announceChannelId) {
        await announce(
          client,
          { ...s, displayName },
          `https://twitch.tv/${s.platformUsername}`,
          event.title || categoryName || 'Live now!',
          thumbnailUrl,
          s.platform,
          s.guildId,
          s.discordUserId
        );
      }

      console.log(`✅ Marked ${displayName} as live in guild ${s.guildId}`);
    }

    // --------------------------
    // Going offline
    // --------------------------
    if (subscriptionType === 'stream.offline' && currentLive === 1) {
      db.prepare(
        "UPDATE streamers SET isLive=0 WHERE guildId=? AND discordUserId=? AND platform=?"
      ).run(s.guildId, s.discordUserId, s.platform);

      if (liveRoleId) {
        const member = await guild.members.fetch(s.discordUserId).catch(() => null);
        if (member && member.roles.cache.has(liveRoleId)) {
          await removeRole(guild, s.discordUserId, liveRoleId);
        }
      }

      // Clear live embed update interval
      await clearLiveMessage(s.guildId, s.discordUserId);

      console.log(`✅ Marked ${displayName} as offline in guild ${s.guildId}`);
    }
  }
}
