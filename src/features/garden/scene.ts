// A month's garden land in 3D, in an original cozy style: a soft grassy hill at
// the back with a stream tumbling down it, a river with sandy banks and a wooden
// bridge, puffy round trees, bushes, wild flowers and rocks, soft sunlight and
// drifting clouds. One soil bed per day of the month, with lawn on the cells left
// over. Flowers sway; the one growing right now sparkles;
// bloomed flowers with laurels to collect have a golden token bobbing over them.
// The garden sits on a little planet that curves away from where you look: a thick
// forest of puffy autumn trees all round, a river winding off to the horizon, under a
// warm autumn sky with peach clouds along the horizon and drifting leaves.
// Drag to turn, scroll to zoom, click a bed to pick it.
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { disposeObject, ell, mat, rng, TOON_RAMP } from "./models";
import { bushBall, buildGardenDecor, edgeTree, fallenLeaf, forestMesh, meadowFlowers, rock, tuft, wildflowers, type ForestSpot, type TreeKind } from "./cozy";
import { isMobile } from "../../lib/platform";
import { bake, buildFlower } from "./flowers";
import { LAND_COLS, LAND_ROWS, SPECIES } from "./catalog";

export interface Cell {
  key: string; // changes whenever the model must be rebuilt
  plot: number;
  kind: "plant" | "decor";
  species?: string;
  decor?: string;
  g?: number;
  tier?: number;
  rot?: number;
  seed: number;
  growing?: boolean;
  claim?: boolean; // bloomed, with laurels waiting
}

const T = 1; // plot size
const SIDE = 1.5; // grass between the plots and the island's sides / front
const BACK = 2.6; // deeper at the back, for the terrace
/** How high the grassy hill behind the beds rises. */
const HILL = 0.75;

/** Smooth value noise (0..1) for gentle hills. */
function hash2(i: number, j: number) {
  const v = Math.sin(i * 127.1 + j * 311.7) * 43758.5453;
  return v - Math.floor(v);
}
function vnoise(x: number, z: number) {
  const i = Math.floor(x);
  const j = Math.floor(z);
  const fx = x - i;
  const fz = z - j;
  const u = fx * fx * (3 - 2 * fx);
  const v = fz * fz * (3 - 2 * fz);
  const a = hash2(i, j);
  const b = hash2(i + 1, j);
  const c = hash2(i, j + 1);
  const d = hash2(i + 1, j + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const smooth = (a: number, b: number, v: number) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** How much the ground drops with distance (squared) from the point you look at. */
const CURVE_AMOUNT = 0.01;
const CURVE = { uCurve: { value: 0 }, uCurveCenter: { value: new THREE.Vector2() } };
/** Bends a material's vertices down with distance from the centre of view, for a round-world look. */
function curveMaterial(m: THREE.Material) {
  if (m.userData.curved) return;
  m.userData.curved = true;
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uCurve = CURVE.uCurve;
    shader.uniforms.uCurveCenter = CURVE.uCurveCenter;
    shader.vertexShader =
      "uniform float uCurve;\nuniform vec2 uCurveCenter;\n" +
      shader.vertexShader.replace(
        "#include <project_vertex>",
        `vec4 mvPosition = vec4( transformed, 1.0 );
vec4 curvedWorld = modelMatrix * mvPosition;
vec2 curveD = curvedWorld.xz - uCurveCenter;
curvedWorld.y -= dot(curveD, curveD) * uCurve;
mvPosition = viewMatrix * curvedWorld;
gl_Position = projectionMatrix * mvPosition;`,
      );
  };
  m.customProgramCacheKey = () => "curved";
  m.needsUpdate = true;
}
function curveObject(o: THREE.Object3D) {
  o.traverse((c) => {
    const m = (c as THREE.Mesh).material;
    if (m) (Array.isArray(m) ? m : [m]).forEach(curveMaterial);
  });
}
const LEAF_COLORS = ["#e8742c", "#d9502e", "#f0b43c", "#c9892c", "#b8452a"];

function canvasTex(w: number, h: number, paint: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  paint(c.getContext("2d")!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Painted-looking grass: soft blotches of light and dark green and tiny blade strokes. */
const grassTexture = () =>
  canvasTex(512, 512, (g) => {
    g.fillStyle = "#a3c95e";
    g.fillRect(0, 0, 512, 512);
    const r = rng(11);
    for (let i = 0; i < 240; i++) {
      const x = r() * 512;
      const y = r() * 512;
      const rad = 12 + r() * 48;
      const grad = g.createRadialGradient(x, y, 0, x, y, rad);
      const k = r();
      grad.addColorStop(0, k < 0.35 ? "rgba(226,200,110,0.38)" : k < 0.7 ? "rgba(190,226,128,0.34)" : "rgba(110,160,66,0.28)");
      grad.addColorStop(1, "rgba(163,201,94,0)");
      g.fillStyle = grad;
      g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    for (let i = 0; i < 1200; i++) {
      const x = r() * 512;
      const y = r() * 512;
      const k = r();
      g.strokeStyle = k < 0.4 ? "rgba(96,148,60,0.35)" : k < 0.75 ? "rgba(206,232,150,0.4)" : "rgba(222,190,108,0.4)";
      g.lineWidth = 1.3;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + (r() - 0.5) * 3, y - 4 - r() * 5);
      g.stroke();
    }
  });

/** A river seen from above: pale shallows at the edges, deep blue down the middle, streaks of light. */
const riverTexture = () =>
  canvasTex(128, 256, (g) => {
    const across = g.createLinearGradient(0, 0, 128, 0);
    across.addColorStop(0, "#bfe6dc");
    across.addColorStop(0.14, "#86cbd8");
    across.addColorStop(0.35, "#4f9fc8");
    across.addColorStop(0.5, "#3f8fbf");
    across.addColorStop(0.65, "#4f9fc8");
    across.addColorStop(0.86, "#86cbd8");
    across.addColorStop(1, "#bfe6dc");
    g.fillStyle = across;
    g.fillRect(0, 0, 128, 256);
    const r = rng(12);
    for (let i = 0; i < 70; i++) {
      const x = 14 + r() * 100;
      const mid = 1 - Math.abs(x - 64) / 64;
      g.fillStyle = `rgba(255,255,255,${0.08 + r() * 0.22 * mid})`;
      g.beginPath();
      g.ellipse(x, r() * 256, 1 + r() * 2, 6 + r() * 16, 0, 0, Math.PI * 2);
      g.fill();
    }
    // Foam lines where the water meets the banks.
    for (const x of [5, 123])
      for (let y = 0; y < 256; y += 6 + r() * 8) {
        g.fillStyle = `rgba(255,255,255,${0.35 + r() * 0.3})`;
        g.beginPath();
        g.ellipse(x + (r() - 0.5) * 4, y, 2 + r() * 2, 3 + r() * 5, 0, 0, Math.PI * 2);
        g.fill();
      }
  });

/** Sandy river banks with pebbles. */
const bankTexture = () =>
  canvasTex(128, 128, (g) => {
    g.fillStyle = "#d9c493";
    g.fillRect(0, 0, 128, 128);
    const r = rng(14);
    for (let i = 0; i < 160; i++) {
      const k = r();
      g.fillStyle = k < 0.4 ? "rgba(176,150,104,0.55)" : k < 0.75 ? "rgba(240,228,196,0.6)" : "rgba(150,140,128,0.5)";
      g.beginPath();
      g.ellipse(r() * 128, r() * 128, 1 + r() * 3, 1 + r() * 2.2, r() * 3, 0, Math.PI * 2);
      g.fill();
    }
  });

interface RiverPoint {
  /** Height of the water here, when it isn't the ribbon's own level (down a slope). */
  y?: number;
  x: number;
  z: number;
  w: number;
  nx: number;
  nz: number;
  d: number;
}

/** A flat strip along the river path, `extra` wider than the water, u across and v along. */
function ribbon(pts: RiverPoint[], extra: number, y: number, across: number, tile: number) {
  const pos: number[] = [];
  const uv: number[] = [];
  const nor: number[] = [];
  const idx: number[] = [];
  const cols = across + 1;
  pts.forEach((p, i) => {
    const w = p.w + extra;
    for (let j = 0; j <= across; j++) {
      const sd = j / across - 0.5;
      // A gentle wobble on the outer edges so the banks don't look ruled.
      const wob = extra > 0 && (j === 0 || j === across) ? Math.sin(p.d * 2.3 + j * 1.7) * 0.07 + Math.sin(p.d * 5.1 + j) * 0.035 : 0;
      const o = sd * w + Math.sign(sd) * wob;
      pos.push(p.x + p.nx * o, p.y ?? y, p.z + p.nz * o);
      uv.push(j / across, p.d / tile);
      nor.push(0, 1, 0);
    }
    if (i > 0)
      for (let j = 0; j < across; j++) {
        const a = (i - 1) * cols + j;
        const b = a + 1;
        const c = a + cols;
        const d = c + 1;
        idx.push(a, b, c, b, d, c);
      }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

/**
 * A flat disc with a wobbly edge (a pond or its bank), divided into rings so it bends
 * with the round world, shaded from `inner` in the middle to `outer` at the edge.
 */
function blobDisc(edge: (a: number) => number, inner = "#ffffff", outer = "#ffffff", rings = 10, segs = 56) {
  const ci = new THREE.Color(inner);
  const co = new THREE.Color(outer);
  const pos = [0, 0, 0];
  const nor = [0, 1, 0];
  const col = [ci.r, ci.g, ci.b];
  const uv = [0, 0];
  for (let k = 1; k <= rings; k++) {
    const f = k / rings;
    const c = ci.clone().lerp(co, f * f);
    for (let i = 0; i < segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      const rr = edge(a) * f;
      const x = Math.cos(a) * rr;
      const z = Math.sin(a) * rr;
      pos.push(x, 0, z);
      nor.push(0, 1, 0);
      col.push(c.r, c.g, c.b);
      uv.push(x / 1.6, z / 1.6);
    }
  }
  const idx: number[] = [];
  for (let i = 0; i < segs; i++) idx.push(0, 1 + ((i + 1) % segs), 1 + i);
  for (let k = 1; k < rings; k++)
    for (let i = 0; i < segs; i++) {
      const i0 = 1 + (k - 1) * segs + i;
      const i1 = 1 + (k - 1) * segs + ((i + 1) % segs);
      const o0 = i0 + segs;
      const o1 = i1 + segs;
      idx.push(i0, i1, o0, i1, o1, o0);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

/** Moving water: soft light streaks that scroll along. */
const waterTexture = () =>
  canvasTex(128, 256, (g) => {
    g.fillStyle = "#6fc6e6";
    g.fillRect(0, 0, 128, 256);
    const r = rng(9);
    for (let i = 0; i < 26; i++) {
      g.fillStyle = `rgba(255,255,255,${0.18 + r() * 0.25})`;
      g.beginPath();
      g.ellipse(r() * 128, r() * 256, 4 + r() * 10, 1.2 + r() * 1.5, 0, 0, Math.PI * 2);
      g.fill();
    }
  });

function cloud(r: () => number) {
  const g = new THREE.Group();
  const top = mat("#ffffff", { emissive: "#fff6ee", ei: 0.6 });
  const under = mat("#ffe9dc", { emissive: "#ffdcc6", ei: 0.4 });
  (top as THREE.MeshToonMaterial).fog = (under as THREE.MeshToonMaterial).fog = false;
  const n = 5 + Math.floor(r() * 4);
  for (let i = 0; i < n; i++) {
    const s = 0.7 + r() * 0.9;
    const b = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 12), i % 3 === 2 ? under : top);
    b.scale.set(s * 1.35, s * 0.8, s);
    b.position.set((i - n / 2) * 0.8 + r() * 0.3, r() * 0.5 - (i % 3 === 2 ? 0.25 : 0), r() * 0.7);
    g.add(b);
  }
  return g;
}

/**
 * Bumped whenever the picture renderer has run. Some phone graphics drivers let its
 * drawing area leak into the garden's renderer, so the garden resets its GL state then.
 */
let thumbsEpoch = 0;

export class GardenScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private island = new THREE.Group();
  private plotsGroup = new THREE.Group();
  private objects = new Map<number, { key: string; obj: THREE.Object3D; cell: Cell }>();
  private pickers: THREE.Mesh[] = [];
  private hoverRing: THREE.Mesh;
  private selectRing: THREE.Mesh;
  private sparkles: THREE.Mesh[] = [];
  private petals: { m: THREE.Mesh; vx: number; vz: number; spin: number; life: number }[] = [];
  private bounds = { w: 10, d: 10, cz: 0 };
  private clouds: THREE.Group[] = [];
  private sways: THREE.Object3D[] = [];
  private raf = 0;
  private epoch = thumbsEpoch;
  private clock = new THREE.Clock();
  private ro: ResizeObserver;
  private cols = LAND_COLS;
  private rows = LAND_ROWS;
  private beds = 30;
  private tokens = new Map<number, THREE.Group>();
  private selected: number | null = null;
  private hovered: number | null = null;
  private down: { x: number; y: number } | null = null;
  private ray = new THREE.Raycaster();
  private alive = true;
  private grassTex = grassTexture();
  private streamTex = waterTexture();
  private fallTex = waterTexture();
  private riverTex = riverTexture();
  private bankTex = bankTexture();
  readonly ready = Promise.resolve();

  constructor(
    private host: HTMLElement,
    private onPick: (plot: number | null) => void,
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.04;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.display = "block";
    this.renderer.domElement.style.outline = "none";

    this.camera = new THREE.PerspectiveCamera(30, 1, 0.1, 200);
    this.camera.position.set(5.4, 7.2, 8.4);
    this.scene.fog = new THREE.Fog("#f0d9c2", 22, 62);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.enablePan = false;
    this.controls.minPolarAngle = 0.45;
    this.controls.maxPolarAngle = 1.2;
    this.controls.target.set(0, 0.2, -0.4);

    // Warm sun with soft shadows, a sky/grass bounce and a cool fill.
    this.scene.add(new THREE.HemisphereLight("#ffe8d0", "#b9a86a", 1.05));
    const sun = new THREE.DirectionalLight("#ffd6a0", 2.75);
    sun.position.set(8, 8, 5);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.radius = 5;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.03;
    const sc = sun.shadow.camera as THREE.OrthographicCamera;
    sc.left = -10;
    sc.right = 10;
    sc.top = 10;
    sc.bottom = -10;
    this.scene.add(sun);
    const fill = new THREE.DirectionalLight("#d8ccff", 0.4);
    fill.position.set(-6, 4, -4);
    this.scene.add(fill);

    this.scene.add(this.island);
    this.scene.add(this.plotsGroup);

    const ringGeo = roundedRing(0.94, 0.07);
    this.hoverRing = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.85, depthWrite: false }));
    this.selectRing = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: "#ffd84d", transparent: true, opacity: 0.95, depthWrite: false }));
    for (const r of [this.hoverRing, this.selectRing]) {
      r.rotation.x = -Math.PI / 2;
      r.visible = false;
      curveMaterial(r.material as THREE.Material);
      r.renderOrder = 2;
      this.scene.add(r);
    }
    for (let i = 0; i < 16; i++) {
      const s = ell(0.025, 0.025, 0.025, "#fff6b0", { emissive: "#ffe680", ei: 2 }, true);
      s.castShadow = false;
      s.visible = false;
      s.userData = { phase: i / 16 };
      this.sparkles.push(s);
      this.scene.add(s);
    }
    const cr = rng(3);
    for (let i = 0; i < 22; i++) {
      const c = cloud(cr);
      const a = (i / 22) * Math.PI * 2 + cr() * 0.25;
      const rad = 44 + cr() * 12;
      c.userData.a = a;
      c.userData.rad = rad;
      // The ground drops away fast, so the sky you see is well below the camera:
      // these heights sit them between the far treetops and the top of the view.
      c.position.set(Math.cos(a) * rad, -10 + cr() * 3.5, Math.sin(a) * rad);
      c.scale.setScalar(0.6 + cr() * 0.45);
      c.lookAt(0, c.position.y, 0);
      c.userData.speed = 0.15 + cr() * 0.15;
      this.clouds.push(c);
      this.scene.add(c);
    }

    const el = this.renderer.domElement;
    el.addEventListener("pointerdown", this.onDown);
    el.addEventListener("pointerup", this.onUp);
    el.addEventListener("pointermove", this.onMove);
    el.addEventListener("pointerleave", this.onLeave);
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    this.resize();
    document.addEventListener("visibilitychange", this.onVis);
    this.buildIsland();
    this.loop();
  }

  /* ------------------------------------------------------------ Layout */
  /** How many of the land's cells are flower beds (one per day of the month). */
  setBeds(beds: number) {
    if (beds === this.beds) return;
    this.beds = beds;
    this.buildIsland();
  }

  private plotPos(plot: number) {
    const c = plot % this.cols;
    const r = Math.floor(plot / this.cols);
    return new THREE.Vector3((c - (this.cols - 1) / 2) * T, 0.12, (r - (this.rows - 1) / 2) * T);
  }

  private buildIsland() {
    for (const g of [this.island, this.plotsGroup]) {
      g.traverse((c) => {
        const m = c as THREE.Mesh;
        if (m.isMesh && m.geometry && !m.geometry.userData?.shared) m.geometry.dispose();
      });
      g.clear();
    }
    this.pickers = [];
    this.sways = [];
    const halfW = (this.cols * T) / 2;
    const halfD = (this.rows * T) / 2;
    const W = this.cols * T + SIDE * 2;
    const front = halfD + SIDE;
    const back = -halfD - BACK;
    const D = front - back;
    const cz = (front + back) / 2;
    const r = rng(7 + this.rows);
    const toon = (opts: THREE.MeshToonMaterialParameters) => new THREE.MeshToonMaterial({ gradientMap: TOON_RAMP, ...opts });
    const add = (o: THREE.Object3D, x: number, y: number, z: number, sway = false) => {
      o.position.set(x, y + heightAt(x, z), z);
      o.rotation.y = r() * Math.PI * 2;
      this.island.add(o);
      if (sway) {
        o.userData.seed = r() * 10;
        this.sways.push(o);
      }
      return o;
    };

    // ---- The land: one continuous grassy world. Flat where the garden is, a soft hill behind
    // the beds, gentle rolling hills further out, and hollows where the river and ponds lie.
    const lite = isMobile;
    const sx = -halfW - SIDE / 2 - 0.05;
    const tD = BACK - 0.6;
    const tz = back + tD / 2 + 0.05;
    const poolZ = tz + tD / 2 + 0.25;
    const boxDist = (x: number, z: number) => Math.hypot(Math.max(0, Math.abs(x) - W / 2), Math.max(0, back - z, z - front));

    // The river: from a stream tumbling off the hill, down the left side, across the meadow in
    // front and away through the forest to the horizon, widening as it goes.
    const path = new THREE.CatmullRomCurve3(
      [
        [sx, poolZ],
        [sx, front - 1.2],
        [sx + 0.4, front + 0.6],
        [sx + 2.3, front + 1.4],
        [sx + 4.8, front + 1.75],
        [sx + 7.4, front + 1.35],
        [W / 2 + 1.7, front + 0.8],
        [W / 2 + 3.8, front - 0.8],
        [W / 2 + 5.6, front - 3.8],
        [W / 2 + 7.2, front - 7.4],
        [W / 2 + 9.9, front - 10.6],
        [W / 2 + 12, front - 14.6],
        [W / 2 + 15.5, front - 18.8],
        [W / 2 + 18, front - 24.5],
        [W / 2 + 22, front - 30],
      ].map(([x, z]) => new THREE.Vector3(x, 0, z)),
      false,
      "centripetal",
    );
    const riverLen = path.getLength();
    const straight = front - 1 - poolZ;
    const river: RiverPoint[] = [];
    const steps = Math.ceil(riverLen / 0.25);
    for (let i = 0; i <= steps; i++) {
      const u = i / steps;
      const p = path.getPointAt(u);
      const tg = path.getTangentAt(u);
      const d = u * riverLen;
      river.push({ x: p.x, z: p.z, w: Math.min(2.1, 0.62 + Math.max(0, d - straight) * 0.055), nx: -tg.z, nz: tg.x, d });
    }
    const rGrid = new Map<number, RiverPoint[]>();
    const cellKey = (gx: number, gz: number) => (gx + 500) * 1000 + gz + 500;
    for (const p of river) {
      const k = cellKey(Math.floor(p.x / 2), Math.floor(p.z / 2));
      const list = rGrid.get(k) ?? [];
      list.push(p);
      rGrid.set(k, list);
    }
    /** How far a spot is from the river's edge (looked up nearby only). */
    const riverGap = (x: number, z: number) => {
      let best = 9;
      const gx = Math.floor(x / 2);
      const gz = Math.floor(z / 2);
      for (let i = -2; i <= 2; i++)
        for (let j = -2; j <= 2; j++)
          for (const p of rGrid.get(cellKey(gx + i, gz + j)) ?? []) {
            const d = Math.hypot(x - p.x, z - p.z) - p.w / 2;
            if (d < best) best = d;
          }
      return best;
    };

    // Ponds dotted through the forest.
    const ponds = [
      { x: -8.6, z: cz - 0.9, r: 2.0 },
      { x: -12.5, z: cz - 7.5, r: 2.3 },
      { x: -12, z: cz + 6, r: 1.7 },
      { x: 2.5, z: back - 7.5, r: 2.6 },
      { x: 17, z: cz + 4.5, r: 2.0 },
      ...(lite ? [] : [
        { x: -19, z: cz - 1, r: 2.8 },
        { x: 8, z: back - 14, r: 2.2 },
      ]),
    ].map((p, i) => ({ ...p, seed: i * 1.7 + 0.4 }));
    const pondEdge = (p: { r: number; seed: number }, a: number) => p.r * (1 + Math.sin(a * 3 + p.seed) * 0.12 + Math.sin(a * 5 + p.seed * 2) * 0.06);
    const pondGap = (x: number, z: number) => {
      let best = 9;
      for (const p of ponds) {
        const d = Math.hypot(x - p.x, z - p.z) - pondEdge(p, Math.atan2(z - p.z, x - p.x));
        if (d < best) best = d;
      }
      return best;
    };

    // The hill behind the beds: a wavy foot, a rounded top with a few bumps, fading out at the sides.
    const hillFoot = (x: number) => -halfD - 0.55 + Math.sin(x * 0.8 + 0.5) * 0.18 + Math.sin(x * 1.9) * 0.08;
    const heightAt = (x: number, z: number) => {
      const e = hillFoot(x);
      const hill = HILL * smooth(e, e - 1.3, z) * smooth(back - 4.4, back - 2, z) * smooth(W / 2 + 3.5, W / 2 - 0.4, Math.abs(x)) * (0.85 + vnoise(x * 0.9, z * 0.9) * 0.3);
      const rolling = (vnoise(x * 0.15 + 3, z * 0.15 + 9) * 1.5 + vnoise(x * 0.5 + 7, z * 0.5 + 3) * 0.35) * smooth(1.2, 6.5, boxDist(x, z));
      return Math.max(hill, rolling) * smooth(0.5, 2, riverGap(x, z)) * smooth(0.5, 1.8, pondGap(x, z));
    };

    // The ground itself, finely divided so the hills are smooth and it curves to the horizon.
    const SIZE = lite ? 70 : 90;
    const SEG = lite ? 220 : 320;
    const groundGeo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
    groundGeo.rotateX(-Math.PI / 2);
    const gp = groundGeo.attributes.position;
    const tint = new Float32Array(gp.count * 3);
    for (let i = 0; i < gp.count; i++) {
      const x = gp.getX(i);
      const z = gp.getZ(i) + cz;
      const h = heightAt(x, z);
      gp.setY(i, h);
      // Sunny, drier grass on the hilltops; lusher by the water.
      const t = Math.min(1, h / 1.2);
      const wet = 1 - smooth(0.3, 1.6, Math.min(riverGap(x, z), pondGap(x, z)));
      tint[i * 3] = 1 + t * 0.05 - wet * 0.1;
      tint[i * 3 + 1] = 1 + t * 0.02 - wet * 0.03;
      tint[i * 3 + 2] = 1 - t * 0.14 - wet * 0.12;
    }
    groundGeo.setAttribute("color", new THREE.BufferAttribute(tint, 3));
    groundGeo.computeVertexNormals();
    const groundTex = this.grassTex.clone();
    groundTex.needsUpdate = true;
    groundTex.repeat.set(SIZE / 1.6, SIZE / 1.6);
    const ground = new THREE.Mesh(groundGeo, toon({ map: groundTex, vertexColors: true }));
    ground.position.set(0, 0.07, cz);
    ground.receiveShadow = true;
    this.island.add(ground);

    const water = new THREE.Mesh(
      ribbon(river, 0, 0.1, 6, 2.5),
      new THREE.MeshStandardMaterial({ map: this.riverTex, roughness: 0.16, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    );
    water.receiveShadow = true;
    this.island.add(water);
    const banks = new THREE.Mesh(ribbon(river, 0.6, 0.09, 4, 1.6), toon({ map: this.bankTex, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
    banks.receiveShadow = true;
    this.island.add(banks);
    // Pebbles, reeds and flowers along the banks; the odd boulder and lily pads out in the water.
    for (let i = 2; i < river.length; i += 2) {
      const p = river[i];
      if (Math.hypot(p.x, p.z - cz) > 20) break;
      const inLand = Math.abs(p.x) < W / 2 && p.z < front && p.z > back;
      for (const side of [-1, 1]) {
        const off = (p.w / 2 + 0.22 + r() * 0.18) * side;
        const x = p.x + p.nx * off;
        const z = p.z + p.nz * off;
        const roll = r();
        if (roll < 0.25) add(rock(r, (inLand ? 0.05 : 0.07) + r() * (inLand ? 0.05 : 0.1), "#c9c3b8"), x, 0.07, z);
        else if (!inLand && roll < 0.55) add(tuft(r, 0.18 + r() * 0.12), x, 0.07, z, true);
        else if (!inLand && roll < 0.65) add(wildflowers(r), x, 0.07, z, true);
      }
      if (p.w > 1 && r() < 0.1) add(rock(r, 0.12 + r() * 0.1, "#bdb6aa"), p.x + p.nx * (r() - 0.5) * p.w * 0.5, 0.03, p.z + p.nz * (r() - 0.5) * p.w * 0.5);
      if (p.w > 1.1 && r() < 0.14) {
        const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.02, 18, 1, false, 0.4, Math.PI * 1.85), mat("#5cb85c"));
        const o = (r() < 0.5 ? -1 : 1) * p.w * (0.28 + r() * 0.12);
        pad.position.set(p.x + p.nx * o, 0.115, p.z + p.nz * o);
        pad.rotation.y = r() * 6;
        this.island.add(pad);
      }
    }

    // A little stream tumbles down the hill into the river, from a spring among rocks at the top.
    const casc = new THREE.CatmullRomCurve3(
      [
        [sx + 0.5, back - 1.4],
        [sx + 0.15, back - 0.3],
        [sx - 0.05, tz + 0.25],
        [sx, poolZ],
      ].map(([x, z]) => new THREE.Vector3(x, 0, z)),
    );
    const cLen = casc.getLength();
    const cPts: RiverPoint[] = [];
    for (let i = 0; i <= 48; i++) {
      const u = i / 48;
      const p = casc.getPointAt(u);
      const tg = casc.getTangentAt(u);
      const w = 0.4 + u * 0.22;
      const nx = -tg.z;
      const nz = tg.x;
      // Sit on the highest of the middle and both edges so the grass never pokes through.
      const y = Math.max(heightAt(p.x, p.z), heightAt(p.x + nx * w * 0.5, p.z + nz * w * 0.5), heightAt(p.x - nx * w * 0.5, p.z - nz * w * 0.5)) + 0.1;
      cPts.push({ x: p.x, z: p.z, w, nx, nz, d: u * cLen, y });
    }
    const stream = new THREE.Mesh(ribbon(cPts, 0, 0.1, 4, 1.6), water.material);
    this.island.add(stream);
    for (let i = 2; i < cPts.length; i += 3) {
      const p = cPts[i];
      for (const side of [-1, 1]) {
        const off = (p.w / 2 + 0.06 + r() * 0.08) * side;
        if (r() < 0.7) add(rock(r, 0.06 + r() * 0.07, "#c9c3b8"), p.x + p.nx * off, 0.05, p.z + p.nz * off);
        else add(tuft(r, 0.16), p.x + p.nx * (off + 0.1 * side), 0.07, p.z + p.nz * (off + 0.1 * side), true);
      }
    }
    for (let i = 0; i < 5; i++) add(rock(r, 0.1 + r() * 0.08, "#bdb6aa"), cPts[0].x + (r() - 0.5) * 0.7, 0.05, cPts[0].z - 0.15 + (r() - 0.5) * 0.4);
    // Foam where the stream meets the river.
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const foam = ell(0.09 + r() * 0.05, 0.02, 0.07, "#ffffff", { emissive: "#ffffff", ei: 0.3 }, true);
      foam.castShadow = false;
      foam.position.set(sx + Math.cos(a) * 0.26, 0.11, poolZ + 0.1 + Math.sin(a) * 0.2);
      this.island.add(foam);
    }

    // The ponds: deep blue in the middle, pale at the edges, with sandy shores, lily pads and reeds.
    const pondMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.12, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const shoreMat = toon({ map: this.bankTex, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
    for (const p of ponds) {
      const shore = new THREE.Mesh(blobDisc((a) => pondEdge(p, a) + 0.45), shoreMat);
      shore.position.set(p.x, 0.09, p.z);
      shore.receiveShadow = true;
      this.island.add(shore);
      const pool = new THREE.Mesh(blobDisc((a) => pondEdge(p, a), "#3d89bb", "#a6dde2"), pondMat);
      pool.position.set(p.x, 0.1, p.z);
      pool.receiveShadow = true;
      this.island.add(pool);
      for (let i = 0; i < 4; i++) {
        const a = r() * Math.PI * 2;
        const rr = pondEdge(p, a) * (0.45 + r() * 0.35);
        const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.02, 18, 1, false, 0.4, Math.PI * 1.85), mat("#5cb85c"));
        pad.position.set(p.x + Math.cos(a) * rr, 0.115, p.z + Math.sin(a) * rr);
        pad.rotation.y = r() * 6;
        this.island.add(pad);
      }
      for (let i = 0; i < 14; i++) {
        const a = r() * Math.PI * 2;
        const rr = pondEdge(p, a) + 0.3 + r() * 0.35;
        const x = p.x + Math.cos(a) * rr;
        const z = p.z + Math.sin(a) * rr;
        if (r() < 0.4) add(rock(r, 0.07 + r() * 0.09, "#c9c3b8"), x, 0.07, z);
        else add(tuft(r, 0.2 + r() * 0.14), x, 0.07, z, true);
      }
    }

    // A small wooden bridge across the stream.
    const bridge = new THREE.Group();
    const wood = toon({ color: "#c49a6c" });
    const woodDark = toon({ color: "#9c7247" });
    for (let i = 0; i < 9; i++) {
      const t = i / 8;
      const plank = new THREE.Mesh(new RoundedBoxGeometry(0.11, 0.035, 0.42, 2, 0.012), wood);
      plank.position.set(-0.45 + t * 0.9, 0.12 + Math.sin(t * Math.PI) * 0.12, 0);
      plank.rotation.z = Math.cos(t * Math.PI) * 0.35;
      plank.castShadow = true;
      bridge.add(plank);
    }
    for (const zz of [-0.22, 0.22]) {
      for (const xx of [-0.4, 0, 0.4]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.22, 8), woodDark);
        post.position.set(xx, 0.2 + (xx === 0 ? 0.11 : 0.03), zz);
        post.castShadow = true;
        bridge.add(post);
      }
      const rail = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.016, 6, 20, Math.PI), woodDark);
      rail.position.set(0, 0.08, zz);
      rail.scale.set(1, 0.55, 1);
      bridge.add(rail);
    }
    bridge.position.set(sx, 0.02, 0.2);
    this.island.add(bridge);

    // Flower beds: soft mounds of dark soil with a rounded edge; the rest is lawn.
    const bedGeo = new RoundedBoxGeometry(T * 0.86, 0.07, T * 0.86, 4, 0.035);
    const rimGeo = new RoundedBoxGeometry(T * 0.92, 0.05, T * 0.92, 4, 0.025);
    const bedMat = toon({ color: "#8a5a3c" });
    const rimMat = toon({ color: "#a9764f" });
    const pickGeo = new THREE.PlaneGeometry(T, T);
    for (let i = 0; i < this.cols * this.rows; i++) {
      const p = this.plotPos(i);
      const bed = i < this.beds;
      if (bed) {
        const rim = new THREE.Mesh(rimGeo, rimMat);
        rim.position.set(p.x, 0.06, p.z);
        rim.receiveShadow = true;
        this.plotsGroup.add(rim);
      }
      if (bed) {
        const tile = new THREE.Mesh(bedGeo, bedMat);
        tile.position.set(p.x, 0.075, p.z);
        tile.receiveShadow = true;
        this.plotsGroup.add(tile);
      }
      const pick = new THREE.Mesh(pickGeo, new THREE.MeshBasicMaterial({ visible: false }));
      pick.rotation.x = -Math.PI / 2;
      pick.position.set(p.x, 0.11, p.z);
      pick.userData.plot = i;
      this.pickers.push(pick);
      this.plotsGroup.add(pick);
    }

    // Trees and bushes along the top of the hill, wild flowers down its slope.
    const kinds: TreeKind[] = ["autumn", "golden", "round", "autumn", "fruit", "golden", "autumn", "round"];
    for (let x = -W / 2 + 0.4; x <= W / 2 - 0.3; x += 0.8 + r() * 0.35) {
      if (Math.abs(x - sx) < 0.7) continue;
      const z = back + 0.35 + (r() - 0.5) * 0.6;
      if (r() < 0.25) add(bushBall(r, 0.2 + r() * 0.08, r() < 0.5), x, 0.07, z, true);
      else add(edgeTree(r, kinds[Math.floor(r() * kinds.length)], 1.25 + r() * 0.5), x, 0.07, z, true);
    }
    for (let x = -W / 2 + 0.5; x <= W / 2 - 0.3; x += 0.4 + r() * 0.3) {
      if (Math.abs(x - sx) < 0.5) continue;
      add(r() < 0.5 ? meadowFlowers(r) : tuft(r), x, 0.07, hillFoot(x) - 0.35 - r() * 0.9, true);
    }
    // Round trees down the right-hand side and on the front corners frame the view.
    for (let z = -halfD + 0.3; z < halfD - 0.6; z += 1.5 + r() * 0.6) add(edgeTree(r, kinds[Math.floor(r() * kinds.length)], 1.15 + r() * 0.35), W / 2 - 0.5, 0.07, z, true);
    add(edgeTree(r, "fruit", 1.3), W / 2 - 0.45, 0.07, front - 0.45, true);
    add(bushBall(r, 0.22, true), W / 2 - 0.95, 0.07, front - 0.35, true);
    add(edgeTree(r, "round", 1.2), -halfW - 0.1, 0.07, front - 0.4, true);

    // Grass, wild flowers, pebbles and fallen leaves all over the land, thickest near the garden.
    // Those close by sway; the rest are merged into a few meshes so it stays quick.
    const inBeds = (x: number, z: number) => Math.abs(x) < halfW + 0.1 && z > -halfD - 0.1 && z < halfD + 0.1;
    const wet = (x: number, z: number) => riverGap(x, z) < 0.3 || pondGap(x, z) < 0.3 || (Math.abs(x - sx) < 0.45 && z < poolZ && z > back - 2);
    const loose = new THREE.Group();
    const lay = (o: THREE.Object3D, x: number, y: number, z: number) => {
      o.position.set(x, y + heightAt(x, z), z);
      if (!o.userData.flat) o.rotation.y = r() * Math.PI * 2;
      loose.add(o);
    };
    const scatter = lite ? 320 : 850;
    for (let k = 0, n = 0; n < scatter && k < scatter * 8; k++) {
      const a = r() * Math.PI * 2;
      const d = Math.pow(r(), 0.85) * 24;
      const x = Math.cos(a) * d;
      const z = cz + Math.sin(a) * d;
      if (inBeds(x, z) || wet(x, z)) continue;
      n++;
      const roll = r();
      if (boxDist(x, z) < 2.2) {
        if (roll < 0.45) add(tuft(r, 0.12 + r() * 0.08), x, 0.07, z, true);
        else if (roll < 0.6) add(wildflowers(r), x, 0.07, z, true);
        else if (roll < 0.85) add(meadowFlowers(r), x, 0.07, z, true);
        else add(rock(r, 0.05 + r() * 0.05), x, 0.07, z);
      } else if (roll < 0.55) lay(tuft(r, 0.13 + r() * 0.1), x, 0.07, z);
      else if (roll < 0.86) lay(meadowFlowers(r), x, 0.07, z);
      else lay(rock(r, 0.05 + r() * 0.07), x, 0.07, z);
    }
    for (let k = 0, n = 0; n < (lite ? 260 : 700) && k < 8000; k++) {
      const a = r() * Math.PI * 2;
      const d = Math.pow(r(), 0.9) * 22;
      const x = Math.cos(a) * d;
      const z = cz + Math.sin(a) * d;
      if (inBeds(x, z) || wet(x, z)) continue;
      n++;
      const leaf = fallenLeaf(r, LEAF_COLORS[Math.floor(r() * LEAF_COLORS.length)]);
      leaf.userData.flat = true;
      lay(leaf, x, 0.078, z);
    }
    const looseBaked = bake(loose);
    looseBaked.traverse((c) => {
      c.castShadow = false;
    });
    loose.traverse((c) => {
      const m = c as THREE.Mesh;
      if (m.isMesh && !m.geometry.userData?.shared) m.geometry.dispose();
    });
    this.island.add(looseBaked);
    this.bounds = { w: W, d: D, cz };

    // A thick forest of puffy trees all round the planet, out to the horizon, with a little meadow
    // in front of the garden. The trees by the garden are full models with shadows; further out
    // they're simpler, and past that they're merged into a couple of meshes so it stays quick.
    const fr = rng(31 + this.rows);
    const forestKinds: TreeKind[] = ["autumn", "golden", "round", "autumn", "fruit", "golden", "round", "blossom", "autumn", "round"];
    const RADIUS = lite ? 26 : 32;
    const meadow = (x: number, z: number) => z > front && z < front + 3.2 && x > sx + 1.2 && x < W / 2 + 2.5;
    const clearOf = (x: number, z: number) => boxDist(x, z) > 0.6 && !meadow(x, z) && riverGap(x, z) > 0.55 && pondGap(x, z) > 0.6;
    const grid = new Map<number, [number, number][]>();
    const key = (gx: number, gz: number) => (gx + 500) * 1000 + gz + 500;
    const spacing = (d: number) => (0.95 + Math.max(0, d - 10) * 0.03) * (lite ? 1.25 : 1);
    const nearTrees = new THREE.Group();
    const spots: ForestSpot[] = [];
    for (let k = 0; k < (lite ? 9000 : 18000); k++) {
      const a = fr() * Math.PI * 2;
      const d = Math.sqrt(fr()) * RADIUS;
      const x = Math.cos(a) * d;
      const z = cz + Math.sin(a) * d;
      if (!clearOf(x, z)) continue;
      const sp = spacing(d);
      const gx = Math.floor(x);
      const gz = Math.floor(z);
      let ok = true;
      for (let i = -2; i <= 2 && ok; i++)
        for (let j = -2; j <= 2 && ok; j++)
          for (const [px, pz] of grid.get(key(gx + i, gz + j)) ?? [])
            if ((px - x) ** 2 + (pz - z) ** 2 < sp * sp) {
              ok = false;
              break;
            }
      if (!ok) continue;
      const cell = grid.get(key(gx, gz)) ?? [];
      cell.push([x, z]);
      grid.set(key(gx, gz), cell);
      const kind = forestKinds[Math.floor(fr() * forestKinds.length)];
      const h = (1.1 + fr() * 1.0) * (1 + Math.max(0, d - 12) * 0.025);
      const bush = fr() < 0.12;
      const near = boxDist(x, z);
      if (near < 5) {
        if (bush) add(bushBall(fr, 0.18 + fr() * 0.1, fr() < 0.4), x, 0.07, z, true);
        else {
          const tree = edgeTree(fr, kind, h, lite || near > 1.6);
          tree.position.set(x, 0.07 + heightAt(x, z), z);
          tree.rotation.y = fr() * Math.PI * 2;
          nearTrees.add(tree);
        }
      } else spots.push({ x, y: 0.07 + heightAt(x, z), z, h: bush ? 0.55 + fr() * 0.3 : h, kind: bush && fr() < 0.6 ? "round" : kind, lo: d > 19, bush });
    }
    const nearBaked = bake(nearTrees);
    nearTrees.traverse((c) => {
      const m = c as THREE.Mesh;
      if (m.isMesh && !m.geometry.userData?.shared) m.geometry.dispose();
    });
    this.island.add(nearBaked);
    this.island.add(forestMesh(spots, fr));

    curveObject(this.island);
    curveObject(this.plotsGroup);
    const span = Math.max(this.cols, this.rows * 1.4);
    this.controls.maxDistance = 12 + span * 2.2;
    this.controls.minDistance = 4;
    this.baseDist = 6 + span * 1.45;
    this.frame();
  }

  /* ------------------------------------------------------------ Contents */
  setCells(cells: Cell[]) {
    const seen = new Set<number>();
    for (const cell of cells) {
      seen.add(cell.plot);
      const cur = this.objects.get(cell.plot);
      if (cur && cur.key === cell.key) {
        cur.cell = cell;
        continue;
      }
      if (cur) this.remove(cell.plot);
      const obj = cell.kind === "plant" ? buildFlower(cell.species!, cell.g ?? 0, cell.tier ?? 2, cell.seed) : buildGardenDecor(cell.decor!, cell.seed);
      obj.position.copy(this.plotPos(cell.plot));
      obj.rotation.y = ((cell.rot ?? 0) * Math.PI) / 2 + (cell.kind === "plant" ? (cell.seed % 7) * 0.4 : 0);
      obj.userData.seed = cell.seed;
      curveObject(obj);
      this.scene.add(obj);
      this.objects.set(cell.plot, { key: cell.key, obj, cell });
      obj.scale.setScalar(0.6);
      obj.userData.pop = 0;
    }
    for (const plot of [...this.objects.keys()]) if (!seen.has(plot)) this.remove(plot);
    // Golden tokens over bloomed flowers with laurels to collect.
    const claims = new Set(cells.filter((c) => c.claim).map((c) => c.plot));
    for (const [plot, t] of this.tokens)
      if (!claims.has(plot)) {
        this.scene.remove(t);
        this.tokens.delete(plot);
      }
    for (const plot of claims)
      if (!this.tokens.has(plot)) {
        const t = token();
        const p = this.plotPos(plot);
        t.position.set(p.x, 0.95, p.z);
        t.userData.phase = plot * 0.7;
        this.scene.add(t);
        this.tokens.set(plot, t);
      }
  }

  private remove(plot: number) {
    const o = this.objects.get(plot);
    if (!o) return;
    this.scene.remove(o.obj);
    disposeObject(o.obj);
    this.objects.delete(plot);
  }

  setSelected(plot: number | null) {
    this.selected = plot;
  }

  /* ------------------------------------------------------------ Input */
  private pickAt(e: PointerEvent) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const p = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.ray.setFromCamera(p, this.camera);
    const hit = this.ray.intersectObjects(this.pickers, false)[0];
    return hit ? (hit.object.userData.plot as number) : null;
  }
  private onDown = (e: PointerEvent) => {
    this.down = { x: e.clientX, y: e.clientY };
  };
  private onUp = (e: PointerEvent) => {
    if (!this.down) return;
    const moved = Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y);
    this.down = null;
    if (moved < 5) this.onPick(this.pickAt(e));
  };
  private onMove = (e: PointerEvent) => {
    this.hovered = this.pickAt(e);
    this.renderer.domElement.style.cursor = this.hovered != null ? "pointer" : "grab";
  };
  private onLeave = () => {
    this.hovered = null;
  };
  private onVis = () => {
    if (document.hidden) cancelAnimationFrame(this.raf);
    else if (this.alive) {
      this.clock.getDelta();
      this.loop();
    }
  };

  private resize() {
    const w = this.host.clientWidth || 1;
    const h = this.host.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = `${w}px`;
    this.renderer.domElement.style.height = `${h}px`;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.frame();
  }

  /** Puts the camera back far enough to see the whole land; tall (phone) views need more room. */
  private baseDist = 0;
  private frame() {
    if (!this.baseDist) return;
    const tall = Math.max(1, Math.pow(1.25 / Math.max(0.3, this.camera.aspect), 0.75));
    const dist = this.baseDist * tall;
    const dir = new THREE.Vector3(5.4, 5.0, 8.4).normalize();
    this.camera.position.copy(this.controls.target).addScaledVector(dir, dist);
    this.controls.maxDistance = Math.max(this.controls.maxDistance, dist * 1.3);
  }

  /* ------------------------------------------------------------ Frame */
  private loop = () => {
    if (!this.alive) return;
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(0.05, this.clock.getDelta());
    const t = this.clock.elapsedTime;
    this.controls.update();
    if (this.epoch !== thumbsEpoch) {
      this.epoch = thumbsEpoch;
      this.renderer.resetState();
      this.resize();
    }

    CURVE.uCurve.value = CURVE_AMOUNT;
    CURVE.uCurveCenter.value.set(this.controls.target.x, this.controls.target.z);
    if (this.petals.length < 60 && Math.random() < dt * 3.5) {
      const b = this.bounds;
      const m = ell(0.04, 0.007, 0.026, LEAF_COLORS[Math.floor(Math.random() * LEAF_COLORS.length)], undefined, true);
      m.castShadow = false;
      m.position.set((Math.random() - 0.6) * b.w, 2.4 + Math.random() * 1.4, b.cz + (Math.random() - 0.5) * b.d);
      curveMaterial(m.material as THREE.Material);
      this.scene.add(m);
      this.petals.push({ m, vx: 0.18 + Math.random() * 0.22, vz: (Math.random() - 0.5) * 0.25, spin: 1 + Math.random() * 4, life: 0 });
    }

    let growing: THREE.Object3D | null = null;
    const blooming: THREE.Object3D[] = [];
    for (const { obj, cell } of this.objects.values()) {
      if (obj.userData.pop < 1) {
        obj.userData.pop = Math.min(1, obj.userData.pop + dt * 3);
        const k = obj.userData.pop;
        obj.scale.setScalar(0.6 + 0.4 * k + Math.sin(k * Math.PI) * 0.12);
      }
      if (cell.kind === "plant") {
        const s = obj.userData.seed as number;
        const amp = obj.userData.tree ? 0.012 : 0.026;
        obj.rotation.z = Math.sin(t * 1.3 + s) * amp;
        obj.rotation.x = Math.cos(t * 1.05 + s * 0.7) * amp * 0.7;
        if (cell.growing) growing = obj;
      }
      if (obj.userData.petals) blooming.push(obj);
    }
    for (const tk of this.tokens.values()) {
      const ph = tk.userData.phase as number;
      tk.position.y = 0.92 + Math.sin(t * 2 + ph) * 0.06;
      tk.rotation.y = t * 1.4 + ph;
    }
    for (const o of this.sways) o.rotation.z = Math.sin(t * 1.2 + (o.userData.seed as number)) * 0.018;
    for (const c of this.clouds) {
      c.userData.a += (c.userData.speed * dt) / c.userData.rad;
      c.position.x = Math.cos(c.userData.a) * c.userData.rad;
      c.position.z = Math.sin(c.userData.a) * c.userData.rad;
    }
    this.streamTex.offset.y -= dt * 0.35;
    this.fallTex.offset.y += dt * 0.9;
    this.riverTex.offset.y -= dt * 0.22;

    for (const s of this.sparkles) {
      s.visible = !!growing;
      if (!growing) continue;
      const ph = (t * 0.35 + (s.userData.phase as number)) % 1;
      const a = (s.userData.phase as number) * Math.PI * 2 * 3 + t * 0.6;
      s.position.set(growing.position.x + Math.cos(a) * 0.34, growing.position.y + 0.1 + ph * 1.0, growing.position.z + Math.sin(a) * 0.34);
      s.scale.setScalar(0.026 * Math.sin(ph * Math.PI) + 0.004);
    }

    if (blooming.length && this.petals.length < 50 && Math.random() < dt * 7) {
      const src = blooming[Math.floor(Math.random() * blooming.length)];
      const m = ell(0.03, 0.006, 0.02, Math.random() < 0.5 ? "#ffc1d6" : "#ffd6e4", undefined, true);
      m.castShadow = false;
      curveMaterial(m.material as THREE.Material);
      m.position.set(src.position.x + (Math.random() - 0.5) * 1.0, src.position.y + 1.1 + Math.random() * 0.5, src.position.z + (Math.random() - 0.5) * 1.0);
      this.scene.add(m);
      this.petals.push({ m, vx: 0.15 + Math.random() * 0.2, vz: (Math.random() - 0.5) * 0.2, spin: Math.random() * 4, life: 0 });
    }
    this.petals = this.petals.filter((p) => {
      p.life += dt;
      p.m.position.x += p.vx * dt + Math.sin(t * 2 + p.spin) * 0.004;
      p.m.position.z += p.vz * dt;
      p.m.position.y -= 0.28 * dt;
      p.m.rotation.set(t * p.spin, t * 0.7, t * p.spin * 0.5);
      if (p.m.position.y < 0.12 || p.life > 9) {
        this.scene.remove(p.m);
        return false;
      }
      return true;
    });

    const place = (ring: THREE.Mesh, plot: number | null, lift: number) => {
      ring.visible = plot != null;
      if (plot == null) return;
      const p = this.plotPos(plot);
      ring.position.set(p.x, 0.115 + lift, p.z);
    };
    place(this.hoverRing, this.hovered !== this.selected ? this.hovered : null, 0);
    place(this.selectRing, this.selected, 0.002);
    this.selectRing.scale.setScalar(1 + Math.sin(t * 3) * 0.025);

    this.renderer.render(this.scene, this.camera);
  };

  dispose() {
    this.alive = false;
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    document.removeEventListener("visibilitychange", this.onVis);
    const el = this.renderer.domElement;
    el.removeEventListener("pointerdown", this.onDown);
    el.removeEventListener("pointerup", this.onUp);
    el.removeEventListener("pointermove", this.onMove);
    el.removeEventListener("pointerleave", this.onLeave);
    for (const plot of [...this.objects.keys()]) this.remove(plot);
    for (const t of this.tokens.values()) this.scene.remove(t);
    this.tokens.clear();
    this.controls.dispose();
    this.renderer.dispose();
    el.remove();
  }
}

/** Small pictures of every plant (in bloom), for the lists beside the garden and the journal. */
export async function renderThumbs(size = 168): Promise<Record<string, string>> {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(size, size, false);
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight("#f3f9ff", "#b9dc9c", 1.5));
  const sun = new THREE.DirectionalLight("#fff3dc", 2.1);
  sun.position.set(3, 5, 4);
  scene.add(sun);
  const cam = new THREE.PerspectiveCamera(28, 1, 0.05, 50);
  const out: Record<string, string> = {};
  const shoot = (key: string, obj: THREE.Object3D) => {
    scene.add(obj);
    const box = new THREE.Box3().setFromObject(obj);
    const c = box.getCenter(new THREE.Vector3());
    const s = box.getSize(new THREE.Vector3());
    const r = Math.max(s.x, s.y, s.z) * 0.62 + 0.02;
    const dist = r / Math.tan(((cam.fov / 2) * Math.PI) / 180);
    cam.position.set(c.x + dist * 0.55, c.y + dist * 0.42, c.z + dist * 0.72);
    cam.lookAt(c);
    renderer.render(scene, cam);
    out[key] = renderer.domElement.toDataURL("image/png");
    scene.remove(obj);
    disposeObject(obj);
  };
  const curve = CURVE.uCurve.value;
  CURVE.uCurve.value = 0;
  for (const s of SPECIES) {
    for (let tier = 0; tier < 5; tier++) shoot(`flower:${s.id}:${tier}`, buildFlower(s.id, 1, tier, 13));
    out[`plant:${s.id}`] = out[`flower:${s.id}:2`];
  }
  CURVE.uCurve.value = curve;
  renderer.dispose();
  renderer.forceContextLoss();
  thumbsEpoch++;
  return out;
}

/** A small golden token: laurels waiting to be collected. */
const TOKEN_MAT = new THREE.MeshToonMaterial({ color: "#ffd24a", emissive: new THREE.Color("#ffb300"), emissiveIntensity: 0.35, gradientMap: TOON_RAMP });
const TOKEN_RIM = new THREE.MeshToonMaterial({ color: "#f2a91c", emissive: new THREE.Color("#c77700"), emissiveIntensity: 0.2, gradientMap: TOON_RAMP });
const TOKEN_GEO = new THREE.CylinderGeometry(0.11, 0.11, 0.035, 28).rotateX(Math.PI / 2);
const TOKEN_RIM_GEO = new THREE.TorusGeometry(0.11, 0.018, 8, 28);
const TOKEN_LEAF = new THREE.SphereGeometry(1, 10, 8);
function token() {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(TOKEN_GEO, TOKEN_MAT));
  g.add(new THREE.Mesh(TOKEN_RIM_GEO, TOKEN_RIM));
  // A tiny wreath of leaves pressed into each face.
  for (const zf of [-1, 1])
    for (let i = 0; i < 8; i++) {
      const a = Math.PI * 0.62 + (i / 7) * Math.PI * 1.76;
      const l = new THREE.Mesh(TOKEN_LEAF, TOKEN_RIM);
      l.scale.set(0.012, 0.024, 0.008);
      l.position.set(Math.cos(a) * 0.065, Math.sin(a) * 0.065, zf * 0.019);
      l.rotation.z = a;
      g.add(l);
    }
  return g;
}

/** A flat rounded-square outline, used to mark the hovered and picked plots. */
function roundedRing(size: number, width: number) {
  const shape = (s: number, r: number) => {
    const h = s / 2;
    const p = new THREE.Shape();
    p.moveTo(-h + r, -h);
    p.lineTo(h - r, -h);
    p.quadraticCurveTo(h, -h, h, -h + r);
    p.lineTo(h, h - r);
    p.quadraticCurveTo(h, h, h - r, h);
    p.lineTo(-h + r, h);
    p.quadraticCurveTo(-h, h, -h, h - r);
    p.lineTo(-h, -h + r);
    p.quadraticCurveTo(-h, -h, -h + r, -h);
    return p;
  };
  const outer = shape(size, 0.14);
  outer.holes.push(shape(size - width * 2, 0.1) as unknown as THREE.Path);
  return new THREE.ShapeGeometry(outer, 8);
}
