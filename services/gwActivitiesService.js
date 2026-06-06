import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import { EmbedBuilder } from 'discord.js';
import fs from 'fs';

const WIKI_BASE = 'https://wiki.guildwars.com';
const API_URL = `${WIKI_BASE}/api.php`;
const CONFIG_FILE = './data/gwActivitiesConfig.json';
const USER_AGENT = 'CharlesBot/1.0 (https://github.com/Mastinoo/charles-bot; Discord bot for Guild Wars communities)';

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
  const url = `${API_URL}?action=parse&page=${encodeURIComponent(page)}&prop=text&format=json`;

  const res = await fetch(url, {
    headers: {
      'User-Agent': 'CharlesBot/1.0 (Guild Wars Discord bot)',
      'Accept': 'application/json'
    }
  });

  const contentType = res.headers.get('content-type') || '';

  if (!res.ok || !contentType.includes('application/json')) {
    const body = await res.text();
    console.warn('[GW Activities] Wiki API returned non-JSON response:', {
      page,
      status: res.status,
      contentType,
      preview: body.slice(0, 300)
    });
    throw new Error(`Wiki API failed for ${page}: ${res.status}`);
  }

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
  const today = new Date();

  const day = today.getUTCDate();
  const month = today.toLocaleString('en-US', { month: 'long', timeZone: 'UTC' });
  const year = today.getUTCFullYear();

  const todayPatterns = [
    `${day} ${month} ${year}`,
    `${day} ${month}`,
  ];

  const sectionLabels = [
    'Zaishen Mission',
    'Zaishen Bounty',
    'Zaishen Combat',
    'Zaishen Vanquish',
    'Shining Blade',
    'Vanguard Quest',
    'Nicholas Sandford'
  ];

  let result = [];

  $('table.wikitable tr').each((_, tr) => {
    const cells = $(tr).find('td, th');
    if (cells.length < 7) return;

    const dateText = cleanText($(cells[0]).text());

    const isToday = todayPatterns.some(p => dateText.includes(p));
    if (!isToday) return;

    result = sectionLabels.map((label, index) => {
      const cell = $(cells[index + 1]);
      const link = cell.find('a[href^="/wiki/"]').first();

      const title = cleanText(link.text()) || cleanText(cell.text());
      const href = link.attr('href');

      let url = wikiUrlFromHref(href);

      // Zaishen Mission pages usually need "(Zaishen quest)"
      if (label === 'Zaishen Mission' && title && !url?.includes('(Zaishen_quest)')) {
        url = `${WIKI_BASE}/wiki/${encodeURIComponent(title.replaceAll(' ', '_'))}_(Zaishen_quest)`;
      }

      return {
        label,
        title,
        url,
        raw: cleanText(cell.text())
      };
    });
  });

  return result;
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

function compactValue(item) {
  return item.url
    ? `**[${item.title || 'Unknown'}](${item.url})**`
    : `**${item.title || 'Unknown'}**`;
}

function buildDetailEmbed(item, color) {
  const embed = new EmbedBuilder()
    .setTitle(`${item.label}: ${item.title}`)
    .setURL(item.url || null)
    .setColor(color)
    .setFooter({ text: 'Source: Guild Wars Wiki' });

  if (item.details?.objectives) {
    embed.addFields({
      name: 'Objectives',
      value: item.details.objectives.slice(0, 1024)
    });
  }

  if (item.details?.rewards) {
    embed.addFields({
      name: 'Rewards',
      value: item.details.rewards.slice(0, 1024)
    });
  }

  return embed;
}

export async function buildDailyActivitiesEmbed() {
  const html = await fetchWikiHtml(DAILY_PAGE);
  const rows = extractActivityRows(html);

  const preferred = [
    'Zaishen Mission',
    'Zaishen Bounty',
    'Zaishen Vanquish',
    'Zaishen Combat',
    'Shining Blade',
    'Vanguard Quest',
    'Nicholas Sandford'
  ];

  const picked = preferred
    .map(label => rows.find(r => r.label === label))
    .filter(Boolean);

  const enriched = [];
  for (const item of picked) {
    if (
      ['Zaishen Mission', 'Zaishen Bounty', 'Zaishen Vanquish', 'Zaishen Combat'].includes(item.label)
    ) {
      enriched.push(await enrichDailyItem(item));
    } else {
      enriched.push(item);
    }
  }

  const questReset = getNextDailyQuestReset();
  const sandfordReset = getNextSandfordReset();

  const overview = new EmbedBuilder()
    .setTitle('Guild Wars Daily Activities')
    .setURL(`${WIKI_BASE}/wiki/${DAILY_PAGE}`)
    .setColor(0xf2c94c)
    .setDescription([
      `⏰ Zaishen quests reset <t:${unix(questReset)}:R>`,
      `🎁 Nicholas Sandford resets <t:${unix(sandfordReset)}:R>`
    ].join('\n'))
    .setTimestamp()
    .setFooter({ text: 'Source: Guild Wars Wiki' });

  for (const item of enriched) {
    overview.addFields({
      name: item.label,
      value: compactValue(item),
      inline: true
    });
  }

  const detailColors = {
    'Zaishen Mission': 0x2f80ed,
    'Zaishen Bounty': 0x9b51e0,
    'Zaishen Vanquish': 0x27ae60,
    'Zaishen Combat': 0xeb5757
  };

  const detailEmbeds = enriched
    .filter(item => detailColors[item.label] && item.details)
    .map(item => buildDetailEmbed(item, detailColors[item.label]));

  return [overview, ...detailEmbeds];
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

const PVE_WEEKLY_BONUSES = [
  {
    name: 'Extra Luck Bonus',
    description: 'Keys and lockpicks drop at four times the usual rate. Double Lucky and Unlucky title points.'
  },
  {
    name: 'Elonian Support Bonus',
    description: 'Double Sunspear and Lightbringer points.'
  },
  {
    name: 'Zaishen Bounty Bonus',
    description: 'Double copper Zaishen Coin rewards for Zaishen bounties.'
  },
  {
    name: 'Factions Elite Bonus',
    description: "The Deep and Urgoz's Warren can be entered from Kaineng Center."
  },
  {
    name: 'Northern Support Bonus',
    description: 'Double Asura, Deldrimor, Ebon Vanguard, or Norn reputation points.'
  },
  {
    name: 'Zaishen Mission Bonus',
    description: 'Double copper Zaishen Coin rewards for Zaishen missions.'
  },
  {
    name: 'Pantheon Bonus',
    description: 'Free passage to the Underworld and the Fissure of Woe.'
  },
  {
    name: 'Faction Support Bonus',
    description: 'Double Kurzick and Luxon title track points for exchanging faction.'
  },
  {
    name: 'Zaishen Vanquishing Bonus',
    description: 'Double copper Zaishen Coin rewards for Zaishen vanquishes.'
  }
];

const PVP_WEEKLY_BONUSES = [
  {
    name: 'Random Arenas Bonus',
    description: 'Double Balthazar faction and Gladiator title points in Random Arenas.'
  },
  {
    name: 'Guild Versus Guild Bonus',
    description: 'Double Balthazar faction and Champion title points in GvG.'
  },
  {
    name: 'Competitive Mission Bonus',
    description: 'Double Balthazar and Imperial faction in the Jade Quarry and Fort Aspenwood.'
  },
  {
    name: "Heroes' Ascent Bonus",
    description: "Double Balthazar faction and Hero title points in Heroes' Ascent."
  },
  {
    name: 'Codex Arena Bonus',
    description: 'Double Balthazar faction and Codex title points in Codex Arena.'
  },
  {
    name: 'Alliance Battle Bonus',
    description: 'Double Balthazar and Imperial faction in Alliance Battles.'
  }
];

function getCurrentWeeklyBonus(rotation, anchorIndex, from = new Date()) {
  // Anchor: 1 June 2026 15:00 UTC
  // PvE = Pantheon Bonus
  // PvP = Heroes' Ascent Bonus
  const anchor = Date.UTC(2026, 5, 1, 15, 0, 0, 0);
  const now = from.getTime();

  const weekMs = 7 * 24 * 60 * 60 * 1000;
  const diffWeeks = Math.floor((now - anchor) / weekMs);

  const index = ((anchorIndex + diffWeeks) % rotation.length + rotation.length) % rotation.length;
  return rotation[index];
}

function extractNicholasTraveler(html) {
  const $ = cheerio.load(html);

  const now = new Date();

  const currentMonday = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    0, 0, 0, 0
  ));

  const day = currentMonday.getUTCDay(); // Sunday 0, Monday 1
  const diffToMonday = (day + 6) % 7;
  currentMonday.setUTCDate(currentMonday.getUTCDate() - diffToMonday);

  const datePattern = `${currentMonday.getUTCDate()} ${currentMonday.toLocaleString('en-US', {
    month: 'long',
    timeZone: 'UTC'
  })} ${currentMonday.getUTCFullYear()}`;

  let result = {
    item: null,
    itemUrl: null,
    location: null,
    locationUrl: null
  };

  $('table.wikitable tr').each((_, tr) => {
    const cells = $(tr).find('td, th');
    if (cells.length < 6) return;

    const dateText = cleanText($(cells[0]).text());
    if (!dateText.includes(datePattern)) return;

    const itemCell = $(cells[3]);
    const locationCell = $(cells[4]);

    const itemLink = itemCell.find('a[href^="/wiki/"]').first();
    const locationLink = locationCell.find('a[href^="/wiki/"]').first();

    result = {
      item: cleanText(itemCell.text()),
      itemUrl: wikiUrlFromHref(itemLink.attr('href')),
      location: cleanText(locationCell.text()),
      locationUrl: wikiUrlFromHref(locationLink.attr('href'))
    };
  });

  return result;
}

export async function buildWeeklyActivitiesEmbed() {
  const weeklyHtml = await fetchWikiHtml(WEEKLY_PAGE);

  const nicholas = extractNicholasTraveler(weeklyHtml);

  const pveBonus = getCurrentWeeklyBonus(PVE_WEEKLY_BONUSES, 6);
  const pvpBonus = getCurrentWeeklyBonus(PVP_WEEKLY_BONUSES, 3);

  const weeklyReset = getNextWeeklyReset();

  const embed = new EmbedBuilder()
    .setTitle('Guild Wars Weekly Activities')
    .setURL(`${WIKI_BASE}/wiki/${WEEKLY_PAGE}`)
    .setColor(0xf2c94c)
    .setDescription(`⏰ Weekly reset <t:${unix(weeklyReset)}:R>`)
    .setTimestamp()
    .setFooter({ text: 'Source: Guild Wars Wiki + static weekly rotation' });

  if (nicholas?.item || nicholas?.location) {
    const itemText = nicholas.itemUrl
      ? `[${nicholas.item}](${nicholas.itemUrl})`
      : nicholas.item || 'Unknown item';

    const locationText = nicholas.locationUrl
      ? `[${nicholas.location}](${nicholas.locationUrl})`
      : nicholas.location || 'Unknown location';

    embed.addFields({
      name: '🎁 Nicholas the Traveler',
      value: [
        `**Item:** ${itemText}`,
        `**Location:** ${locationText}`
      ].join('\n'),
      inline: false
    });
  } else {
    embed.addFields({
      name: '🎁 Nicholas the Traveler',
      value: 'Could not parse Nicholas data from the weekly activities page.',
      inline: false
    });
  }

  embed.addFields(
    {
      name: '🌍 PvE Weekly Bonus',
      value: `**${pveBonus.name}**\n${pveBonus.description}`,
      inline: false
    },
    {
      name: '⚔️ PvP Weekly Bonus',
      value: `**${pvpBonus.name}**\n${pvpBonus.description}`,
      inline: false
    }
  );

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

  const built = await buildEmbed();
  const embeds = Array.isArray(built) ? built : [built];
  const rolePing = guildConfig.pingRoleId ? `<@&${guildConfig.pingRoleId}>` : null;
  const message = await channel.send({
    content: rolePing || undefined,
    embeds,
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
