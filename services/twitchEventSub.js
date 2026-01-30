import db from '../database.js';
import { announce, giveRole, removeRole } from './announcer.js';

export async function handleTwitchEvent(payload, client) {
  const { type, user_name, user_id, category_name, thumbnail_url } = payload.event || {};
  const streamers = db.prepare("SELECT * FROM streamers WHERE platform='twitch' AND platformUserId=?").all(user_id);

  for (const s of streamers) {
    const guild = await client.guilds.fetch(s.guildId).catch(() => null);
    if (!guild) continue;

    if (s.gameFilter && s.gameFilter !== category_name) continue;

    if (type === 'stream.online' && s.isLive === 0) {
      db.prepare("UPDATE streamers SET isLive=1 WHERE guildId=? AND discordUserId=? AND platform=?").run(s.guildId, s.discordUserId, s.platform);
      if (s.liveRoleId) await giveRole(guild, s.discordUserId, s.liveRoleId);
      if (s.announceChannelId) await announce(client, s, `https://twitch.tv/${user_name}`, category_name, thumbnail_url);
    }

    if (type === 'stream.offline' && s.isLive === 1) {
      db.prepare("UPDATE streamers SET isLive=0 WHERE guildId=? AND discordUserId=? AND platform=?").run(s.guildId, s.discordUserId, s.platform);
      if (s.liveRoleId) await removeRole(guild, s.discordUserId, s.liveRoleId);
    }
  }
}

