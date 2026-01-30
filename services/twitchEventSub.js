import db from '../database.js';
import { announce, giveRole, removeRole } from './announcer.js';

export async function handleTwitchEvent(payload, client) {
    // Determine actual type from subscription
    const type = payload.subscription?.type; // 'stream.online' or 'stream.offline'
    const event = payload.event || {};

    const user_id = event.broadcaster_user_id;
    const user_name = event.broadcaster_user_name;
    const category_name = event.category_name || ''; // optional
    const thumbnail_url = event.thumbnail_url || '';

    const streamers = db.prepare(
        "SELECT * FROM streamers WHERE platform='twitch' AND platformUserId=?"
    ).all(user_id);

    for (const s of streamers) {
        const guild = await client.guilds.fetch(s.guildId).catch(() => null);
        if (!guild) continue;

        if (s.gameFilter && s.gameFilter !== category_name) continue;

        // Go live
        if (type === 'stream.online' && s.isLive === 0) {
            db.prepare(
                "UPDATE streamers SET isLive=1 WHERE guildId=? AND discordUserId=? AND platform=?"
            ).run(s.guildId, s.discordUserId, s.platform);

            if (s.liveRoleId) await giveRole(guild, s.discordUserId, s.liveRoleId);
            if (s.announceChannelId) 
                await announce(client, s, `https://twitch.tv/${user_name}`, category_name, thumbnail_url);
        }

        // Go offline
        if (type === 'stream.offline' && s.isLive === 1) {
            db.prepare(
                "UPDATE streamers SET isLive=0 WHERE guildId=? AND discordUserId=? AND platform=?"
            ).run(s.guildId, s.discordUserId, s.platform);

            if (s.liveRoleId) await removeRole(guild, s.discordUserId, s.liveRoleId);
        }
    }
}
