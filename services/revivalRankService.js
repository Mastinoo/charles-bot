import { PermissionFlagsBits } from 'discord.js';
import db from '../database.js';

const DEFAULTS = Object.freeze({
  messageThreshold: 50,
  activeDaysThreshold: 7,
  tenureDaysThreshold: 7,
  dailyCap: 10,
  baselineDate: '2025-12-09',
  enabled: 1
});

const configCache = new Map();
const backfillJobs = new Map();
const pausedGuilds = new Set();

const getConfigStmt = db.prepare(`
  SELECT * FROM revival_rank_config WHERE guildId = ?
`);
const getExclusionsStmt = db.prepare(`
  SELECT targetType, targetId FROM revival_rank_exclusions WHERE guildId = ?
`);
const getUserStmt = db.prepare(`
  SELECT * FROM revival_rank_users WHERE guildId = ? AND userId = ?
`);
const getDailyStmt = db.prepare(`
  SELECT rawCount, countedCount FROM revival_rank_daily
  WHERE guildId = ? AND userId = ? AND activityDate = ?
`);
const insertDailyStmt = db.prepare(`
  INSERT INTO revival_rank_daily (guildId, userId, activityDate, rawCount, countedCount)
  VALUES (?, ?, ?, ?, ?)
`);
const updateDailyStmt = db.prepare(`
  UPDATE revival_rank_daily
  SET rawCount = ?, countedCount = ?
  WHERE guildId = ? AND userId = ? AND activityDate = ?
`);
const insertUserStmt = db.prepare(`
  INSERT INTO revival_rank_users (
    guildId, userId, qualifyingMessages, rawMessages, activeDays,
    firstMessageAt, lastMessageAt, qualifiedAt, revivalistAwardedAt
  ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL)
`);
const updateUserStmt = db.prepare(`
  UPDATE revival_rank_users
  SET qualifyingMessages = qualifyingMessages + ?,
      rawMessages = rawMessages + 1,
      activeDays = activeDays + ?,
      firstMessageAt = COALESCE(firstMessageAt, ?),
      lastMessageAt = ?
  WHERE guildId = ? AND userId = ?
`);
const markQualifiedStmt = db.prepare(`
  UPDATE revival_rank_users
  SET qualifiedAt = COALESCE(qualifiedAt, ?)
  WHERE guildId = ? AND userId = ?
`);
const markAwardedStmt = db.prepare(`
  UPDATE revival_rank_users
  SET qualifiedAt = COALESCE(qualifiedAt, ?),
      revivalistAwardedAt = COALESCE(revivalistAwardedAt, ?)
  WHERE guildId = ? AND userId = ?
`);

const recordMessageTx = db.transaction((guildId, userId, timestamp, dailyCap) => {
  const iso = new Date(timestamp).toISOString();
  const dateKey = iso.slice(0, 10);
  const daily = getDailyStmt.get(guildId, userId, dateKey);
  const isNewDay = !daily;
  let countedIncrement = 0;

  if (!daily) {
    countedIncrement = dailyCap > 0 ? 1 : 0;
    insertDailyStmt.run(guildId, userId, dateKey, 1, countedIncrement);
  } else {
    const newRaw = daily.rawCount + 1;
    const newCounted = Math.min(newRaw, dailyCap);
    countedIncrement = Math.max(0, newCounted - daily.countedCount);
    updateDailyStmt.run(newRaw, newCounted, guildId, userId, dateKey);
  }

  const user = getUserStmt.get(guildId, userId);
  if (!user) {
    insertUserStmt.run(
      guildId,
      userId,
      countedIncrement,
      1,
      isNewDay ? 1 : 0,
      iso,
      iso
    );
  } else {
    updateUserStmt.run(
      countedIncrement,
      isNewDay ? 1 : 0,
      iso,
      iso,
      guildId,
      userId
    );
  }

  return getUserStmt.get(guildId, userId);
});

function normalizeConfig(row) {
  if (!row) return null;
  return {
    ...row,
    enabled: Boolean(row.enabled),
    messageThreshold: Number(row.messageThreshold),
    activeDaysThreshold: Number(row.activeDaysThreshold),
    tenureDaysThreshold: Number(row.tenureDaysThreshold),
    dailyCap: Number(row.dailyCap),
    exclusions: {
      channels: new Set(),
      categories: new Set()
    }
  };
}

export function invalidateRevivalConfig(guildId) {
  configCache.delete(guildId);
}

export function getRevivalConfig(guildId, { fresh = false } = {}) {
  if (!fresh && configCache.has(guildId)) return configCache.get(guildId);

  const row = normalizeConfig(getConfigStmt.get(guildId));
  if (!row) return null;

  for (const exclusion of getExclusionsStmt.all(guildId)) {
    if (exclusion.targetType === 'category') row.exclusions.categories.add(exclusion.targetId);
    else row.exclusions.channels.add(exclusion.targetId);
  }

  configCache.set(guildId, row);
  return row;
}

export function upsertRevivalConfig(guildId, patch = {}) {
  const existing = getConfigStmt.get(guildId) || {};
  const merged = {
    guildId,
    awakenedRoleId: patch.awakenedRoleId ?? existing.awakenedRoleId ?? null,
    revivalistRoleId: patch.revivalistRoleId ?? existing.revivalistRoleId ?? null,
    ascendedRoleId: patch.ascendedRoleId ?? existing.ascendedRoleId ?? null,
    messageThreshold: patch.messageThreshold ?? existing.messageThreshold ?? DEFAULTS.messageThreshold,
    activeDaysThreshold: patch.activeDaysThreshold ?? existing.activeDaysThreshold ?? DEFAULTS.activeDaysThreshold,
    tenureDaysThreshold: patch.tenureDaysThreshold ?? existing.tenureDaysThreshold ?? DEFAULTS.tenureDaysThreshold,
    dailyCap: patch.dailyCap ?? existing.dailyCap ?? DEFAULTS.dailyCap,
    baselineDate: patch.baselineDate ?? existing.baselineDate ?? DEFAULTS.baselineDate,
    enabled: patch.enabled ?? existing.enabled ?? DEFAULTS.enabled
  };

  db.prepare(`
    INSERT INTO revival_rank_config (
      guildId, awakenedRoleId, revivalistRoleId, ascendedRoleId,
      messageThreshold, activeDaysThreshold, tenureDaysThreshold,
      dailyCap, baselineDate, enabled
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(guildId) DO UPDATE SET
      awakenedRoleId = excluded.awakenedRoleId,
      revivalistRoleId = excluded.revivalistRoleId,
      ascendedRoleId = excluded.ascendedRoleId,
      messageThreshold = excluded.messageThreshold,
      activeDaysThreshold = excluded.activeDaysThreshold,
      tenureDaysThreshold = excluded.tenureDaysThreshold,
      dailyCap = excluded.dailyCap,
      baselineDate = excluded.baselineDate,
      enabled = excluded.enabled
  `).run(
    merged.guildId,
    merged.awakenedRoleId,
    merged.revivalistRoleId,
    merged.ascendedRoleId,
    merged.messageThreshold,
    merged.activeDaysThreshold,
    merged.tenureDaysThreshold,
    merged.dailyCap,
    merged.baselineDate,
    merged.enabled ? 1 : 0
  );

  invalidateRevivalConfig(guildId);
  return getRevivalConfig(guildId, { fresh: true });
}

export function setRevivalExclusion(guildId, targetType, targetId, excluded = true) {
  if (!['channel', 'category'].includes(targetType)) {
    throw new Error(`Unsupported exclusion type: ${targetType}`);
  }

  if (excluded) {
    db.prepare(`
      INSERT OR IGNORE INTO revival_rank_exclusions (guildId, targetType, targetId)
      VALUES (?, ?, ?)
    `).run(guildId, targetType, targetId);
  } else {
    db.prepare(`
      DELETE FROM revival_rank_exclusions
      WHERE guildId = ? AND targetType = ? AND targetId = ?
    `).run(guildId, targetType, targetId);
  }

  invalidateRevivalConfig(guildId);
  return getRevivalConfig(guildId, { fresh: true });
}

function categoryIdFor(channel) {
  if (!channel) return null;
  if (channel.isThread?.()) return channel.parent?.parentId ?? null;
  return channel.parentId ?? null;
}

export function isRevivalChannelExcluded(channel, config) {
  if (!channel || !config?.exclusions) return true;
  if (config.exclusions.channels.has(channel.id)) return true;

  if (channel.isThread?.() && channel.parentId && config.exclusions.channels.has(channel.parentId)) {
    return true;
  }

  const categoryId = categoryIdFor(channel);
  if (categoryId && config.exclusions.categories.has(categoryId)) return true;
  return false;
}

function memberTenureDays(member, now = Date.now()) {
  if (!member?.joinedTimestamp) return 0;
  return Math.floor((now - member.joinedTimestamp) / 86_400_000);
}

export function getMemberRevivalProgress(guildId, userId) {
  return getUserStmt.get(guildId, userId) || {
    guildId,
    userId,
    qualifyingMessages: 0,
    rawMessages: 0,
    activeDays: 0,
    firstMessageAt: null,
    lastMessageAt: null,
    qualifiedAt: null,
    revivalistAwardedAt: null
  };
}

export function qualifiesForRevivalist(member, progress, config) {
  if (!member || member.user?.bot || !config) return false;
  return (
    progress.qualifyingMessages >= config.messageThreshold &&
    progress.activeDays >= config.activeDaysThreshold &&
    memberTenureDays(member) >= config.tenureDaysThreshold
  );
}

export async function maybeAwardRevivalist(member, config = getRevivalConfig(member.guild.id)) {
  if (!config?.enabled || !config.revivalistRoleId || member.user.bot) return false;

  // Ascended is intentionally manual and sits above automation. If someone is
  // already Ascended, Charles leaves their rank roles alone.
  if (config.ascendedRoleId && member.roles.cache.has(config.ascendedRoleId)) return false;

  const progress = getMemberRevivalProgress(member.guild.id, member.id);
  if (!qualifiesForRevivalist(member, progress, config)) return false;

  const nowIso = new Date().toISOString();
  markQualifiedStmt.run(nowIso, member.guild.id, member.id);

  if (member.roles.cache.has(config.revivalistRoleId)) {
    markAwardedStmt.run(nowIso, nowIso, member.guild.id, member.id);
    return false;
  }

  const role = member.guild.roles.cache.get(config.revivalistRoleId)
    || await member.guild.roles.fetch(config.revivalistRoleId).catch(() => null);
  if (!role) {
    console.warn(`[REVIVAL] Revivalist role ${config.revivalistRoleId} not found in guild ${member.guild.id}`);
    return false;
  }

  try {
    await member.roles.add(role, 'Earned Revivalist through GWR activity progression');
    markAwardedStmt.run(nowIso, nowIso, member.guild.id, member.id);
    console.log(`[REVIVAL] Awarded Revivalist to ${member.user.tag} (${member.id})`);
    return true;
  } catch (error) {
    console.error(`[REVIVAL] Failed to award Revivalist to ${member.id}:`, error);
    return false;
  }
}

export async function handleRevivalMessage(message) {
  if (!message.inGuild?.() || message.author.bot || message.webhookId || message.system) return;
  if (pausedGuilds.has(message.guildId)) return;

  const config = getRevivalConfig(message.guildId);
  if (!config?.enabled || !config.revivalistRoleId) return;
  if (isRevivalChannelExcluded(message.channel, config)) return;

  recordMessageTx(message.guildId, message.author.id, message.createdTimestamp, config.dailyCap);

  const member = message.member
    || await message.guild.members.fetch(message.author.id).catch(() => null);
  if (member) await maybeAwardRevivalist(member, config);
}

export function recomputeRevivalStats(guildId, dailyCap) {
  const tx = db.transaction(() => {
    db.prepare(`
      UPDATE revival_rank_daily
      SET countedCount = CASE
        WHEN rawCount > ? THEN ?
        ELSE rawCount
      END
      WHERE guildId = ?
    `).run(dailyCap, dailyCap, guildId);

    const rows = db.prepare(`
      SELECT
        userId,
        SUM(countedCount) AS qualifyingMessages,
        SUM(rawCount) AS rawMessages,
        COUNT(*) AS activeDays,
        MIN(activityDate) AS firstDay,
        MAX(activityDate) AS lastDay
      FROM revival_rank_daily
      WHERE guildId = ?
      GROUP BY userId
    `).all(guildId);

    const existingAwarded = new Map(
      db.prepare(`SELECT userId, qualifiedAt, revivalistAwardedAt FROM revival_rank_users WHERE guildId = ?`).all(guildId)
        .map(row => [row.userId, row])
    );

    db.prepare(`DELETE FROM revival_rank_users WHERE guildId = ?`).run(guildId);

    const insert = db.prepare(`
      INSERT INTO revival_rank_users (
        guildId, userId, qualifyingMessages, rawMessages, activeDays,
        firstMessageAt, lastMessageAt, qualifiedAt, revivalistAwardedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const row of rows) {
      const previous = existingAwarded.get(row.userId);
      insert.run(
        guildId,
        row.userId,
        row.qualifyingMessages || 0,
        row.rawMessages || 0,
        row.activeDays || 0,
        row.firstDay ? `${row.firstDay}T00:00:00.000Z` : null,
        row.lastDay ? `${row.lastDay}T23:59:59.999Z` : null,
        previous?.qualifiedAt ?? null,
        previous?.revivalistAwardedAt ?? null
      );
    }
  });

  tx();
}

function parseBaselineDate(dateString) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString || '')) {
    throw new Error('Baseline date must use YYYY-MM-DD.');
  }
  const timestamp = Date.parse(`${dateString}T00:00:00.000Z`);
  if (!Number.isFinite(timestamp)) throw new Error('Invalid baseline date.');
  return timestamp;
}

function canReadHistory(channel, guild) {
  if (!channel?.messages?.fetch) return false;
  const me = guild.members.me;
  if (!me || !channel.permissionsFor) return true;
  const permissions = channel.permissionsFor(me);
  if (!permissions) return false;
  return permissions.has(PermissionFlagsBits.ViewChannel)
    && permissions.has(PermissionFlagsBits.ReadMessageHistory);
}

async function collectMessageChannels(guild, config, job) {
  const found = new Map();
  const channels = await guild.channels.fetch();

  for (const channel of channels.values()) {
    if (!channel) continue;

    if (channel.messages?.fetch && canReadHistory(channel, guild) && !isRevivalChannelExcluded(channel, config)) {
      found.set(channel.id, channel);
    }

    // Forum/media/text/news parents can contain message-bearing threads.
    if (channel.threads?.fetchArchived) {
      for (const type of ['public', 'private']) {
        try {
          const archived = await channel.threads.fetchArchived({ type, fetchAll: true }, false);
          for (const thread of archived.threads.values()) {
            if (canReadHistory(thread, guild) && !isRevivalChannelExcluded(thread, config)) {
              found.set(thread.id, thread);
            }
          }
        } catch (error) {
          // Private archived threads often require additional permissions; that is
          // not fatal for the rest of the scan.
          if (type === 'public') {
            console.warn(`[REVIVAL] Could not fetch archived threads for ${channel.id}: ${error.message}`);
          }
        }
      }
    }
  }

  try {
    const active = await guild.channels.fetchActiveThreads(false);
    for (const thread of active.threads.values()) {
      if (canReadHistory(thread, guild) && !isRevivalChannelExcluded(thread, config)) {
        found.set(thread.id, thread);
      }
    }
  } catch (error) {
    console.warn(`[REVIVAL] Could not fetch active threads in ${guild.id}: ${error.message}`);
  }

  job.channelsTotal = found.size;
  return [...found.values()];
}

function addToBackfillAggregate(aggregate, message, dailyCap) {
  if (message.author.bot || message.webhookId || message.system) return;
  const userId = message.author.id;
  const dateKey = new Date(message.createdTimestamp).toISOString().slice(0, 10);
  let user = aggregate.get(userId);
  if (!user) {
    user = new Map();
    aggregate.set(userId, user);
  }
  user.set(dateKey, (user.get(dateKey) || 0) + 1);
}

async function scanChannelHistory(channel, baselineMs, cutoffMs, aggregate, job, dailyCap) {
  let before;

  while (true) {
    const batch = await channel.messages.fetch({
      limit: 100,
      ...(before ? { before } : {}),
      cache: false
    });

    if (!batch.size) break;
    job.apiBatches += 1;

    const messages = [...batch.values()].sort((a, b) => b.createdTimestamp - a.createdTimestamp);
    let reachedBaseline = false;

    for (const message of messages) {
      if (message.createdTimestamp > cutoffMs) continue;
      if (message.createdTimestamp < baselineMs) {
        reachedBaseline = true;
        continue;
      }
      addToBackfillAggregate(aggregate, message, dailyCap);
      job.messagesScanned += 1;
    }

    const oldest = messages[messages.length - 1];
    if (!oldest || reachedBaseline || oldest.createdTimestamp < baselineMs || batch.size < 100) break;
    before = oldest.id;
  }
}

const mergeBackfillTx = db.transaction((guildId, aggregate, dailyCap) => {
  const select = db.prepare(`
    SELECT rawCount FROM revival_rank_daily
    WHERE guildId = ? AND userId = ? AND activityDate = ?
  `);
  const insert = db.prepare(`
    INSERT INTO revival_rank_daily (guildId, userId, activityDate, rawCount, countedCount)
    VALUES (?, ?, ?, ?, ?)
  `);
  const update = db.prepare(`
    UPDATE revival_rank_daily SET rawCount = ?, countedCount = ?
    WHERE guildId = ? AND userId = ? AND activityDate = ?
  `);

  for (const [userId, days] of aggregate.entries()) {
    for (const [dateKey, historicalRaw] of days.entries()) {
      const current = select.get(guildId, userId, dateKey);
      const combinedRaw = (current?.rawCount || 0) + historicalRaw;
      const counted = Math.min(combinedRaw, dailyCap);
      if (current) update.run(combinedRaw, counted, guildId, userId, dateKey);
      else insert.run(guildId, userId, dateKey, combinedRaw, counted);
    }
  }
});

async function countEligibleMembers(guild, config) {
  const members = await guild.members.fetch();
  let eligible = 0;
  let alreadyRevivalist = 0;
  let ascended = 0;

  for (const member of members.values()) {
    if (member.user.bot) continue;
    if (config.ascendedRoleId && member.roles.cache.has(config.ascendedRoleId)) {
      ascended += 1;
      continue;
    }
    if (member.roles.cache.has(config.revivalistRoleId)) alreadyRevivalist += 1;
    const progress = getMemberRevivalProgress(guild.id, member.id);
    if (qualifiesForRevivalist(member, progress, config)) eligible += 1;
  }

  return { eligible, alreadyRevivalist, ascended, members: members.filter(m => !m.user.bot).size };
}

export function getBackfillJob(guildId) {
  return backfillJobs.get(guildId) || null;
}

export async function startRevivalBackfill(guild) {
  const guildId = guild.id;
  const config = getRevivalConfig(guildId, { fresh: true });
  if (!config?.revivalistRoleId) throw new Error('Revival ranks are not configured yet.');
  if (backfillJobs.get(guildId)?.state === 'running') throw new Error('A Revival backfill is already running.');

  const baselineMs = parseBaselineDate(config.baselineDate);
  const job = {
    state: 'running',
    startedAt: new Date().toISOString(),
    completedAt: null,
    baselineDate: config.baselineDate,
    cutoffAt: null,
    channelsTotal: 0,
    channelsDone: 0,
    messagesScanned: 0,
    apiBatches: 0,
    errors: [],
    result: null
  };
  backfillJobs.set(guildId, job);

  // Run detached from the interaction. /revival status can be used at any time.
  void (async () => {
    try {
      pausedGuilds.add(guildId);
      const cutoffMs = Date.now();
      job.cutoffAt = new Date(cutoffMs).toISOString();

      // Preserve earned timestamps if an administrator deliberately re-runs a
      // backfill later. Discord roles themselves are never removed by a scan.
      const preservedAwards = new Map(
        db.prepare(`
          SELECT userId, qualifiedAt, revivalistAwardedAt
          FROM revival_rank_users
          WHERE guildId = ? AND (qualifiedAt IS NOT NULL OR revivalistAwardedAt IS NOT NULL)
        `).all(guildId).map(row => [row.userId, row])
      );

      // Rebuild progression data from scratch. Existing Discord roles are never
      // removed, and live tracking resumes immediately after this tiny reset.
      db.transaction(() => {
        db.prepare(`DELETE FROM revival_rank_daily WHERE guildId = ?`).run(guildId);
        db.prepare(`DELETE FROM revival_rank_users WHERE guildId = ?`).run(guildId);
      })();
      pausedGuilds.delete(guildId);

      const aggregate = new Map();
      const channels = await collectMessageChannels(guild, config, job);

      for (const channel of channels) {
        try {
          await scanChannelHistory(channel, baselineMs, cutoffMs, aggregate, job, config.dailyCap);
        } catch (error) {
          job.errors.push(`${channel.name || channel.id}: ${error.message}`);
          console.warn(`[REVIVAL] Backfill channel failed ${channel.id}:`, error);
        } finally {
          job.channelsDone += 1;
        }
      }

      mergeBackfillTx(guildId, aggregate, config.dailyCap);
      recomputeRevivalStats(guildId, config.dailyCap);

      if (preservedAwards.size) {
        const restore = db.prepare(`
          UPDATE revival_rank_users
          SET qualifiedAt = COALESCE(qualifiedAt, ?),
              revivalistAwardedAt = COALESCE(revivalistAwardedAt, ?)
          WHERE guildId = ? AND userId = ?
        `);
        db.transaction(() => {
          for (const [userId, previous] of preservedAwards.entries()) {
            restore.run(previous.qualifiedAt, previous.revivalistAwardedAt, guildId, userId);
          }
        })();
      }

      const result = await countEligibleMembers(guild, config);

      const completedAt = new Date().toISOString();
      db.prepare(`
        UPDATE revival_rank_config
        SET backfillCompletedAt = ?,
            lastBackfillMessages = ?,
            lastBackfillUsers = ?,
            lastBackfillEligible = ?
        WHERE guildId = ?
      `).run(completedAt, job.messagesScanned, aggregate.size, result.eligible, guildId);
      invalidateRevivalConfig(guildId);

      job.state = 'complete';
      job.completedAt = completedAt;
      job.result = {
        ...result,
        usersWithMessages: aggregate.size
      };
    } catch (error) {
      job.state = 'failed';
      job.completedAt = new Date().toISOString();
      job.errors.push(error.message);
      console.error(`[REVIVAL] Backfill failed for ${guildId}:`, error);
    } finally {
      pausedGuilds.delete(guildId);
    }
  })();

  return job;
}

export async function applyRevivalistRoles(guild) {
  const config = getRevivalConfig(guild.id, { fresh: true });
  if (!config?.revivalistRoleId) throw new Error('Revival ranks are not configured yet.');

  const members = await guild.members.fetch();
  let eligible = 0;
  let awarded = 0;
  let alreadyHad = 0;
  let skippedAscended = 0;
  let failed = 0;

  for (const member of members.values()) {
    if (member.user.bot) continue;
    if (config.ascendedRoleId && member.roles.cache.has(config.ascendedRoleId)) {
      skippedAscended += 1;
      continue;
    }

    const progress = getMemberRevivalProgress(guild.id, member.id);
    if (!qualifiesForRevivalist(member, progress, config)) continue;
    eligible += 1;

    if (member.roles.cache.has(config.revivalistRoleId)) {
      alreadyHad += 1;
      const nowIso = new Date().toISOString();
      markAwardedStmt.run(nowIso, nowIso, guild.id, member.id);
      continue;
    }

    const success = await maybeAwardRevivalist(member, config);
    if (success) awarded += 1;
    else failed += 1;
  }

  return { eligible, awarded, alreadyHad, skippedAscended, failed };
}

export async function simulateRevivalThresholds(guild, scenarios) {
  const config = getRevivalConfig(guild.id, { fresh: true });
  if (!config?.revivalistRoleId) throw new Error('Revival ranks are not configured yet.');

  if (!Array.isArray(scenarios) || !scenarios.length) {
    throw new Error('At least one simulation scenario is required.');
  }

  const members = await guild.members.fetch();
  const progressRows = db.prepare(`
    SELECT userId, qualifyingMessages, rawMessages, activeDays
    FROM revival_rank_users
    WHERE guildId = ?
  `).all(guild.id);
  const progressByUser = new Map(progressRows.map(row => [row.userId, row]));

  let humanMembers = 0;
  let ascendedTotal = 0;
  let revivalistRoleHolders = 0;

  const humanMemberList = [];
  for (const member of members.values()) {
    if (member.user.bot) continue;
    humanMembers += 1;

    const isAscended = Boolean(config.ascendedRoleId && member.roles.cache.has(config.ascendedRoleId));
    const hasRevivalist = member.roles.cache.has(config.revivalistRoleId);
    if (isAscended) ascendedTotal += 1;
    if (hasRevivalist) revivalistRoleHolders += 1;

    humanMemberList.push({
      member,
      isAscended,
      hasRevivalist,
      progress: progressByUser.get(member.id) || { qualifyingMessages: 0, rawMessages: 0, activeDays: 0 }
    });
  }

  const results = scenarios.map(scenario => {
    const messageThreshold = Number(scenario.messageThreshold);
    const activeDaysThreshold = Number(scenario.activeDaysThreshold);
    const tenureDaysThreshold = Number(scenario.tenureDaysThreshold);

    let eligible = 0;
    let alreadyRevivalist = 0;
    let wouldAward = 0;

    for (const item of humanMemberList) {
      if (item.isAscended) continue;

      const qualifies =
        Number(item.progress.qualifyingMessages || 0) >= messageThreshold &&
        Number(item.progress.activeDays || 0) >= activeDaysThreshold &&
        memberTenureDays(item.member) >= tenureDaysThreshold;

      if (!qualifies) continue;
      eligible += 1;
      if (item.hasRevivalist) alreadyRevivalist += 1;
      else wouldAward += 1;
    }

    return {
      messageThreshold,
      activeDaysThreshold,
      tenureDaysThreshold,
      eligible,
      alreadyRevivalist,
      wouldAward
    };
  });

  return {
    dailyCap: config.dailyCap,
    trackedUsers: progressRows.length,
    humanMembers,
    ascendedTotal,
    revivalistRoleHolders,
    results
  };
}

export function getRevivalStatsSummary(guildId) {
  const totals = db.prepare(`
    SELECT
      COUNT(*) AS trackedUsers,
      COALESCE(SUM(rawMessages), 0) AS rawMessages,
      COALESCE(SUM(qualifyingMessages), 0) AS qualifyingMessages
    FROM revival_rank_users
    WHERE guildId = ?
  `).get(guildId);

  return totals;
}

export function validateBaselineDate(value) {
  try {
    parseBaselineDate(value);
    return true;
  } catch {
    return false;
  }
}
