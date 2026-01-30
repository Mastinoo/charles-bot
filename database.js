import Database from 'better-sqlite3';
const db = new Database('./streamers.db');

// Create table if not exists
db.prepare(`
CREATE TABLE IF NOT EXISTS streamers (
    guildId TEXT,
    discordUserId TEXT,
    platform TEXT,
    platformUserId TEXT,
    platformUsername TEXT,
    announceChannelId TEXT,
    liveRoleId TEXT,
    gameFilter TEXT,
    isLive INTEGER DEFAULT 0,
    PRIMARY KEY (guildId, discordUserId, platform)
)
`).run();

export default db;
