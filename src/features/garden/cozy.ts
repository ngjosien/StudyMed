// The island's cozy-style scenery: fluffy "puffball" trees shaded darker underneath
// and lighter on top, round bushes, grass tufts, wild flowers and smooth rocks, all
// lit with soft cartoon shading. The flowers you grow are in flowers.ts.
import * as THREE from "three";
import { buildDecor, mat, rng, stalk, TOON_RAMP } from "./models";

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
export function puffball(r: () => number, cx: number, cy: number, cz: number, R: number, shades: [string, string, string], n = 16, low = false) {
  const g = new THREE.Group();
  g.add(pos(blob(R * 0.92, R * 0.84, R * 0.92, shades[1], low), cx, cy, cz));
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
    g.add(pos(blob(s, s * 0.92, s, c, low), cx + px * R * 0.72, cy + y * R * 0.62, cz + pz * R * 0.72));
  }
  // A couple of sunlit highlights on top.
  for (let i = 0; i < 3; i++) {
    const a = r() * Math.PI * 2;
    const s = R * (0.24 + r() * 0.08);
    g.add(pos(blob(s, s * 0.8, s, mix(shades[2], "#ffffff", 0.18), low), cx + Math.cos(a) * R * 0.35, cy + R * 0.72, cz + Math.sin(a) * R * 0.35));
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

const TINY_BALL = new THREE.SphereGeometry(1, 8, 6);
const THIN = new THREE.CylinderGeometry(1, 1, 1, 5, 1);
const LEAF_DISC = new THREE.CircleGeometry(1, 7).rotateX(-Math.PI / 2);
for (const g of [TINY_BALL, THIN, LEAF_DISC]) g.userData.shared = true;

/** A few small, simple wild flowers, cheap enough to scatter over the whole land. */
export function meadowFlowers(r: () => number) {
  const g = new THREE.Group();
  const c = PALETTE[Math.floor(r() * PALETTE.length)];
  for (let i = 0; i < 3; i++) {
    const x = (r() - 0.5) * 0.18;
    const z = (r() - 0.5) * 0.18;
    const h = 0.08 + r() * 0.08;
    const st = new THREE.Mesh(THIN, mat(STEM));
    st.scale.set(0.007, h, 0.007);
    st.position.set(x, h / 2, z);
    g.add(st);
    const f = new THREE.Mesh(TINY_BALL, mat(c));
    f.scale.set(0.034, 0.02, 0.034);
    f.position.set(x, h, z);
    g.add(f);
    const mid = new THREE.Mesh(TINY_BALL, mat("#ffcf4a"));
    mid.scale.setScalar(0.013);
    mid.position.set(x, h + 0.014, z);
    g.add(mid);
  }
  return g;
}

/** A fallen leaf lying flat on the grass. */
export function fallenLeaf(r: () => number, color: string) {
  const m = new THREE.Mesh(LEAF_DISC, mat(color));
  m.scale.set(0.05 + r() * 0.03, 1, 0.03 + r() * 0.015);
  m.rotation.y = r() * Math.PI * 2;
  m.receiveShadow = true;
  return m;
}

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

export type TreeKind = "round" | "fruit" | "blossom" | "autumn" | "golden";
const CROWNS: Record<TreeKind, [string, string, string]> = {
  round: ["#3f9a46", "#5cbf55", "#8fd86b"],
  fruit: ["#3f9a46", "#55b857", "#86d46a"],
  blossom: ["#ef8fb1", "#f7b8cf", "#fde0ea"],
  autumn: ["#d2552f", "#ee7f35", "#f8b850"],
  golden: ["#c9892c", "#e8b13e", "#f8d46e"],
};

/** A round, puffy tree: a leaning trunk under a fluffy crown (with fruit on the fruit tree). */
/** `low`: fewer, simpler puffs, for trees far away. */
export function edgeTree(r: () => number, kind: TreeKind, h: number, low = false) {
  const g = new THREE.Group();
  const t = trunk(r, h * 0.42, h * 0.065);
  g.add(t);
  const top = t.userData.top as THREE.Vector3;
  const R = h * 0.3;
  g.add(puffball(r, top.x, top.y + R * 0.72, top.z, R, CROWNS[kind], low ? 9 : 18, low));
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

/* ------------------------------------------------------------ Distant forest */
const FAR_BALL = new THREE.SphereGeometry(1, 10, 7);
const FAR_BALL_LO = new THREE.SphereGeometry(1, 7, 5);
const FAR_TRUNK = new THREE.CylinderGeometry(0.6, 1, 1, 6, 1, true);
const WHITE = new THREE.Color("#ffffff");

export interface ForestSpot {
  x: number;
  y: number;
  z: number;
  h: number;
  kind: TreeKind;
  /** Fewer, coarser puffs (far away). */
  lo?: boolean;
  /** A bush: a low crown and no trunk. */
  bush?: boolean;
}

interface Piece {
  geo: THREE.BufferGeometry;
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
  c: THREE.Color;
}

/** Copies many scaled pieces into one geometry, each coloured by its vertices. */
function mergePieces(list: Piece[]) {
  let nv = 0;
  let ni = 0;
  for (const p of list) {
    nv += p.geo.attributes.position.count;
    ni += p.geo.index!.count;
  }
  const pos = new Float32Array(nv * 3);
  const nor = new Float32Array(nv * 3);
  const col = new Float32Array(nv * 3);
  const idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
  let ov = 0;
  let oi = 0;
  for (const p of list) {
    const P = p.geo.attributes.position.array;
    const N = p.geo.attributes.normal.array;
    const I = p.geo.index!.array;
    const cnt = P.length / 3;
    for (let i = 0; i < cnt; i++) {
      const a = (ov + i) * 3;
      const b = i * 3;
      pos[a] = P[b] * p.sx + p.x;
      pos[a + 1] = P[b + 1] * p.sy + p.y;
      pos[a + 2] = P[b + 2] * p.sz + p.z;
      const nx = N[b] / p.sx;
      const ny = N[b + 1] / p.sy;
      const nz = N[b + 2] / p.sz;
      const l = Math.hypot(nx, ny, nz) || 1;
      nor[a] = nx / l;
      nor[a + 1] = ny / l;
      nor[a + 2] = nz / l;
      col[a] = p.c.r;
      col[a + 1] = p.c.g;
      col[a + 2] = p.c.b;
    }
    for (let i = 0; i < I.length; i++) idx[oi + i] = I[i] + ov;
    ov += cnt;
    oi += I.length;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeBoundingSphere();
  return g;
}

/**
 * Hundreds of simple puffy trees as just two meshes (crowns and trunks), for the forest
 * that runs to the horizon. Same shapes and colours as edgeTree, with fewer puffs.
 */
export function forestMesh(spots: ForestSpot[], r: () => number) {
  const crowns: Piece[] = [];
  const trunks: Piece[] = [];
  const bark = new THREE.Color(BARK);
  for (const s of spots) {
    const sh = CROWNS[s.kind].map((c) => new THREE.Color(c));
    const vary = 0.9 + r() * 0.18;
    const R = s.bush ? s.h * 0.45 : s.h * 0.3;
    const ball = s.lo ? FAR_BALL_LO : FAR_BALL;
    if (!s.bush) trunks.push({ geo: FAR_TRUNK, x: s.x, y: s.y + s.h * 0.21, z: s.z, sx: s.h * 0.065, sy: s.h * 0.42, sz: s.h * 0.065, c: bark });
    const cy = s.y + (s.bush ? R * 0.55 : s.h * 0.42 + R * 0.72);
    crowns.push({ geo: ball, x: s.x, y: cy, z: s.z, sx: R * 0.95, sy: R * 0.85, sz: R * 0.95, c: sh[1].clone().multiplyScalar(vary) });
    const n = s.lo ? 5 : 8;
    for (let i = 0; i < n; i++) {
      const yy = 1 - (i / (n - 1)) * 1.5;
      const rad = Math.sqrt(Math.max(0, 1 - yy * yy));
      const th = i * 2.399 + r() * 0.6;
      const k = R * (0.45 + r() * 0.14);
      const t = (yy + 0.5) / 1.5;
      const c = t < 0.5 ? sh[0].clone().lerp(sh[1], Math.max(0, t * 2)) : sh[1].clone().lerp(sh[2], Math.min(1, (t - 0.5) * 2));
      crowns.push({ geo: ball, x: s.x + Math.cos(th) * rad * R * 0.72, y: cy + yy * R * 0.62, z: s.z + Math.sin(th) * rad * R * 0.72, sx: k, sy: k * 0.92, sz: k, c: c.multiplyScalar(vary) });
    }
    const k = R * 0.3;
    crowns.push({ geo: ball, x: s.x + (r() - 0.5) * R * 0.5, y: cy + R * 0.7, z: s.z + (r() - 0.5) * R * 0.5, sx: k, sy: k * 0.8, sz: k, c: sh[2].clone().lerp(WHITE, 0.15) });
  }
  const g = new THREE.Group();
  const material = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: TOON_RAMP });
  for (const list of [crowns, trunks]) {
    if (!list.length) continue;
    const m = new THREE.Mesh(mergePieces(list), material);
    m.castShadow = false;
    m.receiveShadow = false;
    g.add(m);
  }
  return g;
}
