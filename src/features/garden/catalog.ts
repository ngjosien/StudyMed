// What can grow in the study garden, and what can be placed in it.
// Plants are free to plant and grow only with study time; rarer ones unlock as
// more plants reach full bloom. Decorations are bought with laurels.
// (Plant ids are kept from the first garden so planted rows still match.)

export interface Species {
  id: string;
  name: string;
  minutes: number; // study time to full bloom
  unlock: number; // fully grown plants needed first
  blurb: string;
}

export const SPECIES: Species[] = [
  { id: "clover", name: "Clover patch", minutes: 30, unlock: 0, blurb: "Quick to grow; a single focus session is enough." },
  { id: "tulip", name: "Tulips", minutes: 60, unlock: 0, blurb: "Four plump tulips in mixed colours." },
  { id: "daisy", name: "Cosmos", minutes: 90, unlock: 0, blurb: "Pink and white cosmos on slender stems." },
  { id: "lavender", name: "Lavender", minutes: 120, unlock: 1, blurb: "Calm purple spikes over a silver-green mound." },
  { id: "cactus", name: "Barrel cactus", minutes: 150, unlock: 2, blurb: "Round, patient, and it flowers in the end." },
  { id: "sunflower", name: "Sunflowers", minutes: 180, unlock: 2, blurb: "Two tall sunflowers that turn to face you." },
  { id: "rose", name: "Rose bush", minutes: 240, unlock: 3, blurb: "A round bush that covers itself in roses." },
  { id: "hydrangea", name: "Hydrangea", minutes: 300, unlock: 4, blurb: "Big pom-poms of blue, violet and pink." },
  { id: "pumpkin", name: "Pumpkin patch", minutes: 360, unlock: 5, blurb: "Starts as a flower, ends as a prize pumpkin." },
  { id: "bamboo", name: "Bamboo", minutes: 420, unlock: 6, blurb: "A stand of tall, segmented canes." },
  { id: "pine", name: "Cedar", minutes: 480, unlock: 7, blurb: "A plump evergreen with pine cones." },
  { id: "lemon", name: "Orange tree", minutes: 600, unlock: 8, blurb: "Blossoms first, then a crown of oranges." },
  { id: "maple", name: "Maple", minutes: 720, unlock: 9, blurb: "Red and amber leaves all year round." },
  { id: "cherry", name: "Cherry blossom", minutes: 900, unlock: 10, blurb: "The showpiece. Petals drift down once it blooms." },
];
export const speciesById = new Map(SPECIES.map((s) => [s.id, s]));

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
  { id: "lamp", name: "Garden lamp", cost: 100 },
  { id: "bench", name: "Bench", cost: 120 },
  { id: "birdbath", name: "Bird bath", cost: 150 },
  { id: "pond", name: "Lily pond", cost: 200 },
  { id: "arch", name: "Rose arch", cost: 250 },
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
