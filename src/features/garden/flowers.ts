// The garden's flowers in 3D, in the island's cozy style: chunky rounded petals,
// soft two-tone shading and little clumps of three blooms over a leafy rosette.
// Each flower is drawn for a growth value g (0 = just planted, 1 = in bloom) and
// one of its five colours. The parts are merged into a few meshes per flower so a
// full month of beds stays quick to draw.
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { mat, rng, seedling } from "./models";
import { speciesById, stageOf, type Hue } from "./catalog";

const HI = new THREE.SphereGeometry(1, 20, 14);
const MID = new THREE.SphereGeometry(1, 14, 10);
const LO = new THREE.SphereGeometry(1, 8, 6);
const CYL = new THREE.CylinderGeometry(1, 1, 1, 8, 1).translate(0, 0.5, 0);
const BELL = new THREE.LatheGeometry(
  [
    [0.001, 0],
    [0.45, -0.04],
    [0.72, -0.28],
    [0.82, -0.66],
    [0.98, -0.92],
    [1.12, -1.0],
  ].map(([x, y]) => new THREE.Vector2(x, y)),
  14,
);

type Geo = "hi" | "mid" | "lo";
const GEO = { hi: HI, mid: MID, lo: LO };

const LEAF = "#5dbb57";
const LEAF_DARK = "#3f9a49";
const LEAF_LIGHT = "#86d468";
const STEM = "#56a644";

const mix = (a: string, b: string, t: number) => "#" + new THREE.Color(a).lerp(new THREE.Color(b), Math.max(0, Math.min(1, t))).getHexString();
const ease = (v: number) => 1 - Math.pow(1 - Math.max(0, Math.min(1, v)), 2);

function ell(rx: number, ry: number, rz: number, color: string, geo: Geo = "mid") {
  const m = new THREE.Mesh(GEO[geo], mat(color));
  m.scale.set(rx, ry, rz);
  return m;
}
function at<T extends THREE.Object3D>(o: T, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) {
  o.position.set(x, y, z);
  o.rotation.set(rx, ry, rz);
  return o;
}
function rod(r: number, h: number, color: string) {
  const m = new THREE.Mesh(CYL, mat(color));
  m.scale.set(r, h, r);
  return m;
}

/**
 * A petal (or leaf) whose base sits `d0` out from the centre at angle `a`, pointing
 * outward and tilted up by `tilt` (0 = flat, PI/2 = straight up).
 */
function petal(len: number, wid: number, thick: number, color: string, a: number, d0: number, tilt: number, geo: Geo = "mid") {
  const pivot = new THREE.Group();
  pivot.rotation.y = -a;
  const arm = new THREE.Group();
  arm.position.x = d0;
  arm.rotation.z = tilt;
  arm.add(at(ell(len / 2, thick, wid / 2, color, geo), len / 2, 0, 0));
  pivot.add(arm);
  pivot.userData.arm = arm;
  return pivot;
}

/** A ring of `n` petals, alternating two shades. */
function ring(g: THREE.Group, n: number, len: number, wid: number, thick: number, tilt: number, d0: number, colors: string[], off = 0, y = 0, geo: Geo = "mid") {
  for (let i = 0; i < n; i++) {
    const p = petal(len, wid, thick, colors[i % colors.length], off + (i / n) * Math.PI * 2, d0, tilt, geo);
    p.position.y = y;
    g.add(p);
  }
}

/** Leaves round the foot of the plant. */
function rosette(r: () => number, n: number, len: number, wid: number, tilt: number, k: number) {
  const g = new THREE.Group();
  for (let i = 0; i < n; i++) {
    const c = i % 3 === 0 ? LEAF_DARK : i % 3 === 1 ? LEAF : LEAF_LIGHT;
    g.add(petal(len * k * (0.85 + r() * 0.3), wid * k, 0.018 * k, c, (i / n) * Math.PI * 2 + r() * 0.5, 0.01, tilt + (r() - 0.5) * 0.3));
  }
  return g;
}

/* ------------------------------------------------------------ Flower heads (local +Y faces out) */
type Head = (s: number, hue: Hue, r: () => number) => THREE.Group;

const daisy: Head = (s, hue) => {
  const g = new THREE.Group();
  ring(g, 14, 0.56 * s, 0.17 * s, 0.035 * s, 0.14, 0.1 * s, [hue.petal, mix(hue.petal, "#ffffff", 0.3)]);
  g.add(at(ell(0.19 * s, 0.1 * s, 0.19 * s, hue.centre ?? "#ffcf3a"), 0, 0.03 * s, 0));
  g.add(at(ell(0.21 * s, 0.06 * s, 0.21 * s, mix(hue.centre ?? "#ffcf3a", "#c77700", 0.35)), 0, 0.005 * s, 0));
  return g;
};

const cosmos: Head = (s, hue) => {
  const g = new THREE.Group();
  ring(g, 8, 0.62 * s, 0.4 * s, 0.04 * s, 0.2, 0.08 * s, [hue.petal, mix(hue.petal, "#ffffff", 0.18)]);
  const c = hue.centre ?? "#ffcc33";
  g.add(at(ell(0.14 * s, 0.09 * s, 0.14 * s, c), 0, 0.04 * s, 0));
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    g.add(at(ell(0.03 * s, 0.03 * s, 0.03 * s, mix(c, "#9a5a00", 0.4), "lo"), Math.cos(a) * 0.15 * s, 0.035 * s, Math.sin(a) * 0.15 * s));
  }
  return g;
};

const pansy: Head = (s, hue) => {
  const g = new THREE.Group();
  const face = mix(hue.petal, hue.petal === "#fbf6ee" ? "#5b3f8c" : "#2b1838", 0.62);
  // Two big petals at the back, two at the sides, one at the front.
  const spec: [number, number, number][] = [
    [100, 0.6, 0],
    [55, 0.6, 0],
    [170, 0.5, 1],
    [-15, 0.5, 1],
    [-95, 0.52, 1],
  ];
  spec.forEach(([deg, len, marked], i) => {
    const a = (deg * Math.PI) / 180;
    const p = petal(len * s, len * 0.95 * s, 0.05 * s, i < 2 ? mix(hue.petal, "#ffffff", 0.12) : hue.petal, a, 0.02 * s, 0.12);
    p.position.y = (i < 2 ? -0.01 : 0.01) * s;
    g.add(p);
    if (marked) {
      const f = petal(len * 0.55 * s, len * 0.5 * s, 0.03 * s, face, a, 0.03 * s, 0.14);
      f.position.y = 0.03 * s;
      g.add(f);
    }
  });
  g.add(at(ell(0.07 * s, 0.05 * s, 0.07 * s, "#ffd23f"), 0, 0.05 * s, 0));
  return g;
};

function tulipCup(s: number, color: string, open: number) {
  const g = new THREE.Group();
  const tilt = Math.PI / 2 - 0.05 - open * 0.24;
  ring(g, 3, 0.66 * s, 0.42 * s, 0.13 * s, tilt, 0.1 * s, [mix(color, "#ffffff", 0.12)], 0);
  ring(g, 3, 0.62 * s, 0.4 * s, 0.13 * s, tilt + 0.06, 0.07 * s, [color], Math.PI / 3);
  g.add(at(ell(0.15 * s, 0.1 * s, 0.15 * s, STEM), 0, 0.02 * s, 0));
  return g;
}
const tulip: Head = (s, hue) => tulipCup(s, hue.petal, 1);

const poppy: Head = (s, hue) => {
  const g = new THREE.Group();
  ring(g, 4, 0.6 * s, 0.66 * s, 0.06 * s, 0.6, 0.04 * s, [hue.petal, mix(hue.petal, "#ffffff", 0.15)], 0.3);
  ring(g, 4, 0.52 * s, 0.6 * s, 0.05 * s, 0.75, 0.03 * s, [mix(hue.petal, "#000000", 0.06)], 0.3 + Math.PI / 4, 0.01 * s);
  g.add(at(ell(0.13 * s, 0.11 * s, 0.13 * s, "#9cc95a"), 0, 0.1 * s, 0));
  g.add(at(ell(0.1 * s, 0.03 * s, 0.1 * s, "#5a6d33"), 0, 0.2 * s, 0));
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    g.add(at(ell(0.03 * s, 0.05 * s, 0.03 * s, "#33232d", "lo"), Math.cos(a) * 0.17 * s, 0.08 * s, Math.sin(a) * 0.17 * s));
  }
  return g;
};

const anemone: Head = (s, hue) => {
  const g = new THREE.Group();
  ring(g, 6, 0.5 * s, 0.46 * s, 0.045 * s, 0.2, 0.06 * s, [hue.petal, mix(hue.petal, "#ffffff", 0.16)]);
  if (hue.petal !== "#fbf6ee") g.add(at(ell(0.25 * s, 0.03 * s, 0.25 * s, mix(hue.petal, "#ffffff", 0.6)), 0, 0.04 * s, 0));
  g.add(at(ell(0.15 * s, 0.1 * s, 0.15 * s, "#2d3463"), 0, 0.06 * s, 0));
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    g.add(at(ell(0.03 * s, 0.03 * s, 0.03 * s, "#232a52", "lo"), Math.cos(a) * 0.2 * s, 0.07 * s, Math.sin(a) * 0.2 * s));
  }
  return g;
};

/** A tower of little star flowers (on its own stem, so +Y is straight up). */
const hyacinth: Head = (s, hue, r) => {
  const g = new THREE.Group();
  const H = 1.25 * s;
  const n = 22;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const y = t * H;
    const rad = (0.3 - t * 0.14) * s;
    const a = i * 2.4 + r() * 0.3;
    const f = new THREE.Group();
    f.position.set(Math.cos(a) * rad, y, Math.sin(a) * rad);
    f.rotation.set(0, -a, 0);
    const c = i % 3 === 0 ? mix(hue.petal, "#ffffff", 0.22) : hue.petal;
    f.add(ell(0.11 * s, 0.11 * s, 0.11 * s, mix(c, "#000000", 0.05), "lo"));
    for (let k = 0; k < 4; k++) {
      const pa = (k / 4) * Math.PI * 2 + 0.4;
      f.add(at(ell(0.03 * s, 0.09 * s, 0.07 * s, c, "lo"), 0.09 * s, Math.cos(pa) * 0.08 * s, Math.sin(pa) * 0.08 * s, 0, 0, 0));
    }
    g.add(f);
  }
  g.add(at(ell(0.1 * s, 0.12 * s, 0.1 * s, mix(hue.petal, "#ffffff", 0.3), "lo"), 0, H + 0.04 * s, 0));
  return g;
};

const lily: Head = (s, hue, r) => {
  const g = new THREE.Group();
  const speck = mix(hue.petal, "#5a1f2a", 0.55);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + (i % 2) * 0.1;
    const c = i % 2 ? hue.petal : mix(hue.petal, "#ffffff", 0.14);
    const base = petal(0.42 * s, 0.24 * s, 0.035 * s, c, a, 0.03 * s, 0.95);
    const arm = base.userData.arm as THREE.Group;
    // The tip curls back out.
    const tip = new THREE.Group();
    tip.position.x = 0.4 * s;
    tip.rotation.z = -0.75;
    tip.add(at(ell(0.18 * s, 0.03 * s, 0.1 * s, c), 0.16 * s, 0, 0));
    tip.add(at(ell(0.07 * s, 0.03 * s, 0.035 * s, mix(c, "#ffffff", 0.2)), 0.3 * s, 0.004 * s, 0));
    arm.add(tip);
    for (let k = 0; k < 3; k++) arm.add(at(ell(0.018 * s, 0.012 * s, 0.018 * s, speck, "lo"), (0.12 + k * 0.08) * s, 0.03 * s, (r() - 0.5) * 0.1 * s));
    g.add(base);
  }
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.5;
    const st = new THREE.Group();
    st.rotation.set(Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35);
    st.add(rod(0.008 * s, 0.42 * s, "#cfe3a0"));
    st.add(at(ell(0.025 * s, 0.045 * s, 0.025 * s, "#c7642b", "lo"), 0, 0.44 * s, 0));
    g.add(st);
  }
  return g;
};

const mum: Head = (s, hue) => {
  const g = new THREE.Group();
  const rings = [5, 9, 13, 17, 21];
  rings.forEach((n, k) => {
    const c = k < 1 ? mix(hue.petal, "#f3ffd0", 0.3) : k < 3 ? mix(hue.petal, "#ffffff", 0.08) : k === 4 ? mix(hue.petal, "#000000", 0.08) : hue.petal;
    ring(g, n, 0.3 * s, 0.13 * s, 0.05 * s, 1.35 - k * 0.32, (0.02 + k * 0.04) * s, [c], k * 0.4, (0.22 - k * 0.05) * s, "lo");
  });
  g.add(at(ell(0.12 * s, 0.1 * s, 0.12 * s, mix(hue.petal, "#f3ffd0", 0.3)), 0, 0.24 * s, 0));
  return g;
};

function layered(s: number, hue: Hue, layers: [number, number, number, number][], core: number) {
  const g = new THREE.Group();
  const deep = mix(hue.petal, "#7a1030", hue.petal === "#fbf6ee" ? 0.06 : 0.14);
  g.add(at(ell(core * s, core * 1.25 * s, core * s, deep), 0, core * s, 0));
  layers.forEach(([n, len, tilt, d0], k) => {
    const t = k / Math.max(1, layers.length - 1);
    const c = mix(deep, mix(hue.petal, "#ffffff", 0.12), 0.35 + t * 0.65);
    ring(g, n, len * s, len * 1.1 * s, 0.07 * s, tilt, d0 * s, [c, mix(c, "#ffffff", 0.08)], k * 0.7, (0.04 - k * 0.012) * s);
  });
  return g;
}
const rose: Head = (s, hue) =>
  layered(
    s,
    hue,
    [
      [3, 0.3, 1.25, 0.04],
      [5, 0.36, 0.95, 0.08],
      [6, 0.4, 0.55, 0.12],
    ],
    0.12,
  );
const peony: Head = (s, hue) =>
  layered(
    s,
    hue,
    [
      [5, 0.3, 1.3, 0.05],
      [7, 0.36, 1.05, 0.08],
      [9, 0.4, 0.75, 0.12],
      [10, 0.44, 0.38, 0.15],
    ],
    0.15,
  );

const HEADS: Record<string, Head> = { daisy, cosmos, pansy, tulip, poppy, anemone, hyacinth, lily, mum, rose, peony };

/* ------------------------------------------------------------ Plants */
interface Plan {
  heads: number;
  s: number; // head size
  stem: [number, number]; // stem heights
  spread: number;
  face: number; // how far heads tip outward
  leaves: [number, number, number, number]; // count, length, width, tilt
}
const PLANS: Record<string, Plan> = {
  daisy: { heads: 4, s: 0.17, stem: [0.2, 0.28], spread: 0.12, face: 0.45, leaves: [8, 0.17, 0.08, 0.35] },
  pansy: { heads: 4, s: 0.17, stem: [0.13, 0.18], spread: 0.12, face: 1.0, leaves: [9, 0.14, 0.11, 0.3] },
  tulip: { heads: 4, s: 0.19, stem: [0.26, 0.34], spread: 0.11, face: 0.12, leaves: [5, 0.3, 0.11, 1.0] },
  cosmos: { heads: 4, s: 0.18, stem: [0.32, 0.42], spread: 0.13, face: 0.5, leaves: [12, 0.17, 0.035, 0.6] },
  poppy: { heads: 3, s: 0.18, stem: [0.28, 0.36], spread: 0.12, face: 0.4, leaves: [7, 0.17, 0.07, 0.4] },
  anemone: { heads: 4, s: 0.17, stem: [0.2, 0.27], spread: 0.12, face: 0.45, leaves: [8, 0.14, 0.1, 0.35] },
  hyacinth: { heads: 3, s: 0.15, stem: [0.08, 0.1], spread: 0.11, face: 0.08, leaves: [7, 0.24, 0.065, 1.05] },
  lily: { heads: 2, s: 0.2, stem: [0.36, 0.44], spread: 0.1, face: 0.55, leaves: [6, 0.2, 0.06, 0.8] },
  mum: { heads: 3, s: 0.17, stem: [0.22, 0.3], spread: 0.12, face: 0.35, leaves: [9, 0.15, 0.1, 0.35] },
  rose: { heads: 3, s: 0.18, stem: [0.24, 0.34], spread: 0.12, face: 0.35, leaves: [10, 0.15, 0.09, 0.45] },
  peony: { heads: 2, s: 0.24, stem: [0.24, 0.3], spread: 0.12, face: 0.3, leaves: [9, 0.21, 0.1, 0.35] },
  bells: { heads: 3, s: 0.05, stem: [0.3, 0.34], spread: 0.08, face: 0, leaves: [4, 0.32, 0.12, 1.15] },
};

/** A closed bud: green when young, showing its colour just before it opens. */
function bud(s: number, color: string) {
  const g = new THREE.Group();
  g.add(at(ell(0.16 * s, 0.28 * s, 0.16 * s, color), 0, 0.22 * s, 0));
  for (let i = 0; i < 3; i++) g.add(petal(0.2 * s, 0.1 * s, 0.03 * s, LEAF, (i / 3) * Math.PI * 2, 0.02 * s, 1.1));
  return g;
}

/** Arching stem with little bells hanging under it. */
function bellStem(r: () => number, h: number, color: string, open: boolean, dir: number) {
  const g = new THREE.Group();
  const pts = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.01, h * 0.6, 0), new THREE.Vector3(0.06, h, 0), new THREE.Vector3(0.16, h * 0.9, 0)];
  const curve = new THREE.CatmullRomCurve3(pts);
  g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.008, 6, false), mat(STEM)));
  for (let i = 0; i < 6; i++) {
    const t = 0.45 + (i / 5) * 0.53;
    const p = curve.getPoint(t);
    const s = (open ? 0.045 : 0.03) * (1 - i * 0.07);
    const b = new THREE.Group();
    b.position.set(p.x, p.y - 0.035, p.z + (i % 2 ? 0.012 : -0.012));
    b.add(at(rod(0.003, 0.03, STEM), 0, 0, 0));
    if (open) {
      const bell = new THREE.Mesh(BELL, mat(color));
      bell.scale.setScalar(s);
      b.add(bell);
      b.add(at(ell(s * 0.75, s * 0.5, s * 0.75, mix(color, "#000000", 0.08), "lo"), 0, -s * 0.6, 0));
    } else b.add(at(ell(s * 0.7, s * 0.8, s * 0.7, color, "lo"), 0, -s * 0.5, 0));
    g.add(b);
  }
  g.rotation.y = dir + (r() - 0.5) * 0.4;
  return g;
}

/** Merges the parts into one mesh per material. */
function bake(root: THREE.Group) {
  root.updateMatrixWorld(true);
  const buckets = new Map<THREE.Material, THREE.BufferGeometry[]>();
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const g = m.geometry.clone();
    for (const k of Object.keys(g.attributes)) if (k !== "position" && k !== "normal" && k !== "uv") g.deleteAttribute(k);
    g.applyMatrix4(m.matrixWorld);
    const key = m.material as THREE.Material;
    const list = buckets.get(key) ?? [];
    list.push(g);
    buckets.set(key, list);
  });
  const out = new THREE.Group();
  for (const [material, geos] of buckets) {
    const merged = mergeGeometries(geos, false);
    geos.forEach((g) => g.dispose());
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    out.add(mesh);
  }
  return out;
}

/** A flower clump at growth g (0..1) in colour tier `tier`. */
export function buildFlower(species: string, g: number, tier: number, seed: number) {
  const r = rng(seed);
  const stage = stageOf(g);
  const root = new THREE.Group();
  root.userData.stage = stage;
  if (stage <= 1) {
    root.add(seedling(g, r));
    return root;
  }
  const sp = speciesById.get(species) ?? speciesById.get("daisy")!;
  const hue = sp.hues[Math.max(0, Math.min(4, tier))];
  const plan = PLANS[sp.id] ?? PLANS.daisy;
  const k = 0.72 + 0.28 * ease((g - 0.22) / 0.78);
  const parts = new THREE.Group();
  parts.add(at(ell(0.2, 0.04, 0.2, "#6e452c", "hi"), 0, 0.0, 0));
  const [ln, ll, lw, lt] = plan.leaves;
  parts.add(rosette(r, ln, ll, lw, lt, stage === 2 ? 0.75 + (g - 0.22) * 0.8 : 1));

  if (sp.id === "bells") {
    if (stage >= 3) for (let i = 0; i < plan.heads; i++) parts.add(at(bellStem(r, plan.stem[0] + r() * 0.04, stage === 5 ? hue.petal : stage === 4 ? mix(hue.petal, LEAF_LIGHT, 0.35) : LEAF_LIGHT, stage === 5, (i / plan.heads) * Math.PI * 2 + 0.6), Math.cos(i * 2.1) * 0.03, 0, Math.sin(i * 2.1) * 0.03));
  } else if (stage >= 3) {
    for (let i = 0; i < plan.heads; i++) {
      const a = (i / plan.heads) * Math.PI * 2 + r() * 0.6;
      const d = plan.spread * (0.7 + r() * 0.4);
      const x = Math.cos(a) * d;
      const z = Math.sin(a) * d;
      const h = (plan.stem[0] + r() * (plan.stem[1] - plan.stem[0])) * k * (stage === 3 ? 0.8 : 1);
      // Stems lean outward a little, so the heads tip out and are easy to see.
      const lean = 0.12 + r() * 0.1;
      const stem = new THREE.Group();
      stem.position.set(x * 0.3, 0, z * 0.3);
      stem.rotation.set(Math.sin(a) * lean, 0, -Math.cos(a) * lean);
      stem.add(rod(0.012, h, STEM));
      if (sp.id === "lily" || sp.id === "rose")
        for (let j = 0; j < 3; j++) stem.add(at(petal(0.09, 0.04, 0.012, j % 2 ? LEAF : LEAF_DARK, j * 2.1 + r(), 0.01, 0.5), 0, h * (0.3 + j * 0.2), 0));
      const head = new THREE.Group();
      head.position.y = h;
      if (sp.id !== "hyacinth") head.rotation.set(Math.sin(a) * plan.face, 0, -Math.cos(a) * plan.face);
      if (stage === 5) head.add(HEADS[sp.id](plan.s, hue, r));
      else if (sp.id === "hyacinth") head.add(hyacinth(plan.s * 0.8, { name: "", petal: stage === 4 ? mix(hue.petal, LEAF_LIGHT, 0.45) : LEAF_LIGHT }, r));
      else if (sp.id === "tulip") head.add(tulipCup(plan.s * (stage === 4 ? 0.85 : 0.6), stage === 4 ? mix(hue.petal, LEAF_LIGHT, 0.3) : LEAF_LIGHT, 0));
      else head.add(bud(plan.s * (stage === 4 ? 0.9 : 0.6), stage === 4 ? mix(hue.petal, LEAF_LIGHT, 0.3) : LEAF_LIGHT));
      stem.add(head);
      parts.add(stem);
    }
  }
  parts.scale.setScalar(1.5);
  root.add(bake(parts));
  disposeTemp(parts);
  return root;
}

/** Frees one-off geometry (the bell stems' tubes) once it has been merged. */
function disposeTemp(o: THREE.Object3D) {
  o.traverse((c) => {
    const m = c as THREE.Mesh;
    if (m.isMesh && m.geometry instanceof THREE.TubeGeometry) m.geometry.dispose();
  });
}
