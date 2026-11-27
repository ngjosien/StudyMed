// Original cozy-style plants for the study garden: chunky, rounded shapes, big
// simple flowers, fluffy "puffball" tree crowns shaded darker underneath and
// lighter on top, all lit with soft cartoon shading. Each plant is drawn for a
// growth value g from 0 (just planted) to 1 (full bloom).
import * as THREE from "three";
import { buildDecor, ell, mat, rng, seedling, stalk } from "./models";
import { stageOf } from "./catalog";

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
const ease = (v: number) => 1 - Math.pow(1 - Math.max(0, Math.min(1, v)), 2);

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

/** A background tree for the island's edges (not a planted one). */
export function edgeTree(r: () => number, kind: "round" | "cedar" | "fruit", h: number) {
  if (kind === "cedar") return cedar(r, h / 1.9, 5);
  const g = new THREE.Group();
  const t = trunk(r, h * 0.45, h * 0.07);
  g.add(t);
  const top = t.userData.top as THREE.Vector3;
  g.add(puffball(r, top.x, top.y + h * 0.22, top.z, h * 0.33, ["#3f9a46", "#5cbf55", "#8fd86b"], 16));
  if (kind === "fruit")
    for (let i = 0; i < 7; i++) {
      const a = r() * Math.PI * 2;
      g.add(pos(blob(h * 0.035, h * 0.035, h * 0.035, "#ff9a3c", true), top.x + Math.cos(a) * h * 0.3, top.y + h * (0.1 + r() * 0.25), top.z + Math.sin(a) * h * 0.3));
    }
  return g;
}

/* ------------------------------------------------------------ Plants */
type Builder = (r: () => number, size: number, stage: number) => THREE.Group;

const clover: Builder = (r, size, stage) => {
  const g = new THREE.Group();
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + r();
    const d = 0.04 + r() * 0.2;
    const x = Math.cos(a) * d;
    const z = Math.sin(a) * d;
    const h = (0.06 + r() * 0.07) * size;
    g.add(pos(stalk(0.007, 0.006, h, STEM), x, 0, z));
    const leaves = i === 0 ? 4 : 3;
    for (let k = 0; k < leaves; k++) {
      const la = (k / leaves) * Math.PI * 2 + a;
      g.add(pos(blob(0.04 * size, 0.012, 0.034 * size, i === 0 ? "#45b04a" : k % 2 ? LEAF : LEAF_LIGHT), x + Math.cos(la) * 0.033 * size, h, z + Math.sin(la) * 0.033 * size, 0, -la, 0));
    }
  }
  if (stage >= 4)
    for (let i = 0; i < 4; i++) {
      const a = r() * Math.PI * 2;
      const x = Math.cos(a) * 0.14;
      const z = Math.sin(a) * 0.14;
      const h = 0.17 * size;
      g.add(pos(stalk(0.007, 0.006, h, STEM), x, 0, z));
      const s = stage === 5 ? 0.045 : 0.028;
      for (let k = 0; k < 6; k++) g.add(pos(blob(s * 0.5, s * 0.5, s * 0.5, stage === 5 ? (k % 2 ? "#ffffff" : "#ffe3ef") : "#d9eebd", true), x + Math.cos(k) * s * 0.45, h + Math.sin(k * 2) * s * 0.3, z + Math.sin(k) * s * 0.45));
    }
  return g;
};

const tulip: Builder = (r, size, stage) => {
  const g = new THREE.Group();
  const colors = ["#ff5d73", "#ffb3c7", "#ffd23f", "#ffffff", "#c77dff"];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + r();
    const x = Math.cos(a) * 0.13;
    const z = Math.sin(a) * 0.13;
    const h = (0.3 + r() * 0.1) * size;
    g.add(pos(stalk(0.016, 0.013, h, STEM), x, 0, z));
    for (const side of [-1, 1]) g.add(pos(blob(0.03 * size, 0.13 * size, 0.012, side > 0 ? LEAF : LEAF_DARK), x + side * 0.03, 0.09 * size, z, 0, a, side * 0.35));
    if (stage >= 4) {
      const c = colors[(i + Math.floor(r() * 5)) % 5];
      const head = new THREE.Group();
      head.position.set(x, h, z);
      const s = (stage === 5 ? 1 : 0.7) * size;
      head.add(pos(blob(0.065 * s, 0.085 * s, 0.065 * s, c), 0, 0.06 * s, 0));
      for (let p = 0; p < 3; p++) {
        const pa = (p / 3) * Math.PI * 2;
        const tip = new THREE.Mesh(CONE, mat(mix(c, "#ffffff", 0.1)));
        tip.scale.set(0.035 * s, 0.07 * s, 0.025 * s);
        tip.position.set(Math.cos(pa) * 0.035 * s, 0.14 * s, Math.sin(pa) * 0.035 * s);
        tip.rotation.set(Math.sin(pa) * (stage === 5 ? 0.35 : 0.1), 0, -Math.cos(pa) * (stage === 5 ? 0.35 : 0.1));
        tip.castShadow = true;
        head.add(tip);
      }
      g.add(head);
    }
  }
  return g;
};

const cosmos: Builder = (r, size, stage) => {
  const g = new THREE.Group();
  g.add(pos(blob(0.18, 0.05, 0.18, LEAF_DARK), 0, 0.02, 0));
  const colors = ["#ff8fc0", "#ffffff", "#e05fa8", "#ffc2dc"];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + r() * 0.6;
    const d = 0.05 + r() * 0.13;
    const x = Math.cos(a) * d;
    const z = Math.sin(a) * d;
    const h = (0.22 + r() * 0.12) * size;
    g.add(pos(stalk(0.008, 0.007, h, STEM), x, 0, z));
    if (stage >= 4) {
      const f = flower(colors[Math.floor(r() * 4)], "#ffcc33", 8, 0.11 * size, stage === 5);
      f.position.set(x, h, z);
      f.rotation.set(-0.3 + r() * 0.2, r() * 3, 0);
      g.add(f);
    }
  }
  return g;
};

const lavender: Builder = (r, size, stage) => {
  const g = new THREE.Group();
  g.add(pos(blob(0.17 * size, 0.08 * size, 0.17 * size, "#8fb48a"), 0, 0.05, 0));
  const spike = stage === 5 ? ["#7d55d1", "#9b6fe0", "#b897f0"] : stage === 4 ? ["#a99bc4", "#b8acd0", "#c9bfe0"] : ["#8db07f", "#9fc28e", "#b0cf9f"];
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + r();
    const lean = 0.1 + r() * 0.25;
    const h = (0.34 + r() * 0.12) * size;
    const s = new THREE.Group();
    s.position.set(Math.cos(a) * 0.05, 0.05, Math.sin(a) * 0.05);
    s.rotation.set(Math.cos(a) * lean, 0, Math.sin(a) * lean);
    s.add(stalk(0.007, 0.006, h, "#7ea36a"));
    if (stage >= 3)
      for (let k = 0; k < 5; k++) {
        const rr = 0.026 * (1 - k * 0.12) * size;
        s.add(pos(blob(rr, rr * 1.2, rr, spike[Math.min(2, k > 2 ? 2 : k === 0 ? 0 : 1)], true), 0, h - 0.015 - k * 0.04 * size, 0));
      }
    g.add(s);
  }
  return g;
};

const cactus: Builder = (r, size, stage) => {
  const g = new THREE.Group();
  const greens = ["#3f9e62", "#4caf6a", "#5fc27c"];
  const R = 0.17 * size;
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2;
    g.add(pos(blob(R * 0.45, R * 1.05, R * 0.45, greens[k % 3]), Math.cos(a) * R * 0.6, R, Math.sin(a) * R * 0.6, 0, -a, 0));
  }
  g.add(pos(blob(R * 0.7, R * 1.0, R * 0.7, greens[1]), 0, R * 1.05, 0));
  if (stage >= 3)
    for (const side of [-1, 1]) {
      g.add(pos(blob(R * 0.42, R * 0.55, R * 0.42, greens[2]), side * R * 0.95, R * (side > 0 ? 1.1 : 1.35), 0));
    }
  for (let i = 0; i < 14; i++) {
    const a = r() * Math.PI * 2;
    g.add(pos(blob(0.008, 0.008, 0.008, "#fff6dd", true), Math.cos(a) * R * 1.02, R * (0.3 + r() * 1.4), Math.sin(a) * R * 1.02));
  }
  if (stage >= 4) {
    const f = flower("#ff6fa5", "#ffd84d", 6, 0.09 * size, stage === 5);
    f.position.set(0, R * 2.05, 0);
    g.add(f);
  }
  return g;
};

const sunflower: Builder = (r, size, stage) => {
  const g = new THREE.Group();
  for (let i = 0; i < 2; i++) {
    const x = i ? 0.12 : -0.08;
    const z = i ? -0.06 : 0.07;
    const h = (i ? 0.78 : 1) * size;
    g.add(pos(stalk(0.03, 0.022, h, STEM), x, 0, z));
    for (let k = 0; k < 3; k++) {
      const a = k * 2.2 + r();
      g.add(pos(blob(0.1 * size, 0.018, 0.075 * size, k % 2 ? LEAF : LEAF_DARK), x + Math.cos(a) * 0.08 * size, h * (0.3 + k * 0.17), z + Math.sin(a) * 0.08 * size, 0.3, -a, 0.2));
    }
    if (stage >= 4) {
      const head = new THREE.Group();
      head.position.set(x, h, z + 0.02);
      head.rotation.x = 1.0;
      const s = (stage === 5 ? 1 : 0.55) * size;
      if (stage === 5) {
        for (let p = 0; p < 16; p++) {
          const a = (p / 16) * Math.PI * 2;
          const pet = blob(0.07 * s, 0.014, 0.032 * s, p % 2 ? "#ffcc2f" : "#ffbd1a");
          pet.position.set(Math.cos(a) * 0.15 * s, 0, Math.sin(a) * 0.15 * s);
          pet.rotation.y = -a;
          head.add(pet);
        }
        head.add(pos(blob(0.11 * s, 0.035 * s, 0.11 * s, "#6b4226"), 0, 0.012, 0));
      } else head.add(blob(0.07 * s, 0.05 * s, 0.07 * s, "#8cbf54"));
      g.add(head);
    }
  }
  return g;
};

const rose: Builder = (r, size, stage) => {
  const g = bushBall(r, 0.26 * size);
  if (stage >= 4) {
    const red = r() < 0.6 ? "#e63950" : "#ff8fb1";
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + r();
      const y = 0.26 * size * (0.55 + r() * 0.95);
      const d = 0.26 * size * 0.98;
      const rz = new THREE.Group();
      rz.position.set(Math.cos(a) * d, y, Math.sin(a) * d);
      rz.lookAt(rz.position.x * 3, y + 0.15, rz.position.z * 3);
      const s = stage === 5 ? 1 : 0.55;
      rz.add(blob(0.034 * s, 0.034 * s, 0.03 * s, red));
      if (stage === 5)
        for (let p = 0; p < 5; p++) rz.add(pos(blob(0.03, 0.022, 0.012, mix(red, "#5a0f1f", 0.15)), Math.cos(p * 1.26) * 0.03, Math.sin(p * 1.26) * 0.03, -0.006, 0, 0, p * 1.26));
      g.add(rz);
    }
  }
  return g;
};

const hydrangea: Builder = (r, size, stage) => {
  const g = bushBall(r, 0.28 * size);
  if (stage >= 4) {
    const hues = ["#7aa6ff", "#a98bff", "#c3a6f4", "#8fc1ff", "#f0a6d0"];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + r();
      const c = new THREE.Group();
      const d = 0.28 * size * 0.85;
      c.position.set(Math.cos(a) * d, 0.28 * size * (0.9 + r() * 0.7), Math.sin(a) * d);
      const col = stage === 5 ? hues[(i + Math.floor(r() * 5)) % 5] : "#cfe5b0";
      for (let k = 0; k < (stage === 5 ? 14 : 7); k++) c.add(pos(blob(0.03, 0.03, 0.03, k % 3 ? col : mix(col, "#ffffff", 0.3), true), (r() - 0.5) * 0.1, (r() - 0.3) * 0.08, (r() - 0.5) * 0.1));
      g.add(c);
    }
  }
  return g;
};

const pumpkin: Builder = (r, size, stage) => {
  const g = new THREE.Group();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + r();
    g.add(pos(blob(0.13 * size, 0.02, 0.11 * size, i % 2 ? LEAF : LEAF_DARK), Math.cos(a) * 0.22 * size, 0.04, Math.sin(a) * 0.22 * size, 0, -a, 0));
  }
  const vine = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.012, 8, 24, Math.PI * 1.4), mat(STEM));
  vine.rotation.x = Math.PI / 2;
  vine.position.y = 0.04;
  g.add(vine);
  if (stage === 4) g.add(pos(flower("#ffcf3f", "#ff9f1a", 5, 0.08, true), 0.08, 0.1, 0));
  if (stage >= 3) {
    const grow = stage === 5 ? 1 : stage === 4 ? 0.45 : 0.28;
    const color = stage === 5 ? "#ff8c1a" : "#9ccc5a";
    const body = new THREE.Group();
    body.position.set(-0.03, 0.14 * grow + 0.03, 0.04);
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      body.add(pos(blob(0.1 * grow, 0.15 * grow, 0.075 * grow, k % 2 ? color : mix(color, "#c45f00", 0.18)), Math.cos(a) * 0.105 * grow, 0, Math.sin(a) * 0.105 * grow, 0, -a, 0));
    }
    body.add(pos(stalk(0.02 * grow + 0.008, 0.015, 0.07, "#6d8b3a"), 0, 0.13 * grow, 0, 0, 0, 0.25));
    g.add(body);
  }
  return g;
};

const bamboo: Builder = (r, size, stage) => {
  const g = new THREE.Group();
  const canes = stage >= 4 ? 6 : 4;
  for (let i = 0; i < canes; i++) {
    const a = (i / canes) * Math.PI * 2 + r();
    const d = 0.06 + r() * 0.1;
    const h = (0.9 + r() * 0.6) * size;
    const c = new THREE.Group();
    c.position.set(Math.cos(a) * d, 0, Math.sin(a) * d);
    c.rotation.set((r() - 0.5) * 0.12, 0, (r() - 0.5) * 0.12);
    c.add(stalk(0.034, 0.03, h, "#9ccc65"));
    for (let y = 0.18; y < h; y += 0.2) c.add(pos(blob(0.04, 0.012, 0.04, "#7cb342", true), 0, y, 0));
    for (let k = 0; k < 5; k++) {
      const l = blob(0.016, 0.1, 0.006, k % 2 ? "#7cc152" : "#5ea83e");
      l.position.set(0, h - k * 0.1, 0);
      l.rotation.set(0, r() * 6, 1.1 + r() * 0.3);
      l.translateY(0.08);
      c.add(l);
    }
    g.add(c);
  }
  return g;
};

function cedar(r: () => number, size: number, tiers = 4) {
  const g = new THREE.Group();
  g.add(stalk(0.06 * size, 0.04 * size, 0.3 * size, BARK));
  const shades = ["#2c7a4b", "#35905a", "#46a86a", "#5cbf7c", "#6fcf88"];
  for (let i = 0; i < tiers; i++) {
    const rad = (0.42 - i * (0.3 / tiers)) * size;
    const y = (0.24 + i * (0.95 / tiers)) * size;
    const c = new THREE.Mesh(CONE, mat(shades[Math.min(shades.length - 1, i)]));
    c.scale.set(rad, 0.42 * size, rad);
    c.position.y = y + 0.21 * size;
    c.rotation.y = r();
    c.castShadow = true;
    c.receiveShadow = true;
    g.add(c);
    // A soft rounded skirt so the tiers look plump, not sharp.
    g.add(pos(blob(rad * 0.96, 0.07 * size, rad * 0.96, shades[Math.max(0, i - 1)]), 0, y + 0.02 * size, 0));
  }
  g.add(pos(blob(0.05 * size, 0.07 * size, 0.05 * size, shades[4]), 0, (0.24 + tiers * (0.95 / tiers)) * size + 0.16 * size, 0));
  return g;
}

const pine: Builder = (r, size, stage) => {
  const g = cedar(r, size, 4);
  if (stage >= 4)
    for (let i = 0; i < (stage === 5 ? 7 : 3); i++) {
      const a = r() * Math.PI * 2;
      const tier = Math.floor(r() * 3);
      const rad = (0.38 - tier * 0.075) * size;
      g.add(pos(blob(0.026, 0.04, 0.026, "#8a5a32", true), Math.cos(a) * rad * 0.85, (0.3 + tier * 0.24) * size, Math.sin(a) * rad * 0.85));
    }
  return g;
};

function fruitTree(r: () => number, size: number, shades: [string, string, string], extras?: { color: string; n: number; s: number }) {
  const g = new THREE.Group();
  const t = trunk(r, 0.55 * size, 0.075 * size);
  g.add(t);
  const top = t.userData.top as THREE.Vector3;
  const R = 0.36 * size;
  g.add(puffball(r, top.x, top.y + R * 0.7, top.z, R, shades, 18));
  if (extras)
    for (let i = 0; i < extras.n; i++) {
      const y = 1 - (i / extras.n) * 1.3;
      const rad = Math.sqrt(Math.max(0, 1 - y * y));
      const th = i * 2.399 + r();
      g.add(pos(blob(extras.s, extras.s * 1.05, extras.s, extras.color, true), top.x + Math.cos(th) * rad * R * 1.02, top.y + R * 0.7 + y * R * 0.7, top.z + Math.sin(th) * rad * R * 1.02));
    }
  return g;
}

const orange: Builder = (r, size, stage) =>
  fruitTree(r, size, ["#3f9a46", "#55b857", "#86d46a"], stage === 5 ? { color: "#ff9a2e", n: 12, s: 0.045 } : stage === 4 ? { color: "#ffffff", n: 12, s: 0.022 } : undefined);

const maple: Builder = (r, size, stage) =>
  fruitTree(r, size, stage === 5 ? ["#c5402b", "#e8642f", "#f6a744"] : stage === 4 ? ["#8fb54a", "#c9b04a", "#efc062"] : ["#3f9a46", "#55b857", "#86d46a"]);

const cherry: Builder = (r, size, stage) => {
  const g = fruitTree(r, size, stage === 5 ? ["#ef8fb1", "#f7b8cf", "#fde0ea"] : stage === 4 ? ["#8cc66a", "#c9dc9a", "#f5cfdc"] : ["#3f9a46", "#55b857", "#86d46a"]);
  g.userData.petals = stage === 5;
  return g;
};

const BUILDERS: Record<string, Builder> = {
  clover,
  tulip,
  daisy: cosmos,
  lavender,
  cactus,
  sunflower,
  rose,
  hydrangea,
  pumpkin,
  bamboo,
  pine,
  lemon: orange,
  maple,
  cherry,
};
const TREES = new Set(["lemon", "pine", "cherry", "maple", "bamboo"]);

/** A plant at growth g (0..1). */
export function buildPlant(species: string, g: number, seed: number) {
  const r = rng(seed);
  const stage = stageOf(g);
  const root = new THREE.Group();
  root.userData.stage = stage;
  if (stage <= 1) {
    root.add(seedling(g, r));
    return root;
  }
  const tree = TREES.has(species);
  const size = (tree ? 0.48 : 0.58) + ease((g - 0.22) / 0.78) * (tree ? 0.72 : 0.42);
  root.add(ell(0.2, 0.045, 0.2, "#7a4e33"));
  const p = (BUILDERS[species] ?? tulip)(r, size, stage);
  root.add(p);
  root.userData.petals = !!p.userData.petals;
  root.userData.tree = tree;
  return root;
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
  return buildDecor(kind, seed);
}
