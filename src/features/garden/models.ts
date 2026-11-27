// Chunky, rounded, soft-lit 3D models for the study garden, built from simple
// shapes (spheres, capsules, cones). Each plant is drawn for a growth value
// g from 0 (just planted) to 1 (full bloom), so it visibly grows as you study.
import * as THREE from "three";
import { stageOf } from "./catalog";

/* ------------------------------------------------------------ Shared pieces */
/** Soft cartoon shading: four gentle steps of light instead of a smooth gradient. */
export const TOON_RAMP = (() => {
  const steps = [118, 176, 224, 255];
  const data = new Uint8Array(steps.length * 4);
  steps.forEach((v, i) => data.set([v, v, v, 255], i * 4));
  const t = new THREE.DataTexture(data, steps.length, 1, THREE.RGBAFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
})();
const mats = new Map<string, THREE.Material>();
export function mat(color: string, opts: { rough?: number; emissive?: string; ei?: number; opacity?: number } = {}) {
  const key = `${color}|${opts.rough ?? 0.85}|${opts.emissive ?? ""}|${opts.ei ?? 0}|${opts.opacity ?? 1}`;
  let m = mats.get(key);
  if (!m) {
    const common = {
      color,
      emissive: opts.emissive ? new THREE.Color(opts.emissive) : new THREE.Color(0),
      emissiveIntensity: opts.ei ?? 0,
      transparent: (opts.opacity ?? 1) < 1,
      opacity: opts.opacity ?? 1,
    };
    // Shiny things (water) keep real highlights; everything else is soft-toon.
    m = (opts.rough ?? 0.85) < 0.4 ? new THREE.MeshStandardMaterial({ ...common, roughness: opts.rough, metalness: 0 }) : new THREE.MeshToonMaterial({ ...common, gradientMap: TOON_RAMP });
    mats.set(key, m);
  }
  return m;
}
const SPHERE = new THREE.SphereGeometry(1, 32, 22);
const LOWSPHERE = new THREE.SphereGeometry(1, 14, 10);
const CYL = new THREE.CylinderGeometry(1, 1, 1, 20, 1);
const CONE = new THREE.ConeGeometry(1, 1, 22, 1);
const TORUS = new THREE.TorusGeometry(1, 0.18, 8, 24);
const ROCK = new THREE.DodecahedronGeometry(1, 0);
const BOX = new THREE.BoxGeometry(1, 1, 1);

function mesh(geo: THREE.BufferGeometry, m: THREE.Material) {
  const x = new THREE.Mesh(geo, m);
  x.castShadow = true;
  x.receiveShadow = true;
  return x;
}
/** An ellipsoid of radii (rx, ry, rz). */
export function ell(rx: number, ry: number, rz: number, color: string, o?: Parameters<typeof mat>[1], low = false) {
  const x = mesh(low ? LOWSPHERE : SPHERE, mat(color, o));
  x.scale.set(rx, ry, rz);
  return x;
}
/** A cylinder from y=0 up to y=h, tapering from rBottom to rTop. */
export function stalk(rBottom: number, rTop: number, h: number, color: string) {
  const g = new THREE.CylinderGeometry(rTop, rBottom, h, 10, 1);
  g.translate(0, h / 2, 0);
  return mesh(g, mat(color));
}
function cyl(r: number, h: number, color: string, o?: Parameters<typeof mat>[1]) {
  const x = mesh(CYL, mat(color, o));
  x.scale.set(r, h, r);
  return x;
}
function cone(r: number, h: number, color: string) {
  const x = mesh(CONE, mat(color));
  x.scale.set(r, h, r);
  return x;
}
function box(w: number, h: number, d: number, color: string, o?: Parameters<typeof mat>[1]) {
  const x = mesh(BOX, mat(color, o));
  x.scale.set(w, h, d);
  return x;
}
function at<T extends THREE.Object3D>(o: T, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): T {
  o.position.set(x, y, z);
  o.rotation.set(rx, ry, rz);
  return o;
}
/** A deterministic random generator, so a plant looks the same every time it's drawn. */
export function rng(seed: number) {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const ease = (v: number) => 1 - Math.pow(1 - clamp01(v), 2);

const LEAF = "#5cbf55";
const LEAF_DARK = "#3f9a46";
const STEM = "#4e9a3c";
const TRUNK = "#9b6a43";
const SOIL = "#7a4e33";

/** A leaf: a flattened ellipsoid pointing along +y, pivoting at its base. */
function leaf(len: number, width: number, color = LEAF) {
  const g = new THREE.Group();
  const l = ell(width, len / 2, width * 0.28, color);
  l.position.y = len / 2;
  g.add(l);
  return g;
}

/* ------------------------------------------------------------ Early stages */
export function seedling(g: number, r: () => number) {
  const grp = new THREE.Group();
  grp.add(at(ell(0.16, 0.06, 0.16, SOIL), 0, 0, 0));
  if (g < 0.06) {
    grp.add(at(ell(0.035, 0.025, 0.03, "#d9b27c"), 0.02, 0.05, 0, 0, 0, 0.5));
    return grp;
  }
  // A sprout: a little stem and two round seed leaves, growing with g.
  const s = 0.6 + ease((g - 0.06) / 0.16) * 0.6;
  const h = 0.12 * s;
  grp.add(stalk(0.012, 0.01, h, STEM));
  for (const side of [-1, 1]) {
    const l = leaf(0.07 * s, 0.035 * s, "#86d65e");
    l.position.y = h;
    l.rotation.z = side * 1.05;
    l.rotation.y = r() * 0.4;
    grp.add(l);
  }
  return grp;
}

/* ------------------------------------------------------------ Plants */
type Builder = (g: number, r: () => number, size: number, stage: number) => THREE.Group;

const PETALS = ["#ff5d73", "#ffb3c7", "#ffd23f", "#ff8a3d", "#c77dff", "#ffffff"];

const tulip: Builder = (_g, r, size, stage) => {
  const grp = new THREE.Group();
  const color = PETALS[Math.floor(r() * 5)];
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + r();
    const x = Math.cos(a) * 0.11;
    const z = Math.sin(a) * 0.11;
    const h = (0.32 + r() * 0.1) * size;
    const st = stalk(0.016, 0.013, h, STEM);
    st.position.set(x, 0, z);
    st.rotation.z = (r() - 0.5) * 0.15;
    grp.add(st);
    for (const side of [-1, 1]) {
      const l = leaf(0.2 * size, 0.045 * size, LEAF);
      l.position.set(x, 0.01, z);
      l.rotation.set(0, a, side * 0.45);
      grp.add(l);
    }
    if (stage >= 4) {
      const open = stage === 5 ? 0.38 : 0.08;
      const head = new THREE.Group();
      head.position.set(x + Math.sin(st.rotation.z) * -h, h, z);
      for (let p = 0; p < 6; p++) {
        const pet = new THREE.Group();
        const e = ell(0.042, 0.075, 0.03, p % 2 ? color : new THREE.Color(color).offsetHSL(0, 0, 0.06).getStyle());
        e.position.y = 0.06;
        pet.add(e);
        pet.rotation.set(0, (p / 6) * Math.PI * 2 + (p % 2) * 0.5, 0);
        pet.rotateX(p % 2 ? open * 0.7 : open);
        head.add(pet);
      }
      grp.add(head);
    }
  }
  return grp;
};

const daisy: Builder = (_g, r, size, stage) => {
  const grp = new THREE.Group();
  grp.add(at(ell(0.2, 0.05, 0.2, LEAF_DARK), 0, 0.02, 0));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + r() * 0.6;
    const d = 0.06 + r() * 0.1;
    const h = (0.2 + r() * 0.12) * size;
    const x = Math.cos(a) * d;
    const z = Math.sin(a) * d;
    grp.add(at(stalk(0.009, 0.008, h, STEM), x, 0, z));
    if (stage >= 4) {
      const head = new THREE.Group();
      head.position.set(x, h, z);
      head.rotation.set(-0.35 + r() * 0.2, a, 0);
      if (stage === 5) {
        for (let p = 0; p < 12; p++) {
          const pa = (p / 12) * Math.PI * 2;
          head.add(at(ell(0.042, 0.009, 0.014, "#ffffff"), Math.cos(pa) * 0.045, 0, Math.sin(pa) * 0.045, 0, -pa, 0));
        }
        head.add(at(ell(0.026, 0.016, 0.026, "#ffcc33"), 0, 0.006, 0));
      } else head.add(ell(0.024, 0.024, 0.024, "#9ed36b"));
      grp.add(head);
    }
  }
  return grp;
};

const clover: Builder = (_g, r, size, stage) => {
  const grp = new THREE.Group();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + r();
    const d = 0.05 + r() * 0.12;
    const h = (0.08 + r() * 0.08) * size;
    const x = Math.cos(a) * d;
    const z = Math.sin(a) * d;
    grp.add(at(stalk(0.006, 0.006, h, STEM), x, 0, z));
    const n = i === 0 ? 4 : 3;
    for (let k = 0; k < n; k++) {
      const la = (k / n) * Math.PI * 2 + a;
      grp.add(at(ell(0.034 * size, 0.008, 0.028 * size, i === 0 ? "#3fae3a" : "#5fc456"), x + Math.cos(la) * 0.028 * size, h, z + Math.sin(la) * 0.028 * size, 0, -la, 0));
    }
  }
  if (stage >= 4) {
    for (let i = 0; i < 3; i++) {
      const a = r() * Math.PI * 2;
      const x = Math.cos(a) * 0.1;
      const z = Math.sin(a) * 0.1;
      grp.add(at(stalk(0.006, 0.006, 0.2 * size, STEM), x, 0, z));
      grp.add(at(ell(0.035, stage === 5 ? 0.04 : 0.025, 0.035, stage === 5 ? "#f7e8f0" : "#cfe8b8"), x, 0.2 * size, z));
      if (stage === 5) grp.add(at(ell(0.03, 0.02, 0.03, "#f4a6c0"), x, 0.2 * size + 0.025, z));
    }
  }
  return grp;
};

const lavender: Builder = (_g, r, size, stage) => {
  const grp = new THREE.Group();
  for (let i = 0; i < 7; i++) grp.add(at(ell(0.07 * size, 0.06 * size, 0.07 * size, "#8fb48a"), (r() - 0.5) * 0.2, 0.04, (r() - 0.5) * 0.2));
  const spike = stage === 5 ? "#9b6fe0" : stage === 4 ? "#b8a6cf" : "#9fc28e";
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2 + r();
    const lean = 0.12 + r() * 0.25;
    const h = (0.36 + r() * 0.14) * size;
    const s = new THREE.Group();
    s.rotation.set(Math.cos(a) * lean, 0, Math.sin(a) * lean);
    s.add(stalk(0.006, 0.005, h, "#7ea36a"));
    if (stage >= 3)
      for (let k = 0; k < 6; k++) s.add(at(ell(0.018, 0.024, 0.018, spike, undefined, true), (k % 2 ? 0.008 : -0.008), h - 0.02 - k * 0.028, 0));
    grp.add(s);
  }
  return grp;
};

const sunflower: Builder = (_g, r, size, stage) => {
  const grp = new THREE.Group();
  const h = 1.05 * size;
  const st = stalk(0.035, 0.025, h, STEM);
  grp.add(st);
  for (let i = 0; i < 5; i++) {
    const l = leaf(0.2 * size, 0.09 * size, i % 2 ? LEAF : LEAF_DARK);
    l.position.y = h * (0.2 + i * 0.14);
    l.rotation.set(0, i * 2.1 + r(), 1.0);
    grp.add(l);
  }
  if (stage >= 4) {
    const head = new THREE.Group();
    head.position.set(0, h, 0.02);
    head.rotation.x = 0.9; // faces outwards and a little up
    const open = stage === 5;
    const disk = cyl(open ? 0.13 : 0.07, 0.05, open ? "#6b4226" : "#7cae4a");
    head.add(disk);
    const n = open ? 20 : 10;
    for (let p = 0; p < n; p++) {
      const a = (p / n) * Math.PI * 2;
      const pet = new THREE.Group();
      pet.rotation.y = -a;
      const e = ell(open ? 0.065 : 0.03, 0.012, open ? 0.028 : 0.02, open ? (p % 2 ? "#ffcc2f" : "#ffbf1f") : "#a9cc5e");
      e.position.x = open ? 0.17 : 0.07;
      e.rotation.z = open ? 0.1 : 1.1;
      pet.add(e);
      head.add(pet);
    }
    if (open) for (let k = 0; k < 14; k++) head.add(at(ell(0.012, 0.012, 0.012, "#4a2c17", undefined, true), (r() - 0.5) * 0.16, 0.028, (r() - 0.5) * 0.16));
    grp.add(head);
  }
  return grp;
};

function bush(grp: THREE.Group, r: () => number, size: number, color: string, n = 8, rad = 0.2) {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + r();
    const d = rad * 0.55 * size;
    const p = new THREE.Vector3(Math.cos(a) * d, (0.16 + r() * 0.18) * size, Math.sin(a) * d);
    pts.push(p);
    const s = (0.12 + r() * 0.06) * size;
    grp.add(at(ell(s, s * 0.9, s, i % 3 ? color : new THREE.Color(color).offsetHSL(0, 0, -0.06).getStyle()), p.x, p.y, p.z));
  }
  grp.add(at(ell(rad * 0.8 * size, rad * 0.85 * size, rad * 0.8 * size, color), 0, 0.3 * size, 0));
  return pts;
}

const rose: Builder = (_g, r, size, stage) => {
  const grp = new THREE.Group();
  bush(grp, r, size, "#3f9a46", 9, 0.24);
  if (stage >= 4) {
    const red = r() < 0.6 ? "#e63950" : "#ff8fb1";
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + r();
      const y = (0.22 + r() * 0.3) * size;
      const d = 0.21 * size;
      const rose = new THREE.Group();
      rose.position.set(Math.cos(a) * d, y, Math.sin(a) * d);
      rose.lookAt(rose.position.x * 3, y + 0.1, rose.position.z * 3);
      const s = stage === 5 ? 1 : 0.55;
      rose.add(ell(0.035 * s, 0.035 * s, 0.03 * s, red));
      if (stage === 5) for (let p = 0; p < 5; p++) rose.add(at(ell(0.03, 0.022, 0.012, new THREE.Color(red).offsetHSL(0, 0, -0.07).getStyle()), Math.cos(p * 1.26) * 0.03, Math.sin(p * 1.26) * 0.03, -0.005, 0, 0, p * 1.26));
      grp.add(rose);
    }
  }
  return grp;
};

const hydrangea: Builder = (_g, r, size, stage) => {
  const grp = new THREE.Group();
  const pts = bush(grp, r, size, "#58b35a", 9, 0.26);
  if (stage >= 4) {
    const hues = ["#7aa6ff", "#a98bff", "#c3a6f4", "#8fc1ff"];
    pts.slice(0, 6).forEach((p, i) => {
      const c = new THREE.Group();
      c.position.set(p.x * 1.25, p.y + 0.07 * size, p.z * 1.25);
      const col = stage === 5 ? hues[(i + Math.floor(r() * 4)) % 4] : "#cfe5b0";
      for (let k = 0; k < (stage === 5 ? 14 : 7); k++) c.add(at(ell(0.026, 0.026, 0.026, col, undefined, true), (r() - 0.5) * 0.1, (r() - 0.3) * 0.07, (r() - 0.5) * 0.1));
      grp.add(c);
    });
  }
  return grp;
};

const pumpkin: Builder = (g, r, size, stage) => {
  const grp = new THREE.Group();
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + r();
    grp.add(at(ell(0.15 * size, 0.018, 0.12 * size, i % 2 ? LEAF : LEAF_DARK), Math.cos(a) * 0.2 * size, 0.04, Math.sin(a) * 0.2 * size, 0, -a, 0));
  }
  if (stage === 4) {
    grp.add(at(cone(0.05, 0.08, "#ffcf3f"), 0.05, 0.12, 0, Math.PI, 0, 0));
  }
  if (stage >= 3) {
    const grow = stage === 5 ? 1 : stage === 4 ? 0.45 : 0.28;
    const color = stage === 5 ? "#ff8c1a" : "#9ccc5a";
    const body = new THREE.Group();
    body.position.set(-0.03, 0.13 * grow + 0.03, 0.04);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      body.add(at(ell(0.1 * grow, 0.15 * grow, 0.08 * grow, k % 2 ? color : new THREE.Color(color).offsetHSL(0, 0, -0.04).getStyle()), Math.cos(a) * 0.1 * grow, 0, Math.sin(a) * 0.1 * grow, 0, -a, 0));
    }
    body.add(at(stalk(0.02 * grow + 0.008, 0.015, 0.07, "#6d8b3a"), 0, 0.13 * grow, 0, 0, 0, 0.2));
    grp.add(body);
  }
  void g;
  return grp;
};

const cactus: Builder = (_g, r, size, stage) => {
  const grp = new THREE.Group();
  const green = "#4caf6a";
  const h = 0.62 * size;
  grp.add(at(cyl(0.11 * size, h, green), 0, h / 2, 0));
  grp.add(at(ell(0.11 * size, 0.1 * size, 0.11 * size, green), 0, h, 0));
  if (stage >= 3)
    for (const side of [-1, 1]) {
      const y = h * (side > 0 ? 0.45 : 0.6);
      const arm = new THREE.Group();
      arm.position.set(side * 0.1 * size, y, 0);
      arm.add(at(cyl(0.055 * size, 0.12 * size, green), side * 0.06 * size, 0, 0, 0, 0, Math.PI / 2));
      arm.add(at(cyl(0.055 * size, 0.16 * size, green), side * 0.12 * size, 0.08 * size, 0));
      arm.add(at(ell(0.055 * size, 0.05 * size, 0.055 * size, green), side * 0.12 * size, 0.16 * size, 0));
      grp.add(arm);
    }
  for (let i = 0; i < 18; i++) {
    const a = r() * Math.PI * 2;
    grp.add(at(ell(0.007, 0.007, 0.007, "#fff6dd", undefined, true), Math.cos(a) * 0.112 * size, r() * h, Math.sin(a) * 0.112 * size));
  }
  if (stage >= 4) {
    const f = new THREE.Group();
    f.position.set(0, h + 0.09 * size, 0);
    for (let p = 0; p < 6; p++) {
      const pet = new THREE.Group();
      pet.rotation.y = (p / 6) * Math.PI * 2;
      const e = ell(0.02, stage === 5 ? 0.05 : 0.03, 0.012, "#ff6fa5");
      e.position.y = 0.03;
      pet.add(e);
      pet.rotateX(stage === 5 ? 0.7 : 0.15);
      f.add(pet);
    }
    grp.add(f);
  }
  return grp;
};

const bamboo: Builder = (_g, r, size, stage) => {
  const grp = new THREE.Group();
  const canes = stage >= 4 ? 6 : 4;
  for (let i = 0; i < canes; i++) {
    const a = (i / canes) * Math.PI * 2 + r();
    const d = 0.06 + r() * 0.1;
    const h = (0.9 + r() * 0.6) * size;
    const x = Math.cos(a) * d;
    const z = Math.sin(a) * d;
    const c = new THREE.Group();
    c.position.set(x, 0, z);
    c.rotation.set((r() - 0.5) * 0.12, 0, (r() - 0.5) * 0.12);
    c.add(stalk(0.032, 0.028, h, "#9ccc65"));
    for (let y = 0.18; y < h; y += 0.2) {
      const ring = at(mesh(TORUS, mat("#7cb342")), 0, y, 0, Math.PI / 2, 0, 0);
      ring.scale.set(0.032, 0.032, 0.032);
      c.add(ring);
    }
    for (let k = 0; k < 4; k++) {
      const l = leaf(0.16, 0.025, k % 2 ? "#7cc152" : "#5ea83e");
      l.position.y = h - k * 0.12;
      l.rotation.set(0, r() * 6, 1.2 + r() * 0.3);
      c.add(l);
    }
    grp.add(c);
  }
  return grp;
};

function trunk(grp: THREE.Group, h: number, r0: number) {
  grp.add(stalk(r0, r0 * 0.65, h, TRUNK));
  for (const a of [0, 2.1, 4.2]) grp.add(at(ell(r0 * 0.9, r0 * 0.4, r0 * 0.5, TRUNK), Math.cos(a) * r0, 0.02, Math.sin(a) * r0, 0, -a, 0));
}

function crown(grp: THREE.Group, r: () => number, y: number, rad: number, colors: string[], n = 9, cx = 0, cz = 0) {
  const pts: THREE.Vector3[] = [];
  grp.add(at(ell(rad, rad * 0.85, rad, colors[0]), cx, y, cz));
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + r();
    const up = r() * 0.6 - 0.1;
    const p = new THREE.Vector3(cx + Math.cos(a) * rad * 0.7, y + up * rad, cz + Math.sin(a) * rad * 0.7);
    pts.push(p);
    const s = rad * (0.5 + r() * 0.2);
    grp.add(at(ell(s, s * 0.9, s, colors[i % colors.length]), p.x, p.y, p.z));
  }
  return pts;
}

const lemon: Builder = (_g, r, size, stage) => {
  const grp = new THREE.Group();
  const h = 0.55 * size;
  trunk(grp, h, 0.06 * size);
  const pts = crown(grp, r, h + 0.22 * size, 0.3 * size, ["#4caf50", "#5cbf55", "#43a047"]);
  if (stage >= 4)
    pts.concat(pts.map((p) => p.clone().add(new THREE.Vector3(0, -0.08 * size, 0)))).forEach((p, i) => {
      const out = new THREE.Vector3(p.x, 0, p.z).normalize().multiplyScalar(0.14 * size);
      const fruit = stage === 5 ? ell(0.045, 0.06, 0.045, "#ffe14d") : ell(0.025, 0.025, 0.025, "#ffffff");
      grp.add(at(fruit, p.x + out.x, p.y - 0.05 + (i % 3) * 0.04, p.z + out.z, 0.3, 0, 0.2));
    });
  return grp;
};

const pine: Builder = (_g, r, size, stage) => {
  const grp = new THREE.Group();
  trunk(grp, 0.22 * size, 0.06 * size);
  const tiers = 4;
  for (let i = 0; i < tiers; i++) {
    const rad = (0.38 - i * 0.075) * size;
    const y = (0.22 + i * 0.22) * size;
    grp.add(at(cone(rad, 0.36 * size, i % 2 ? "#2e7d4f" : "#2a6e47"), 0, y + 0.18 * size, 0, 0, r(), 0));
  }
  if (stage >= 4)
    for (let i = 0; i < (stage === 5 ? 6 : 2); i++) {
      const a = r() * Math.PI * 2;
      const tier = Math.floor(r() * 3);
      const rad = (0.34 - tier * 0.075) * size;
      grp.add(at(ell(0.025, 0.04, 0.025, "#8a5a32"), Math.cos(a) * rad * 0.8, (0.26 + tier * 0.22) * size, Math.sin(a) * rad * 0.8));
    }
  return grp;
};

function branchy(grp: THREE.Group, r: () => number, size: number) {
  const h = 0.5 * size;
  trunk(grp, h, 0.075 * size);
  const ends: THREE.Vector3[] = [];
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + r();
    const b = new THREE.Group();
    b.position.y = h * 0.85;
    b.rotation.set(Math.cos(a) * 0.7, 0, Math.sin(a) * 0.7);
    b.add(stalk(0.035 * size, 0.02 * size, 0.32 * size, TRUNK));
    grp.add(b);
    b.updateMatrix();
    ends.push(new THREE.Vector3(0, 0.32 * size, 0).applyMatrix4(b.matrix));
  }
  return { h, ends };
}

const cherry: Builder = (_g, r, size, stage) => {
  const grp = new THREE.Group();
  const { h, ends } = branchy(grp, r, size);
  const colors = stage === 5 ? ["#ffc1d6", "#ffd6e4", "#ff9fbf"] : stage === 4 ? ["#a8d47f", "#ffd6e4", "#94c66a"] : ["#8cc66a", "#79b85c", "#9fd17c"];
  for (const e of ends) crown(grp, r, e.y + 0.05 * size, 0.2 * size, colors, 6, e.x, e.z);
  crown(grp, r, h + 0.3 * size, 0.22 * size, colors, 5);
  grp.userData.petals = stage === 5;
  return grp;
};

const maple: Builder = (_g, r, size, stage) => {
  const grp = new THREE.Group();
  const { h, ends } = branchy(grp, r, size);
  const colors = stage === 5 ? ["#e8553a", "#f08a3c", "#f4b942", "#d9452f"] : stage === 4 ? ["#9fc85a", "#f0b84a", "#8cc66a"] : ["#6fbf5a", "#5aa84a", "#82c96a"];
  for (const e of ends) crown(grp, r, e.y + 0.05 * size, 0.2 * size, colors, 6, e.x, e.z);
  crown(grp, r, h + 0.3 * size, 0.24 * size, colors, 5);
  return grp;
};

const BUILDERS: Record<string, Builder> = { tulip, daisy, clover, lavender, sunflower, rose, hydrangea, pumpkin, cactus, bamboo, lemon, pine, cherry, maple };
const TREES = new Set(["lemon", "pine", "cherry", "maple", "bamboo"]);

/** A plant at growth g (0..1). */
export function buildPlant(species: string, g: number, seed: number) {
  const r = rng(seed);
  const stage = stageOf(g);
  const root = new THREE.Group();
  if (stage <= 1) root.add(seedling(g, r));
  else {
    const size = (TREES.has(species) ? 0.45 : 0.55) + ease((g - 0.22) / 0.78) * (TREES.has(species) ? 0.75 : 0.45);
    root.add(at(ell(0.2, 0.05, 0.2, SOIL), 0, 0, 0));
    const b = BUILDERS[species] ?? tulip;
    const p = b(g, r, size, stage);
    root.add(p);
    root.userData.petals = p.userData.petals;
  }
  root.userData.stage = stage;
  return root;
}

/* ------------------------------------------------------------ Decorations */
const WOOD = "#c49a6c";
const STONE = "#c9c2b8";

function fence() {
  const g = new THREE.Group();
  for (const x of [-0.4, 0, 0.4]) {
    g.add(at(box(0.07, 0.36, 0.07, WOOD), x, 0.18, 0.3));
    g.add(at(cone(0.05, 0.06, WOOD), x, 0.39, 0.3, 0, Math.PI / 4, 0));
  }
  for (const y of [0.12, 0.27]) g.add(at(box(0.9, 0.05, 0.035, "#b8895a"), 0, y, 0.3));
  return g;
}
function path(r: () => number) {
  const g = new THREE.Group();
  for (let i = 0; i < 4; i++) g.add(at(cyl(0.12 + r() * 0.04, 0.035, i % 2 ? STONE : "#bdb5aa"), -0.25 + (i % 2) * 0.22 + r() * 0.05, 0.02, -0.3 + i * 0.2, 0, r(), 0));
  return g;
}
function rocks(r: () => number) {
  const g = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const s = 0.09 + r() * 0.08;
    const k = mesh(ROCK, mat(i % 2 ? "#a8a29a" : "#b9b2a8", { rough: 1 }));
    k.scale.set(s * 1.3, s, s);
    g.add(at(k, (r() - 0.5) * 0.4, s * 0.6, (r() - 0.5) * 0.4, r(), r(), r()));
    g.add(at(ell(s * 0.8, s * 0.25, s * 0.8, "#7fb85a"), k.position.x, s * 1.25, k.position.z));
  }
  return g;
}
function mushrooms(r: () => number) {
  const g = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const s = 0.6 + r() * 0.6;
    const x = (r() - 0.5) * 0.4;
    const z = (r() - 0.5) * 0.4;
    g.add(at(cyl(0.025 * s, 0.12 * s, "#fff4e0"), x, 0.06 * s, z));
    const cap = ell(0.08 * s, 0.05 * s, 0.08 * s, "#e6453a");
    g.add(at(cap, x, 0.12 * s, z));
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      g.add(at(ell(0.012 * s, 0.006, 0.012 * s, "#ffffff"), x + Math.cos(a) * 0.05 * s, 0.155 * s, z + Math.sin(a) * 0.05 * s));
    }
  }
  return g;
}
function flowerbox(r: () => number) {
  const g = new THREE.Group();
  g.add(at(box(0.7, 0.16, 0.3, WOOD), 0, 0.08, 0));
  g.add(at(box(0.66, 0.02, 0.26, SOIL), 0, 0.165, 0));
  for (let i = 0; i < 9; i++) {
    const x = -0.28 + (i % 5) * 0.14;
    const z = i < 5 ? -0.05 : 0.06;
    g.add(at(ell(0.035, 0.035, 0.035, PETALS[Math.floor(r() * 6)]), x, 0.24, z));
    g.add(at(ell(0.03, 0.02, 0.03, LEAF), x, 0.19, z));
  }
  return g;
}
function can() {
  const g = new THREE.Group();
  g.add(at(cyl(0.12, 0.2, "#5fb3b3", { rough: 0.5 }), 0, 0.1, 0));
  g.add(at(stalk(0.025, 0.015, 0.25, "#5fb3b3"), 0.1, 0.05, 0, 0, 0, -1));
  const handle = at(mesh(TORUS, mat("#4a9a9a")), -0.02, 0.24, 0, 0, Math.PI / 2, 0);
  handle.scale.set(0.09, 0.09, 0.09);
  g.add(handle);
  return g;
}
function hedge(r: () => number) {
  const g = new THREE.Group();
  g.add(at(ell(0.3, 0.26, 0.3, "#4f9a47"), 0, 0.26, 0));
  for (let i = 0; i < 6; i++) {
    const a = r() * Math.PI * 2;
    g.add(at(ell(0.14, 0.12, 0.14, "#5aab50"), Math.cos(a) * 0.2, 0.2 + r() * 0.2, Math.sin(a) * 0.2));
  }
  for (let i = 0; i < 6; i++) {
    const a = r() * Math.PI * 2;
    g.add(at(ell(0.025, 0.025, 0.025, "#ffffff"), Math.cos(a) * 0.29, 0.22 + r() * 0.18, Math.sin(a) * 0.29));
  }
  return g;
}
function lantern() {
  const g = new THREE.Group();
  g.add(at(cyl(0.16, 0.06, STONE), 0, 0.03, 0));
  g.add(at(cyl(0.06, 0.3, STONE), 0, 0.21, 0));
  g.add(at(box(0.2, 0.04, 0.2, STONE), 0, 0.38, 0));
  g.add(at(box(0.14, 0.13, 0.14, "#ffe7a8", { emissive: "#ffcf6b", ei: 1.4 }), 0, 0.465, 0));
  g.add(at(cone(0.2, 0.14, "#b3aca2"), 0, 0.6, 0, 0, Math.PI / 4, 0));
  g.add(at(ell(0.03, 0.03, 0.03, STONE), 0, 0.69, 0));
  g.userData.glow = true;
  return g;
}
function lamp() {
  const g = new THREE.Group();
  g.add(at(cyl(0.025, 0.8, "#3d3b44", { rough: 0.5 }), 0, 0.4, 0));
  g.add(at(cyl(0.07, 0.04, "#3d3b44"), 0, 0.02, 0));
  g.add(at(ell(0.09, 0.11, 0.09, "#fff1c2", { emissive: "#ffd98a", ei: 1.6 }), 0, 0.88, 0));
  g.add(at(cone(0.12, 0.08, "#3d3b44"), 0, 0.99, 0));
  g.userData.glow = true;
  return g;
}
function bench() {
  const g = new THREE.Group();
  g.add(at(box(0.75, 0.05, 0.26, WOOD), 0, 0.25, 0));
  g.add(at(box(0.75, 0.16, 0.04, WOOD), 0, 0.4, -0.12, -0.15, 0, 0));
  for (const x of [-0.32, 0.32]) for (const z of [-0.1, 0.1]) g.add(at(box(0.05, 0.25, 0.05, "#7a5a3c"), x, 0.125, z));
  return g;
}
function birdbath() {
  const g = new THREE.Group();
  g.add(at(cyl(0.14, 0.05, STONE), 0, 0.025, 0));
  g.add(at(cyl(0.05, 0.36, STONE), 0, 0.22, 0));
  g.add(at(cyl(0.24, 0.07, STONE), 0, 0.42, 0));
  g.add(at(cyl(0.2, 0.02, "#8fd8ff", { rough: 0.15 }), 0, 0.46, 0));
  return g;
}
function pond(r: () => number) {
  const g = new THREE.Group();
  g.add(at(cyl(0.42, 0.03, "#7fd3ff", { rough: 0.1 }), 0, 0.02, 0));
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    const s = 0.06 + r() * 0.03;
    const k = mesh(ROCK, mat(i % 2 ? STONE : "#b2aa9f", { rough: 1 }));
    k.scale.set(s, s * 0.7, s);
    g.add(at(k, Math.cos(a) * 0.44, 0.04, Math.sin(a) * 0.44, r(), r(), 0));
  }
  for (let i = 0; i < 3; i++) g.add(at(cyl(0.07, 0.008, "#5cb85c"), (r() - 0.5) * 0.4, 0.04, (r() - 0.5) * 0.4));
  const lotus = new THREE.Group();
  lotus.position.set(0.1, 0.05, -0.05);
  for (let p = 0; p < 6; p++) {
    const pet = new THREE.Group();
    pet.rotation.y = (p / 6) * Math.PI * 2;
    const e = ell(0.02, 0.04, 0.012, "#ffb3cc");
    e.position.y = 0.03;
    pet.add(e);
    pet.rotateX(0.5);
    lotus.add(pet);
  }
  g.add(lotus);
  g.userData.water = true;
  return g;
}
function arch(r: () => number) {
  const g = new THREE.Group();
  for (const x of [-0.36, 0.36]) g.add(at(box(0.06, 0.72, 0.06, "#ffffff"), x, 0.36, 0));
  const t = mesh(new THREE.TorusGeometry(0.36, 0.03, 8, 24, Math.PI), mat("#ffffff"));
  g.add(at(t, 0, 0.72, 0));
  for (let i = 0; i < 16; i++) {
    const a = (i / 15) * Math.PI;
    const x = Math.cos(a) * 0.36;
    const y = 0.72 + Math.sin(a) * 0.36;
    g.add(at(ell(0.05, 0.05, 0.05, LEAF_DARK), x, y, (r() - 0.5) * 0.05));
    if (i % 2) g.add(at(ell(0.035, 0.035, 0.035, r() < 0.5 ? "#ff6f91" : "#ffb3c7"), x + 0.02, y + 0.02, 0.04));
  }
  for (const x of [-0.36, 0.36])
    for (let i = 0; i < 4; i++) g.add(at(ell(0.045, 0.045, 0.045, LEAF), x + (r() - 0.5) * 0.05, 0.12 + i * 0.16, 0.03));
  return g;
}

export function buildDecor(kind: string, seed: number) {
  const r = rng(seed);
  switch (kind) {
    case "fence":
      return fence();
    case "path":
      return path(r);
    case "rocks":
      return rocks(r);
    case "mushrooms":
      return mushrooms(r);
    case "flowerbox":
      return flowerbox(r);
    case "can":
      return can();
    case "hedge":
      return hedge(r);
    case "lantern":
      return lantern();
    case "lamp":
      return lamp();
    case "bench":
      return bench();
    case "birdbath":
      return birdbath();
    case "pond":
      return pond(r);
    case "arch":
      return arch(r);
    default:
      return rocks(r);
  }
}

/** Free all geometries made for one object (shared unit shapes stay). */
export function disposeObject(o: THREE.Object3D) {
  const shared = new Set<THREE.BufferGeometry>([SPHERE, LOWSPHERE, CYL, CONE, TORUS, ROCK, BOX]);
  o.traverse((c) => {
    const m = c as THREE.Mesh;
    if (m.geometry && !shared.has(m.geometry) && !m.geometry.userData?.shared) m.geometry.dispose();
  });
}
