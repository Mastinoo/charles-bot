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

// Revival rank progression. Charles only automates the Revivalist role;
// Awakened and Ascended are reference roles for the three-rank system.
db.prepare(`
CREATE TABLE IF NOT EXISTS revival_rank_config (
    guildId TEXT PRIMARY KEY,
    awakenedRoleId TEXT,
    revivalistRoleId TEXT,
    ascendedRoleId TEXT,
    messageThreshold INTEGER NOT NULL DEFAULT 100,
    activeDaysThreshold INTEGER NOT NULL DEFAULT 7,
    tenureDaysThreshold INTEGER NOT NULL DEFAULT 7,
    dailyCap INTEGER NOT NULL DEFAULT 25,
    baselineDate TEXT NOT NULL DEFAULT '2025-12-09',
    enabled INTEGER NOT NULL DEFAULT 1,
    backfillCompletedAt TEXT,
    lastBackfillMessages INTEGER NOT NULL DEFAULT 0,
    lastBackfillUsers INTEGER NOT NULL DEFAULT 0,
    lastBackfillEligible INTEGER NOT NULL DEFAULT 0
)
`).run();

db.prepare(`
CREATE TABLE IF NOT EXISTS revival_rank_exclusions (
    guildId TEXT NOT NULL,
    targetType TEXT NOT NULL,
    targetId TEXT NOT NULL,
    PRIMARY KEY (guildId, targetType, targetId)
)
`).run();

db.prepare(`
CREATE TABLE IF NOT EXISTS revival_rank_daily (
    guildId TEXT NOT NULL,
    userId TEXT NOT NULL,
    activityDate TEXT NOT NULL,
    rawCount INTEGER NOT NULL DEFAULT 0,
    countedCount INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (guildId, userId, activityDate)
)
`).run();

db.prepare(`
CREATE TABLE IF NOT EXISTS revival_rank_users (
    guildId TEXT NOT NULL,
    userId TEXT NOT NULL,
    qualifyingMessages INTEGER NOT NULL DEFAULT 0,
    rawMessages INTEGER NOT NULL DEFAULT 0,
    activeDays INTEGER NOT NULL DEFAULT 0,
    firstMessageAt TEXT,
    lastMessageAt TEXT,
    qualifiedAt TEXT,
    revivalistAwardedAt TEXT,
    PRIMARY KEY (guildId, userId)
)
`).run();

db.prepare(`
CREATE INDEX IF NOT EXISTS idx_revival_daily_guild_user
ON revival_rank_daily (guildId, userId)
`).run();

db.prepare(`
CREATE INDEX IF NOT EXISTS idx_revival_users_guild_messages
ON revival_rank_users (guildId, qualifyingMessages)
`).run();

export default db;
