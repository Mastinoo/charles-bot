import fs from 'fs';

const ROTATION_FILE = './resources/gwWeeklyRotations.json';
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

let cached = null;

function loadRotation() {
  if (cached) return cached;
  cached = JSON.parse(fs.readFileSync(ROTATION_FILE, 'utf8'));

  if (!Array.isArray(cached.nicholas) || cached.nicholas.length !== 137) {
    throw new Error(`Invalid Nicholas rotation: expected 137 entries, got ${cached.nicholas?.length ?? 0}`);
  }

  return cached;
}

export function getLocalWeeklyNicholas(from = new Date()) {
  const data = loadRotation();
  const epoch = new Date(data.epochUtc);
  const diffWeeks = Math.floor((from.getTime() - epoch.getTime()) / WEEK_MS);
  const index = ((diffWeeks % data.nicholas.length) + data.nicholas.length) % data.nicholas.length;
  const entry = data.nicholas[index];

  return {
    ...entry,
    index,
    item: `${entry.item} (${entry.quantity}x)`
  };
}

export function getWeeklyRotationMetadata() {
  const data = loadRotation();
  return {
    version: data.version,
    source: data.source,
    epochUtc: data.epochUtc,
    reset: data.reset,
    cycleLength: data.cycleLength
  };
}
