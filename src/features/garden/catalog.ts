// What can grow in the study garden, and what can be placed in it.
// Plants are free to plant and grow only with study time; rarer ones unlock as
// more plants reach full bloom. Decorations are bought with laurels.

export interface Species {
  id: string;
  name: string;
  minutes: number; // study time to full bloom
  unlock: number; // fully grown plants needed first
  emoji: string;
  blurb: string;
}

export const SPECIES: Species[] = [
  { id: "clover", name: "Four-leaf clover", minutes: 30, unlock: 0, emoji: "🍀", blurb: "A quick one for a single focus session." },
  { id: "tulip", name: "Tulips", minutes: 60, unlock: 0, emoji: "🌷", blurb: "Three cheerful cups of colour." },
  { id: "daisy", name: "Daisies", minutes: 90, unlock: 0, emoji: "🌼", blurb: "A little meadow patch." },
  { id: "lavender", name: "Lavender", minutes: 120, unlock: 1, emoji: "💜", blurb: "Calm purple spikes. Smells like a long revision night." },
  { id: "cactus", name: "Cactus", minutes: 150, unlock: 2, emoji: "🌵", blurb: "Tough, patient, and it flowers in the end." },
  { id: "sunflower", name: "Sunflower", minutes: 180, unlock: 2, emoji: "🌻", blurb: "Tall and bright; it turns to face you." },
  { id: "rose", name: "Rose bush", minutes: 240, unlock: 3, emoji: "🌹", blurb: "A full bush that covers itself in roses." },
  { id: "hydrangea", name: "Hydrangea", minutes: 300, unlock: 4, emoji: "💠", blurb: "Big pom-poms of blue and violet." },
  { id: "pumpkin", name: "Pumpkin", minutes: 360, unlock: 5, emoji: "🎃", blurb: "Starts as a flower, ends as a prize pumpkin." },
  { id: "bamboo", name: "Bamboo", minutes: 420, unlock: 6, emoji: "🎋", blurb: "A stand of tall, segmented canes." },
  { id: "pine", name: "Pine tree", minutes: 480, unlock: 7, emoji: "🌲", blurb: "An evergreen with pine cones." },
  { id: "lemon", name: "Lemon tree", minutes: 600, unlock: 8, emoji: "🍋", blurb: "Blossoms first, then a crown of lemons." },
  { id: "maple", name: "Maple tree", minutes: 720, unlock: 9, emoji: "🍁", blurb: "Autumn reds and golds all year round." },
  { id: "cherry", name: "Cherry blossom", minutes: 900, unlock: 10, emoji: "🌸", blurb: "The showpiece. Petals drift down once it blooms." },
];
export const speciesById = new Map(SPECIES.map((s) => [s.id, s]));

export interface Decor {
  id: string;
  name: string;
  cost: number; // laurels
  emoji: string;
}

export const DECOR: Decor[] = [
  { id: "path", name: "Stepping stones", cost: 20, emoji: "🪨" },
  { id: "rocks", name: "Mossy rocks", cost: 25, emoji: "⛰️" },
  { id: "fence", name: "Wooden fence", cost: 30, emoji: "🪵" },
  { id: "mushrooms", name: "Mushrooms", cost: 40, emoji: "🍄" },
  { id: "flowerbox", name: "Flower box", cost: 50, emoji: "💐" },
  { id: "can", name: "Watering can", cost: 60, emoji: "🫗" },
  { id: "hedge", name: "Round hedge", cost: 70, emoji: "🌳" },
  { id: "lantern", name: "Stone lantern", cost: 80, emoji: "🏮" },
  { id: "lamp", name: "Garden lamp", cost: 100, emoji: "💡" },
  { id: "bench", name: "Bench", cost: 120, emoji: "🪑" },
  { id: "birdbath", name: "Bird bath", cost: 150, emoji: "⛲" },
  { id: "pond", name: "Lily pond", cost: 200, emoji: "🪷" },
  { id: "arch", name: "Rose arch", cost: 250, emoji: "🌺" },
];
export const decorById = new Map(DECOR.map((d) => [d.id, d]));

export const COLS = 6;
export const MIN_ROWS = 4;
export const MAX_ROWS = 8;
/** Laurels for one more row of plots. */
export const expandCost = (rows: number) => 150 + (rows - MIN_ROWS) * 100;

export const STAGE_NAMES = ["Seed", "Sprout", "Young", "Leafy", "Budding", "In bloom"];
export function stageOf(g: number) {
  if (g >= 1) return 5;
  if (g >= 0.8) return 4;
  if (g >= 0.5) return 3;
  if (g >= 0.22) return 2;
  if (g >= 0.06) return 1;
  return 0;
}
