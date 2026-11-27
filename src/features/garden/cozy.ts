// The island's cozy-style scenery: fluffy "puffball" trees shaded darker underneath
// and lighter on top, round bushes, grass tufts, wild flowers and smooth rocks, all
// lit with soft cartoon shading. The flowers you grow are in flowers.ts.
import * as THREE from "three";
import { buildDecor, mat, rng, stalk } from "./models";

const BALL = new THREE.SphereGeometry(1, 32, 22);
const SMALLBALL = new THREE.SphereGeometry(1, 16, 12);
const ROCK = new THREE.IcosahedronGeometry(1, 2);
const TUBE = new THREE.CylinderGeometry(1, 1, 1, 18, 1);
const CONE = new THREE.ConeGeometry(1, 1, 24, 1);
for (const g of [BALL, SMALLBALL, ROCK, TUBE, CONE]) g.userData.shared = true;

function blob(rx: number, ry: number, rz: number, color: string, small = false) {
  const m = new THREE.Mesh(small ? SMALLBALL : BALL, mat(color));
  m.scale.set(rx, ry, rz);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}
function tube(r: number, h: number, color: string) {
  const m = new THREE.Mesh(TUBE, mat(color));
  m.scale.set(r, h, r);
  m.castShadow = true;
  return m;
}
function pos<T extends THREE.Object3D>(o: T, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) {
  o.position.set(x, y, z);
  o.rotation.set(rx, ry, rz);
  return o;
}
const mix = (a: string, b: string, t: number) => new THREE.Color(a).lerp(new THREE.Color(b), Math.max(0, Math.min(1, t))).getStyle();

const LEAF = "#5fc05a";
const LEAF_DARK = "#3d9a48";
const LEAF_LIGHT = "#8ad86a";
const STEM = "#4f9e3e";
const BARK = "#9a6a45";
const BARK_DARK = "#7b5236";

/* ------------------------------------------------------------ Building blocks */

/** A fluffy crown: a core plus overlapping balls on its surface, darker below and lighter on top. */
export function puffball(r: () => number, cx: number, cy: number, cz: number, R: number, shades: [string, string, string], n = 16) {
  const g = new THREE.Group();
  g.add(pos(blob(R * 0.92, R * 0.84, R * 0.92, shades[1]), cx, cy, cz));
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = 1 - (i / (n - 1)) * 1.6; // mostly upper and middle
    const rad = Math.sqrt(Math.max(0, 1 - y * y));
    const th = golden * i + r() * 0.4;
    const px = Math.cos(th) * rad;
    const pz = Math.sin(th) * rad;
    const s = R * (0.42 + r() * 0.14);
    const t = (y + 0.6) / 1.6; // 0 bottom .. 1 top
    const c = t < 0.5 ? mix(shades[0], shades[1], t * 2) : mix(shades[1], shades[2], (t - 0.5) * 2);
    g.add(pos(blob(s, s * 0.92, s, c), cx + px * R * 0.72, cy + y * R * 0.62, cz + pz * R * 0.72));
  }
  // A couple of sunlit highlights on top.
  for (let i = 0; i < 3; i++) {
    const a = r() * Math.PI * 2;
    const s = R * (0.24 + r() * 0.08);
    g.add(pos(blob(s, s * 0.8, s, mix(shades[2], "#ffffff", 0.18)), cx + Math.cos(a) * R * 0.35, cy + R * 0.72, cz + Math.sin(a) * R * 0.35));
  }
  return g;
}

/** A tree trunk with a gentle lean, a flared foot and a couple of short branches. */
function trunk(r: () => number, h: number, w: number) {
  const g = new THREE.Group();
  const lean = (r() - 0.5) * 0.12;
  const t = stalk(w, w * 0.62, h, BARK);
  t.rotation.z = lean;
  g.add(t);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + r();
    g.add(pos(blob(w * 0.75, w * 0.42, w * 0.5, BARK_DARK), Math.cos(a) * w * 0.85, w * 0.15, Math.sin(a) * w * 0.85, 0, -a, 0.3));
  }
  for (let i = 0; i < 2; i++) {
    const a = r() * Math.PI * 2;
    const b = stalk(w * 0.45, w * 0.28, h * 0.32, BARK);
    b.position.set(Math.sin(lean) * -h * 0.6, h * (0.58 + i * 0.14), 0);
    b.rotation.set(Math.cos(a) * 0.9, 0, Math.sin(a) * 0.9);
    g.add(b);
  }
  g.userData.top = new THREE.Vector3(-Math.sin(lean) * h, h, 0);
  return g;
}

/** A simple chunky flower: round petals around a domed centre. */
function flower(petal: string, centre: string, petals: number, size: number, open: boolean) {
  const g = new THREE.Group();
  if (!open) {
    g.add(blob(size * 0.35, size * 0.5, size * 0.35, mix(petal, LEAF_LIGHT, 0.45)));
    return g;
  }
  for (let p = 0; p < petals; p++) {
    const a = (p / petals) * Math.PI * 2;
    const pet = blob(size * 0.42, size * 0.1, size * 0.28, p % 2 ? petal : mix(petal, "#ffffff", 0.12));
    pet.position.set(Math.cos(a) * size * 0.42, 0, Math.sin(a) * size * 0.42);
    pet.rotation.y = -a;
    pet.rotation.z = 0.18;
    g.add(pet);
  }
  g.add(pos(blob(size * 0.26, size * 0.16, size * 0.26, centre), 0, size * 0.06, 0));
  return g;
}

/** A clump of grass: a few soft rounded blades. */
export function tuft(r: () => number, h = 0.16) {
  const g = new THREE.Group();
  const shades = ["#6cc04f", "#7fcf5c", "#5fb247"];
  for (let i = 0; i < 5; i++) {
    const b = new THREE.Mesh(CONE, mat(shades[i % 3]));
    const s = h * (0.7 + r() * 0.5);
    b.scale.set(0.028, s, 0.018);
    b.position.set((r() - 0.5) * 0.08, s / 2, (r() - 0.5) * 0.08);
    b.rotation.set((r() - 0.5) * 0.5, r() * 3, (r() - 0.5) * 0.5);
    b.castShadow = true;
    g.add(b);
  }
  return g;
}

/** A smooth, rounded rock. */
export function rock(r: () => number, s: number, tone = "#b9b4ab") {
  const m = new THREE.Mesh(ROCK, mat(tone));
  m.scale.set(s * (1 + r() * 0.4), s * (0.6 + r() * 0.25), s * (0.9 + r() * 0.3));
  m.rotation.set(r() * 0.4, r() * 6, r() * 0.4);
  m.position.y = s * 0.3;
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

const PALETTE = ["#ff7b8a", "#ffb3c7", "#ffd166", "#ffffff", "#c9a7f7", "#ff9f5a", "#8fc9ff"];

/** A little cluster of wild flowers for the island's edges. */
export function wildflowers(r: () => number) {
  const g = new THREE.Group();
  const c = PALETTE[Math.floor(r() * PALETTE.length)];
  for (let i = 0; i < 3; i++) {
    const x = (r() - 0.5) * 0.16;
    const z = (r() - 0.5) * 0.16;
    const h = 0.1 + r() * 0.08;
    g.add(pos(stalk(0.008, 0.007, h, STEM), x, 0, z));
    const f = flower(c, "#ffcf4a", 5, 0.07, true);
    f.position.set(x, h, z);
    f.rotation.x = -0.3;
    g.add(f);
  }
  g.add(pos(blob(0.07, 0.03, 0.07, LEAF_DARK), 0, 0.02, 0));
  return g;
}

/** A round border bush. */
export function bushBall(r: () => number, s: number, flowers = false) {
  const g = puffball(r, 0, s * 0.8, 0, s, [LEAF_DARK, LEAF, LEAF_LIGHT], 10);
  if (flowers) {
    const c = PALETTE[Math.floor(r() * PALETTE.length)];
    for (let i = 0; i < 7; i++) {
      const a = r() * Math.PI * 2;
      const y = s * (0.6 + r() * 0.7);
      g.add(pos(blob(s * 0.13, s * 0.13, s * 0.13, c, true), Math.cos(a) * s * 0.95, y, Math.sin(a) * s * 0.95));
    }
  }
  return g;
}

export type TreeKind = "round" | "fruit" | "blossom" | "autumn";
const CROWNS: Record<TreeKind, [string, string, string]> = {
  round: ["#3f9a46", "#5cbf55", "#8fd86b"],
  fruit: ["#3f9a46", "#55b857", "#86d46a"],
  blossom: ["#ef8fb1", "#f7b8cf", "#fde0ea"],
  autumn: ["#d2552f", "#ee7f35", "#f8b850"],
};

/** A round, puffy tree: a leaning trunk under a fluffy crown (with fruit on the fruit tree). */
export function edgeTree(r: () => number, kind: TreeKind, h: number) {
  const g = new THREE.Group();
  const t = trunk(r, h * 0.42, h * 0.065);
  g.add(t);
  const top = t.userData.top as THREE.Vector3;
  const R = h * 0.3;
  g.add(puffball(r, top.x, top.y + R * 0.72, top.z, R, CROWNS[kind], 18));
  if (kind === "fruit")
    for (let i = 0; i < 12; i++) {
      const y = 1 - (i / 12) * 1.3;
      const rad = Math.sqrt(Math.max(0, 1 - y * y));
      const th = i * 2.399 + r();
      const s = h * 0.034;
      g.add(pos(blob(s, s * 1.05, s, "#ff9a2e", true), top.x + Math.cos(th) * rad * R * 1.02, top.y + R * 0.72 + y * R * 0.7, top.z + Math.sin(th) * rad * R * 1.02));
    }
  if (kind === "blossom") g.userData.petals = true;
  return g;
}

/** Decorations: natural ones drawn here in the cozy style, made ones from models.ts. */
export function buildGardenDecor(kind: string, seed: number) {
  const r = rng(seed);
  const g = new THREE.Group();
  if (kind === "rocks") {
    for (let i = 0; i < 3; i++) g.add(pos(rock(r, 0.1 + r() * 0.08), (r() - 0.5) * 0.4, 0, (r() - 0.5) * 0.4));
    for (let i = 0; i < 3; i++) g.add(pos(tuft(r, 0.14), (r() - 0.5) * 0.6, 0, (r() - 0.5) * 0.6));
    for (let i = 0; i < 2; i++) g.add(pos(blob(0.09, 0.03, 0.09, "#7fbf5a"), (r() - 0.5) * 0.3, 0.12, (r() - 0.5) * 0.3));
    return g;
  }
  if (kind === "path") {
    for (let i = 0; i < 4; i++) {
      const s = 0.13 + r() * 0.04;
      const st = new THREE.Mesh(TUBE, mat(i % 2 ? "#d6cfc4" : "#cbc3b6"));
      st.scale.set(s, 0.04, s * (0.8 + r() * 0.3));
      st.position.set(-0.24 + (i % 2) * 0.22 + r() * 0.05, 0.02, -0.3 + i * 0.2);
      st.rotation.y = r();
      st.receiveShadow = true;
      g.add(st);
    }
    return g;
  }
  if (kind === "mushrooms") {
    for (let i = 0; i < 4; i++) {
      const s = 0.6 + r() * 0.6;
      const x = (r() - 0.5) * 0.42;
      const z = (r() - 0.5) * 0.42;
      g.add(pos(tube(0.028 * s, 0.12 * s, "#fff4e0"), x, 0.06 * s, z));
      g.add(pos(blob(0.085 * s, 0.055 * s, 0.085 * s, i % 2 ? "#e6453a" : "#f08a3c"), x, 0.125 * s, z));
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2;
        g.add(pos(blob(0.013 * s, 0.006, 0.013 * s, "#ffffff", true), x + Math.cos(a) * 0.05 * s, 0.163 * s, z + Math.sin(a) * 0.05 * s));
      }
    }
    return g;
  }
  if (kind.startsWith("tree_")) {
    const t = edgeTree(r, kind.slice(5) as TreeKind, 1.35);
    g.add(t);
    g.userData.petals = !!t.userData.petals;
    return g;
  }
  return buildDecor(kind, seed);
}
