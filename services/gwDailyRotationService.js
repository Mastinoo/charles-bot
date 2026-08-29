import fs from 'fs';

const WIKI_BASE = 'https://wiki.guildwars.com';

const ROTATIONS_FILE = new URL(
  '../resources/gwDailyRotations.json',
  import.meta.url
);

const rotations = JSON.parse(
  fs.readFileSync(ROTATIONS_FILE, 'utf8')
);

function positiveModulo(value, divisor) {
  return ((value % divisor) + divisor) % divisor;
}

function currentCycleItem(cycleName, when = new Date()) {
  const cycle = rotations.cycles?.[cycleName];

  if (
    !cycle ||
    !Array.isArray(cycle.items) ||
    !cycle.items.length
  ) {
    throw new Error(
      `Missing local Guild Wars cycle: ${cycleName}`
    );
  }

  const unix = Math.floor(when.getTime() / 1000);

  const rotationNumber = Math.floor(
    (unix - cycle.epoch) / cycle.period
  );

  const index = positiveModulo(
    rotationNumber,
    cycle.items.length
  );

  return cycle.items[index];
}

function wikiUrl(page) {
  const encoded = encodeURIComponent(page)
    .replace(/%20/g, '_');

  return `${WIKI_BASE}/wiki/${encoded}`;
}

const vanguardPages = {
  Bandits: 'Vanguard_Annihilation:_Bandits',
  'Utini Wupwup':
    'Vanguard_Bounty:_Utini_Wupwup',
  'Ascalonian Noble':
    'Vanguard_Rescue:_Save_the_Ascalonian_Noble',
  Undead:
    'Vanguard_Annihilation:_Undead',
  'Blazefiend Griefblade':
    'Vanguard_Bounty:_Blazefiend_Griefblade',
  'Farmer Hamnet':
    'Vanguard_Rescue:_Farmer_Hamnet',
  Charr:
    'Vanguard_Annihilation:_Charr',
  'Countess Nadya':
    'Vanguard_Bounty:_Countess_Nadya',
  'Footman Tate':
    'Vanguard_Rescue:_Footman_Tate'
};

const sandfordPages = {
  'Grawl Necklaces': 'Grawl Necklace',
  'Baked Husks': 'Baked Husk',
  'Skeletal Limbs': 'Skeletal Limb',
  'Unnatural Seeds': 'Unnatural Seed',
  'Enchanted Lodestones': 'Enchanted Lodestone',
  'Skale Fins': 'Skale Fin (Pre-Searing)',
  'Icy Lodestones': 'Icy Lodestone',
  'Gargoyle Skulls': 'Gargoyle Skull',
  'Dull Carapaces': 'Dull Carapace',
  'Red Iris Flowers': 'Red Iris Flower',
  'Spider Legs': 'Spider Leg',
  'Charr Carvings': 'Charr Carving',
  'Worn Belts': 'Worn Belt'
};

function activity(label, title, page) {
  return {
    label,
    title,
    url: wikiUrl(page)
  };
}

export function getLocalDailyActivities(
  when = new Date()
) {
  const mission = currentCycleItem(
    'mission',
    when
  );

  const bounty = currentCycleItem(
    'bounty',
    when
  );

  const combat = currentCycleItem(
    'combat',
    when
  );

  const vanquish = currentCycleItem(
    'vanquish',
    when
  );

  const wanted = currentCycleItem(
    'wanted',
    when
  );

  const vanguard = currentCycleItem(
    'vanguard',
    when
  );

  const sandford = currentCycleItem(
    'sandford',
    when
  );

  return [
    activity(
      'Zaishen Mission',
      mission,
      `${mission} (Zaishen quest)`
    ),

    activity(
      'Zaishen Bounty',
      bounty,
      `${bounty} (Zaishen quest)`
    ),

    activity(
      'Zaishen Vanquish',
      vanquish,
      `${vanquish} (Zaishen vanquish)`
    ),

    activity(
      'Zaishen Combat',
      combat,
      `${combat} (Zaishen quest)`
    ),

    activity(
      'Shining Blade',
      wanted,
      `Wanted: ${wanted}`
    ),

    activity(
      'Vanguard Quest',
      vanguard,
      vanguardPages[vanguard] || vanguard
    ),

    activity(
      'Nicholas Sandford',
      sandford,
      sandfordPages[sandford] || sandford
    )
  ];
}
