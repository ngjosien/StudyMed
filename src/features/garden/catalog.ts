// What grows in the study garden: flowers, each in five colours. A flower's colour
// is decided by how many days of study it took to bloom: one day gives the rarest
// colour. Bloomed flowers give laurels: more for longer flowers and rarer colours.
// Every month gets a new land with one flower bed per day of the month.

export interface Hue {
  name: string;
  petal: string;
  centre?: string;
}

export interface Species {
  id: string;
  name: string;
  minutes: number; // study time to bloom
  unlock: number; // flowers bloomed first
  blurb: string;
  hues: [Hue, Hue, Hue, Hue, Hue]; // most common .. rarest
}

const white = (centre?: string): Hue => ({ name: "White", petal: "#fbf6ee", centre });

export const SPECIES: Species[] = [
  {
    id: "daisy",
    name: "Daisy",
    minutes: 60,
    unlock: 0,
    blurb: "A ring of slim petals round a sunny middle.",
    hues: [white("#ffcf3a"), { name: "Butter", petal: "#ffe07a", centre: "#f5a524" }, { name: "Pink", petal: "#ffb3cb", centre: "#ffcf3a" }, { name: "Lilac", petal: "#cdb4f4", centre: "#ffd84d" }, { name: "Sky blue", petal: "#8fc6ff", centre: "#ffe066" }],
  },
  {
    id: "pansy",
    name: "Pansy",
    minutes: 60,
    unlock: 0,
    blurb: "Five round petals with a little face.",
    hues: [{ name: "Yellow", petal: "#ffd54a" }, white(), { name: "Red", petal: "#e9505e" }, { name: "Purple", petal: "#a06ddb" }, { name: "Blue", petal: "#5b87ea" }],
  },
  {
    id: "tulip",
    name: "Tulip",
    minutes: 90,
    unlock: 0,
    blurb: "A plump cup of petals on a sturdy stem.",
    hues: [white(), { name: "Yellow", petal: "#ffd23f" }, { name: "Red", petal: "#f2535f" }, { name: "Pink", petal: "#ff9fc2" }, { name: "Purple", petal: "#a777e2" }],
  },
  {
    id: "cosmos",
    name: "Cosmos",
    minutes: 120,
    unlock: 1,
    blurb: "Wide, flat petals that dance on thin stems.",
    hues: [white("#ffcc33"), { name: "Pink", petal: "#ff9fcc", centre: "#ffcc33" }, { name: "Yellow", petal: "#ffd75e", centre: "#f29a1f" }, { name: "Orange", petal: "#ff9d4d", centre: "#ffd23f" }, { name: "Chocolate", petal: "#83423f", centre: "#e0a640" }],
  },
  {
    id: "poppy",
    name: "Poppy",
    minutes: 120,
    unlock: 2,
    blurb: "Four silky petals and a dark heart.",
    hues: [{ name: "Red", petal: "#f04d4d" }, { name: "Orange", petal: "#ff8c42" }, white(), { name: "Pink", petal: "#ff9fb8" }, { name: "Blue", petal: "#6ea9ff" }],
  },
  {
    id: "anemone",
    name: "Anemone",
    minutes: 150,
    unlock: 3,
    blurb: "Round petals round a deep navy centre.",
    hues: [white(), { name: "Red", petal: "#ea4a5a" }, { name: "Pink", petal: "#ffa3c4" }, { name: "Blue", petal: "#5f8ff0" }, { name: "Purple", petal: "#8f5bd8" }],
  },
  {
    id: "hyacinth",
    name: "Hyacinth",
    minutes: 180,
    unlock: 4,
    blurb: "A tower of tiny star-shaped flowers.",
    hues: [white(), { name: "Pink", petal: "#ffa6c4" }, { name: "Yellow", petal: "#ffd866" }, { name: "Blue", petal: "#7096f2" }, { name: "Purple", petal: "#9b70e2" }],
  },
  {
    id: "lily",
    name: "Lily",
    minutes: 210,
    unlock: 5,
    blurb: "Six pointed petals that curl back.",
    hues: [white(), { name: "Yellow", petal: "#ffd84a" }, { name: "Orange", petal: "#ff9440" }, { name: "Pink", petal: "#ffa0c0" }, { name: "Chocolate", petal: "#7d3c3f" }],
  },
  {
    id: "mum",
    name: "Chrysanthemum",
    minutes: 240,
    unlock: 6,
    blurb: "A round pom-pom of layered petals.",
    hues: [white(), { name: "Yellow", petal: "#ffd246" }, { name: "Red", petal: "#e84d55" }, { name: "Purple", petal: "#9a64d8" }, { name: "Green", petal: "#bce06c" }],
  },
  {
    id: "rose",
    name: "Rose",
    minutes: 300,
    unlock: 7,
    blurb: "Spiralling petals, the classic.",
    hues: [white(), { name: "Yellow", petal: "#ffd649" }, { name: "Red", petal: "#e63b4f" }, { name: "Pink", petal: "#ff9ebe" }, { name: "Blue", petal: "#6d90ec" }],
  },
  {
    id: "peony",
    name: "Peony",
    minutes: 330,
    unlock: 8,
    blurb: "Big ruffled blooms like soft pom-poms.",
    hues: [white(), { name: "Blush", petal: "#ffd0da" }, { name: "Coral", petal: "#ff9a88" }, { name: "Magenta", petal: "#e0579c" }, { name: "Gold", petal: "#ffd36b" }],
  },
  {
    id: "bells",
    name: "Lily of the valley",
    minutes: 360,
    unlock: 10,
    blurb: "Arching stems of little hanging bells.",
    hues: [white(), { name: "Cream", petal: "#fff1c4" }, { name: "Pink", petal: "#ffc4d6" }, { name: "Lilac", petal: "#d4c0f6" }, { name: "Gold", petal: "#ffdf80" }],
  },
];
export const speciesById = new Map(SPECIES.map((s) => [s.id, s]));

/* ------------------------------------------------------------ Colours and rewards */
export const RARITY = ["Common", "Uncommon", "Rare", "Very rare", "Rarest"];
/** Colour tier from the number of days a flower took to bloom. */
export function tierOf(days: number) {
  if (days <= 1) return 4;
  if (days === 2) return 3;
  if (days === 3) return 2;
  if (days <= 5) return 1;
  return 0;
}
export const TIER_RULE = ["6+ days", "4 or 5 days", "3 days", "2 days", "1 day"];
/** Flowers grown before colours were kept get this tier. */
export const LEGACY_TIER = 2;
const PER_HOUR = [6, 9, 12, 16, 22];
/** Laurels for a bloomed flower: more for longer flowers and rarer colours. */
export const bloomLaurels = (minutes: number, tier: number) => Math.max(3, Math.round((minutes / 60) * PER_HOUR[tier]));

/** Days that count toward a flower's colour: days it got at least 10 minutes (and at least one). */
export function countDays(credits: { date: string; minutes: number }[], extra?: { date: string; minutes: number }) {
  const by = new Map<string, number>();
  for (const c of extra ? [...credits, extra] : credits) by.set(c.date, (by.get(c.date) ?? 0) + Number(c.minutes));
  let n = 0;
  for (const v of by.values()) if (v >= 10) n++;
  return Math.max(1, n);
}

/* ------------------------------------------------------------ Decorations */
export interface Decor {
  id: string;
  name: string;
  cost: number; // laurels
}

export const DECOR: Decor[] = [
  { id: "path", name: "Stepping stones", cost: 20 },
  { id: "rocks", name: "Mossy rocks", cost: 25 },
  { id: "fence", name: "Wooden fence", cost: 30 },
  { id: "mushrooms", name: "Mushrooms", cost: 40 },
  { id: "flowerbox", name: "Flower box", cost: 50 },
  { id: "can", name: "Watering can", cost: 60 },
  { id: "hedge", name: "Round hedge", cost: 70 },
  { id: "lantern", name: "Stone lantern", cost: 80 },
  { id: "tree_round", name: "Round tree", cost: 90 },
  { id: "lamp", name: "Garden lamp", cost: 100 },
  { id: "bench", name: "Bench", cost: 120 },
  { id: "tree_fruit", name: "Orange tree", cost: 140 },
  { id: "tree_autumn", name: "Autumn tree", cost: 140 },
  { id: "birdbath", name: "Bird bath", cost: 150 },
  { id: "tree_blossom", name: "Blossom tree", cost: 180 },
  { id: "pond", name: "Lily pond", cost: 200 },
  { id: "arch", name: "Rose arch", cost: 250 },
];
export const decorById = new Map(DECOR.map((d) => [d.id, d]));

/* ------------------------------------------------------------ Monthly lands */
export const LAND_COLS = 7;
export const LAND_ROWS = 6;
export const LAND_CELLS = LAND_COLS * LAND_ROWS;
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const landOf = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
/** One flower bed per day of the month. */
export function bedsIn(land: string) {
  const [y, m] = land.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}
export function landName(land: string) {
  const [y, m] = land.split("-").map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

/** The first empty flower bed in a land, or null when it is full. */
export function firstFreeBed(plants: { land?: unknown; plot?: unknown }[], decor: { land?: unknown; plot?: unknown }[], land: string) {
  const taken = new Set([...plants, ...decor].filter((r) => (r.land ?? land) === land).map((r) => Number(r.plot)));
  for (let i = 0; i < bedsIn(land); i++) if (!taken.has(i)) return i;
  return null;
}

export const STAGE_NAMES = ["Seed", "Sprout", "Leafy", "Budding", "Opening", "In bloom"];
export function stageOf(g: number) {
  if (g >= 1) return 5;
  if (g >= 0.8) return 4;
  if (g >= 0.5) return 3;
  if (g >= 0.22) return 2;
  if (g >= 0.06) return 1;
  return 0;
}
