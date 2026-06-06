import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import { EmbedBuilder } from 'discord.js';
import fs from 'fs';

const WIKI_BASE = 'https://wiki.guildwars.com';
const API_URL = `${WIKI_BASE}/api.php`;
const CONFIG_FILE = './data/gwActivitiesConfig.json';
const USER_AGENT = 'Charles Discord Bot / Guild Wars activities';

const DAILY_PAGE = 'Daily_activities';
const WEEKLY_PAGE = 'Weekly_activities';
const WEEKLY_BONUSES_PAGE = 'Weekly_bonuses';

const DAILY_RESET_HOUR_UTC = 16;
const SANDFORD_RESET_HOUR_UTC = 7;
const WEEKLY_RESET_HOUR_UTC = 15;

function ensureDataDir() {
  if (!fs.existsSync('./data')) fs.mkdirSync('./data', { recursive: true });
}

export function loadActivitiesConfig() {
  ensureDataDir();
  if (!fs.existsSync(CONFIG_FILE)) return {};
  try { return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')); }
  catch { return {}; }
}

export function saveActivitiesConfig(config) {
  ensureDataDir();
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

export function getGuildActivitiesConfig(guildId) {
  const config = loadActivitiesConfig();
  if (!config[guildId]) config[guildId] = {};
  return { all: config, guild: config[guildId] };
}

function cleanText(text = '') {
  return text
    .replace(/\[edit\]/gi, '')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:])/g, '$1')
    .trim();
}

function wikiUrlFromHref(href) {
  if (!href) return null;
  if (href.startsWith('http')) return href;
  if (href.startsWith('/')) return `${WIKI_BASE}${href}`;
  return `${WIKI_BASE}/wiki/${href}`;
}

function pageNameFromUrl(urlOrPage) {
  if (!urlOrPage) return null;
  if (!urlOrPage.includes('/wiki/')) return urlOrPage.replace(/^\/+/, '');
  return decodeURIComponent(urlOrPage.split('/wiki/')[1].split('#')[0]);
}

async function fetchWikiHtml(page) {
  const url = `${API_URL}?action=parse&page=${encodeURIComponent(page)}&prop=text&format=json&origin=*`;
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`Wiki API failed for ${page}: ${res.status}`);
  const json = await res.json();
  const html = json?.parse?.text?.['*'];
  if (!html) throw new Error(`No parse HTML returned for ${page}`);
  return html;
}

function findKnownLabel(text) {
  const t = text.toLowerCase();
  const checks = [
    ['Zaishen Mission', ['zaishen mission']],
    ['Zaishen Bounty', ['zaishen bounty']],
    ['Zaishen Vanquish', ['zaishen vanquish']],
    ['Zaishen Combat', ['zaishen combat']],
    ['Wanted', ['wanted by the shining blade', 'wanted quest', 'wanted']],
    ['Nicholas Sandford', ['nicholas sandford', 'sandford']],
    ['Nicholas the Traveler', ['nicholas the traveler', 'traveler']],
    ['Weekly Bonus', ['weekly bonus', 'bonus week', 'weekly bonuses']]
  ];

  for (const [label, patterns] of checks) {
    if (patterns.some(p => t.includes(p))) return label;
  }
  return null;
}

function extractActivityRows(html) {
  const $ = cheerio.load(html);
  const items = [];
  const seen = new Set();

  $('tr').each((_, tr) => {
    const rowText = cleanText($(tr).text());
    const label = findKnownLabel(rowText);
    if (!label) return;

    const links = [];
    $(tr).find('a[href^="/wiki/"]').each((__, a) => {
      const title = cleanText($(a).text());
      const href = $(a).attr('href');
      if (!title || !href) return;
      if (/^(edit|view|talk)$/i.test(title)) return;
      links.push({ title, url: wikiUrlFromHref(href) });
    });

    const usefulLinks = links.filter(l => !/Daily activities|Weekly activities|Zaishen Challenge|Nicholas/i.test(l.title));
    const primary = usefulLinks[0] || links[0] || null;
    const key = `${label}:${primary?.url || rowText}`;
    if (seen.has(key)) return;
    seen.add(key);

    items.push({ label, title: primary?.title || rowText.replace(label, '').trim(), url: primary?.url || null, raw: rowText });
  });

  // Fallback: some wiki pages render as lists instead of normal tables.
  if (!items.length) {
    $('li, p').each((_, el) => {
      const text = cleanText($(el).text());
      const label = findKnownLabel(text);
      if (!label) return;
      const a = $(el).find('a[href^="/wiki/"]').first();
      const title = cleanText(a.text()) || text.replace(label, '').trim();
      const url = wikiUrlFromHref(a.attr('href'));
      const key = `${label}:${url || title}`;
      if (seen.has(key)) return;
      seen.add(key);
      items.push({ label, title, url, raw: text });
    });
  }

  return items;
}

function extractSectionText($, sectionNames, maxLength = 950) {
  const names = sectionNames.map(s => s.toLowerCase());
  const parts = [];

  $('h2, h3').each((_, heading) => {
    const headingText = cleanText($(heading).text()).toLowerCase();
    if (!names.some(n => headingText.includes(n))) return;

    let el = $(heading).next();
    while (el.length && !['h2', 'h3'].includes(el[0].tagName)) {
      if (el.is('p')) {
        const text = cleanText(el.text());
        if (text) parts.push(text);
      } else if (el.is('ul, ol')) {
        el.find('li').each((__, li) => {
          const text = cleanText($(li).text());
          if (text) parts.push(`• ${text}`);
        });
      } else if (el.is('table')) {
        el.find('tr').each((__, tr) => {
          const row = cleanText($(tr).text());
          if (row) parts.push(`• ${row}`);
        });
      }
      el = el.next();
    }
  });

  const joined = parts.join('\n');
  return joined.length > maxLength ? `${joined.slice(0, maxLength - 1).trim()}…` : joined;
}

async function fetchQuestDetails(url) {
  if (!url) return null;
  try {
    const page = pageNameFromUrl(url);
    const html = await fetchWikiHtml(page);
    const $ = cheerio.load(html);
    const objectives = extractSectionText($, ['Objectives', 'Objective'], 700);
    const rewards = extractSectionText($, ['Reward', 'Rewards'], 700);
    return { objectives, rewards };
  } catch (err) {
    console.warn('[GW Activities] Failed to fetch quest details:', url, err.message);
    return null;
  }
}

async function enrichDailyItem(item) {
  const details = await fetchQuestDetails(item.url);
  return { ...item, details };
}

async function enrichWeeklyItem(item) {
  if (item.label === 'Weekly Bonus' && !item.url) return item;
  const details = await fetchQuestDetails(item.url);
  return { ...item, details };
}

function nextDailyReset(hourUtc, from = new Date()) {
  const next = new Date(Date.UTC(
    from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate(), hourUtc, 0, 0, 0
  ));
  if (next <= from) next.setUTCDate(next.getUTCDate() + 1);
  return next;
}

function nextWeeklyReset(from = new Date()) {
  const next = new Date(Date.UTC(
    from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate(), WEEKLY_RESET_HOUR_UTC, 0, 0, 0
  ));
  const day = next.getUTCDay(); // Sunday 0, Monday 1
  const daysUntilMonday = (1 - day + 7) % 7;
  next.setUTCDate(next.getUTCDate() + daysUntilMonday);
  if (next <= from) next.setUTCDate(next.getUTCDate() + 7);
  return next;
}

export function getNextDailyQuestReset(from = new Date()) { return nextDailyReset(DAILY_RESET_HOUR_UTC, from); }
export function getNextSandfordReset(from = new Date()) { return nextDailyReset(SANDFORD_RESET_HOUR_UTC, from); }
export function getNextWeeklyReset(from = new Date()) { return nextWeeklyReset(from); }

function unix(date) { return Math.floor(date.getTime() / 1000); }

function fieldValueForItem(item) {
  const title = item.url ? `[${item.title || 'Open wiki page'}](${item.url})` : (item.title || 'Unknown');
  const chunks = [title];

  if (item.details?.objectives) chunks.push(`**Objectives**\n${item.details.objectives}`);
  if (item.details?.rewards) chunks.push(`**Reward**\n${item.details.rewards}`);

  if (!item.details?.objectives && !item.details?.rewards && item.raw && item.raw !== item.title) {
    chunks.push(item.raw.slice(0, 350));
  }

  const value = chunks.join('\n');
  return value.length > 1024 ? `${value.slice(0, 1021).trim()}…` : value;
}

export async function buildDailyActivitiesEmbed() {
  const html = await fetchWikiHtml(DAILY_PAGE);
  const rows = extractActivityRows(html);
  const preferred = ['Zaishen Mission', 'Zaishen Bounty', 'Zaishen Vanquish', 'Zaishen Combat', 'Wanted', 'Nicholas Sandford'];

  const picked = [];
  for (const label of preferred) {
    const found = rows.find(r => r.label === label);
    if (found) picked.push(found);
  }
  for (const row of rows) if (!picked.some(p => p.label === row.label && p.url === row.url)) picked.push(row);

  const enriched = [];
  for (const item of picked.slice(0, 8)) enriched.push(await enrichDailyItem(item));

  const questReset = getNextDailyQuestReset();
  const sandfordReset = getNextSandfordReset();

  const embed = new EmbedBuilder()
    .setTitle('Guild Wars Daily Activities')
    .setURL(`${WIKI_BASE}/wiki/${DAILY_PAGE}`)
    .setColor(0x2f80ed)
    .setDescription([
      `Zaishen quests reset <t:${unix(questReset)}:R> at <t:${unix(questReset)}:t>.`,
      `Nicholas Sandford resets <t:${unix(sandfordReset)}:R> at <t:${unix(sandfordReset)}:t>.`
    ].join('\n'))
    .setTimestamp()
    .setFooter({ text: 'Source: Guild Wars Wiki' });

  if (!enriched.length) {
    embed.addFields({ name: 'No activities found', value: 'Charles could not parse the daily activities page. Check the wiki link above.' });
  } else {
    for (const item of enriched) embed.addFields({ name: item.label, value: fieldValueForItem(item) });
  }

  return embed;
}

function extractWeeklyBonusFromBonusesPage(html) {
  const $ = cheerio.load(html);
  const candidates = [];

  $('tr, li, p').each((_, el) => {
    const text = cleanText($(el).text());
    if (!text) return;
    if (/current|this week|active/i.test(text) || findKnownLabel(text) === 'Weekly Bonus') {
      const link = $(el).find('a[href^="/wiki/"]').first();
      candidates.push({
        label: 'Weekly Bonus',
        title: cleanText(link.text()) || text,
        url: wikiUrlFromHref(link.attr('href')),
        raw: text
      });
    }
  });

  return candidates[0] || null;
}

export async function buildWeeklyActivitiesEmbed() {
  const [weeklyHtml, bonusesHtml] = await Promise.all([
    fetchWikiHtml(WEEKLY_PAGE),
    fetchWikiHtml(WEEKLY_BONUSES_PAGE).catch(() => null)
  ]);

  const rows = extractActivityRows(weeklyHtml);
  const bonus = bonusesHtml ? extractWeeklyBonusFromBonusesPage(bonusesHtml) : null;
  if (bonus && !rows.some(r => r.label === 'Weekly Bonus')) rows.push(bonus);

  const preferred = ['Nicholas the Traveler', 'Weekly Bonus'];
  const picked = [];
  for (const label of preferred) {
    const found = rows.find(r => r.label === label);
    if (found) picked.push(found);
  }
  for (const row of rows) if (!picked.some(p => p.label === row.label && p.url === row.url)) picked.push(row);

  const enriched = [];
  for (const item of picked.slice(0, 8)) enriched.push(await enrichWeeklyItem(item));

  const weeklyReset = getNextWeeklyReset();
  const embed = new EmbedBuilder()
    .setTitle('Guild Wars Weekly Activities')
    .setURL(`${WIKI_BASE}/wiki/${WEEKLY_PAGE}`)
    .setColor(0xf2c94c)
    .setDescription(`Weekly bonuses and Nicholas the Traveler reset <t:${unix(weeklyReset)}:R> at <t:${unix(weeklyReset)}:t>.`)
    .setTimestamp()
    .setFooter({ text: 'Source: Guild Wars Wiki' });

  if (!enriched.length) {
    embed.addFields({ name: 'No activities found', value: 'Charles could not parse the weekly activities page. Check the wiki link above.' });
  } else {
    for (const item of enriched) embed.addFields({ name: item.label, value: fieldValueForItem(item) });
  }

  return embed;
}

async function safeDeleteMessage(client, channelId, messageId) {
  if (!channelId || !messageId) return;
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel || !channel.isTextBased()) return;
  const message = await channel.messages.fetch(messageId).catch(() => null);
  if (message) await message.delete().catch(() => {});
}

async function sendActivityPost(client, guildId, type, buildEmbed) {
  const config = loadActivitiesConfig();
  const guildConfig = config[guildId];
  if (!guildConfig) return;

  const channelId = type === 'daily' ? guildConfig.dailyChannelId : guildConfig.weeklyChannelId;
  if (!channelId) return;

  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel || !channel.isTextBased()) return;

  const oldMessageId = type === 'daily' ? guildConfig.lastDailyMessageId : guildConfig.lastWeeklyMessageId;
  await safeDeleteMessage(client, channelId, oldMessageId);

  const embed = await buildEmbed();
  const rolePing = guildConfig.pingRoleId ? `<@&${guildConfig.pingRoleId}>` : null;
  const message = await channel.send({
    content: rolePing || undefined,
    embeds: [embed],
    allowedMentions: guildConfig.pingRoleId ? { roles: [guildConfig.pingRoleId] } : { parse: [] }
  });

  if (type === 'daily') guildConfig.lastDailyMessageId = message.id;
  else guildConfig.lastWeeklyMessageId = message.id;
  saveActivitiesConfig(config);
}

export async function postDailyActivities(client, guildId) {
  await sendActivityPost(client, guildId, 'daily', buildDailyActivitiesEmbed);
}

export async function postWeeklyActivities(client, guildId) {
  await sendActivityPost(client, guildId, 'weekly', buildWeeklyActivitiesEmbed);
}

function msUntil(date) { return Math.max(1_000, date.getTime() - Date.now()); }

export function startGwActivitiesScheduler(client) {
  async function postDailyForAllGuilds() {
    const config = loadActivitiesConfig();
    for (const guildId of Object.keys(config)) {
      await postDailyActivities(client, guildId).catch(err => console.error(`[GW Activities] Daily post failed for ${guildId}:`, err));
    }
  }

  async function postWeeklyForAllGuilds() {
    const config = loadActivitiesConfig();
    for (const guildId of Object.keys(config)) {
      await postWeeklyActivities(client, guildId).catch(err => console.error(`[GW Activities] Weekly post failed for ${guildId}:`, err));
    }
  }

  function scheduleDaily() {
    const next = getNextDailyQuestReset();
    console.log(`[GW Activities] Next daily post scheduled at ${next.toISOString()}`);
    setTimeout(async () => {
      await postDailyForAllGuilds();
      scheduleDaily();
    }, msUntil(next));
  }

  function scheduleWeekly() {
    const next = getNextWeeklyReset();
    console.log(`[GW Activities] Next weekly post scheduled at ${next.toISOString()}`);
    setTimeout(async () => {
      await postWeeklyForAllGuilds();
      scheduleWeekly();
    }, msUntil(next));
  }

  scheduleDaily();
  scheduleWeekly();
}
