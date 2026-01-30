import db from '../database.js';
import { announce, giveRole, removeRole } from './announcer.js';

export async function handleTwitchEvent(payload, client) {
    const subscriptionType = payload.subscription?.type; // 'stream.online' or 'stream.offline'
    const event = payload.event || {};

    const user_id = event.broadcaster_user_id;
    const user_name = event.broadcaster_user_name;
    const category_name = event.category_name || '';
    const thumbnail_url = event.thumbnail_url || '';

    const streamers = db.prepare(
        "SELECT * FROM streamers WHERE platform='twitch' AND platformUserId=?"
    ).all(user_id);

    for (const s of streamers) {
        const guild = await client.guilds.fetch(s.guildId).catch(() => null);
        if (!guild) continue;

        // 🔹 Fill in defaults if missing
        let { announceChannelId, liveRoleId } = s;
        if (!announceChannelId || !liveRoleId) {
            const defaults = db.prepare(`
                SELECT announceChannelId, liveRoleId 
                FROM guild_settings 
                WHERE guildId=?
            `).get(s.guildId);

            announceChannelId = announceChannelId || defaults?.announceChannelId || null;
            liveRoleId = liveRoleId || defaults?.liveRoleId || null;

            // Update streamer row so future events don't need to fetch again
            db.prepare(`
                UPDATE streamers 
                SET announceChannelId=?, liveRoleId=? 
                WHERE guildId=? AND discordUserId=? AND platform=?
            `).run(announceChannelId, liveRoleId, s.guildId, s.discordUserId, s.platform);

            console.log(`ℹ️ Updated defaults for ${user_name} in guild ${s.guildId}`);
        }

        // Skip if game filter doesn't match
        if (s.gameFilter && s.gameFilter !== category_name) continue;

        // Going live
        if (subscriptionType === 'stream.online' && s.isLive === 0) {
            db.prepare(
                "UPDATE streamers SET isLive=1 WHERE guildId=? AND discordUserId=? AND platform=?"
            ).run(s.guildId, s.discordUserId, s.platform);

            if (liveRoleId) await giveRole(guild, s.discordUserId, liveRoleId);
            if (announceChannelId) 
                await announce(client, s, `https://twitch.tv/${user_name}`, category_name, thumbnail_url);

            console.log(`✅ Marked ${user_name} as live in guild ${s.guildId}`);
        }

        // Going offline
        if (subscriptionType === 'stream.offline' && s.isLive === 1) {
            db.prepare(
                "UPDATE streamers SET isLive=0 WHERE guildId=? AND discordUserId=? AND platform=?"
            ).run(s.guildId, s.discordUserId, s.platform);

            if (liveRoleId) await removeRole(guild, s.discordUserId, liveRoleId);

            console.log(`✅ Marked ${user_name} as offline in guild ${s.guildId}`);
        }
    }
}
