import fs from 'fs';

const REWARDS_FILE = new URL(
  '../resources/gwDailyRewards.json',
  import.meta.url
);

const catalog = JSON.parse(
  fs.readFileSync(REWARDS_FILE, 'utf8')
);

const typeByLabel = {
  'Zaishen Mission': 'Mission',
  'Zaishen Bounty': 'Bounty',
  'Zaishen Vanquish': 'Vanquish',
  'Zaishen Combat': 'Combat'
};

function normalizeName(value = '') {
  return value
    .normalize('NFKD')
    .replace(/[’‘]/g, "'")
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const rewardIndex = new Map(
  Object.values(catalog.items || {}).map(item => [
    `${item.type.toLowerCase()}|${normalizeName(item.name)}`,
    item
  ])
);

function formatNumber(value) {
  return Number(value || 0).toLocaleString('en-US');
}

function findReward(item) {
  const type = typeByLabel[item.label];

  if (!type) return null;

  const key =
    `${type.toLowerCase()}|${normalizeName(item.title)}`;

  return rewardIndex.get(key) || null;
}

function buildObjectives(item) {
  const title = item.title || 'this activity';

  switch (item.label) {
    case 'Zaishen Mission':
      return [
        `• Complete **${title}**.`,
        '• Complete the mission bonus objective.',
        '• Complete the mission in Hard Mode.'
      ].join('\n');

    case 'Zaishen Bounty':
      return [
        `• Find and defeat **${title}**.`,
        '• Defeat the target in Hard Mode for the bonus.'
      ].join('\n');

    case 'Zaishen Vanquish':
      return [
        `• Vanquish every foe in **${title}**.`,
        '• Vanquishing requires Hard Mode.'
      ].join('\n');

    case 'Zaishen Combat':
      return [
        `• Complete the PvP objectives in **${title}**.`,
        '• Rewards are earned across the listed victory tiers.'
      ].join('\n');

    default:
      return '';
  }
}

function buildCoinLine(coins = {}) {
  const parts = [];

  if (coins.base) {
    parts.push(`${formatNumber(coins.base)} base`);
  }

  if (coins.firstBonus) {
    parts.push(
      `${formatNumber(coins.firstBonus)} first bonus`
    );
  }

  if (coins.hardModeBonus) {
    parts.push(
      `${formatNumber(coins.hardModeBonus)} Hard Mode bonus`
    );
  }

  const calculatedTotal =
    Number(coins.base || 0) +
    Number(coins.firstBonus || 0) +
    Number(coins.hardModeBonus || 0);

  const total = Number(coins.total || calculatedTotal);

  if (!total) return null;

  if (!parts.length) {
    return `• ${formatNumber(total)} Copper Zaishen Coins`;
  }

  return [
    '• Copper Zaishen Coins:',
    `  ${parts.join(' + ')} = **${formatNumber(total)} total**`
  ].join('\n');
}

function buildRewards(reward) {
  const lines = [];

  if (reward.experience) {
    lines.push(
      `• **${formatNumber(reward.experience)} XP**`
    );
  }

  if (reward.gold) {
    lines.push(
      `• **${formatNumber(reward.gold)} gold**`
    );
  }

  if (reward.faction) {
    lines.push(
      `• **${formatNumber(reward.faction)}** ` +
      `${reward.factionType || 'faction points'}`
    );
  }

  const coinLine = buildCoinLine(reward.coins);

  if (coinLine) {
    lines.push(coinLine);
  }

  return lines.join('\n');
}

export function getDailyRewardDetails(item) {
  const reward = findReward(item);

  if (!reward) return null;

  return {
    source: 'local-reward-catalog',
    url: reward.url || item.url,
    campaign: reward.campaign || null,
    region: reward.region || null,
    objectives: buildObjectives(item),
    rewards: buildRewards(reward)
  };
}
