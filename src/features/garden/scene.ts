// The garden island in 3D, in an original cozy style: a raised grassy terrace at the
// back with a little waterfall, a stream with sandy banks and a wooden bridge, a
// beach on calm water, round trees, bushes, wild flowers and rocks, soft sunlight
// and drifting clouds. Plants sway; the one growing right now sparkles; cherry
// trees in bloom drop petals. Drag to turn, scroll to zoom, click a plot to pick it.
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { disposeObject, ell, mat, rng, TOON_RAMP } from "./models";
import { bushBall, buildGardenDecor, buildPlant, edgeTree, rock, tuft, wildflowers } from "./cozy";
import { DECOR, SPECIES } from "./catalog";

export interface Cell {
  key: string; // changes whenever the model must be rebuilt
  plot: number;
  kind: "plant" | "decor";
  species?: string;
  decor?: string;
  g?: number;
  rot?: number;
  seed: number;
  growing?: boolean;
}

const T = 1; // plot size
const SIDE = 1.5; // grass between the plots and the island's sides / front
const BACK = 2.6; // deeper at the back, for the terrace
const TERRACE_H = 0.55;

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
    g.fillStyle = "#8fd164";
    g.fillRect(0, 0, 512, 512);
    const r = rng(11);
    for (let i = 0; i < 240; i++) {
      const x = r() * 512;
      const y = r() * 512;
      const rad = 12 + r() * 48;
      const grad = g.createRadialGradient(x, y, 0, x, y, rad);
      grad.addColorStop(0, r() < 0.5 ? "rgba(182,230,130,0.4)" : "rgba(100,170,72,0.28)");
      grad.addColorStop(1, "rgba(143,209,100,0)");
      g.fillStyle = grad;
      g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    for (let i = 0; i < 1200; i++) {
      const x = r() * 512;
      const y = r() * 512;
      g.strokeStyle = r() < 0.5 ? "rgba(88,152,62,0.35)" : "rgba(196,238,146,0.4)";
      g.lineWidth = 1.3;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + (r() - 0.5) * 3, y - 4 - r() * 5);
      g.stroke();
    }
  });

/** Cliff faces: warm earth in soft horizontal layers. */
const cliffTexture = () =>
  canvasTex(256, 256, (g) => {
    const bands = ["#c08a5c", "#b47d51", "#a87049", "#b98457", "#9e6843"];
    for (let i = 0; i < 16; i++) {
      g.fillStyle = bands[i % bands.length];
      g.fillRect(0, i * 16, 256, 16);
    }
    const r = rng(5);
    for (let i = 0; i < 60; i++) {
      g.fillStyle = r() < 0.5 ? "rgba(255,240,220,0.12)" : "rgba(60,30,10,0.1)";
      g.beginPath();
      g.ellipse(r() * 256, r() * 256, 10 + r() * 20, 3 + r() * 4, 0, 0, Math.PI * 2);
      g.fill();
    }
  });

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
  const white = mat("#ffffff", { emissive: "#ffffff", ei: 0.35 });
  for (let i = 0; i < 6; i++) {
    const s = 0.6 + r() * 0.7;
    const b = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 12), white);
    b.scale.set(s * 1.3, s * 0.8, s);
    b.position.set((i - 2.5) * 0.75 + r() * 0.3, r() * 0.4, r() * 0.6);
    g.add(b);
  }
  return g;
}

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
  private clouds: THREE.Group[] = [];
  private sways: THREE.Object3D[] = [];
  private water!: THREE.Mesh;
  private raf = 0;
  private clock = new THREE.Clock();
  private ro: ResizeObserver;
  private cols = 6;
  private rows = 4;
  private selected: number | null = null;
  private hovered: number | null = null;
  private down: { x: number; y: number } | null = null;
  private ray = new THREE.Raycaster();
  private alive = true;
  private grassTex = grassTexture();
  private cliffTex = cliffTexture();
  private streamTex = waterTexture();
  private fallTex = waterTexture();
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
    this.renderer.toneMappingExposure = 1.02;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.display = "block";
    this.renderer.domElement.style.outline = "none";

    this.camera = new THREE.PerspectiveCamera(30, 1, 0.1, 200);
    this.camera.position.set(5.4, 7.2, 8.4);
    this.scene.fog = new THREE.Fog("#cfeaf7", 20, 50);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.enablePan = false;
    this.controls.minPolarAngle = 0.45;
    this.controls.maxPolarAngle = 1.2;
    this.controls.target.set(0, 0.2, -0.4);

    // Warm sun with soft shadows, a sky/grass bounce and a cool fill.
    this.scene.add(new THREE.HemisphereLight("#eaf6ff", "#9fd27a", 1.05));
    const sun = new THREE.DirectionalLight("#ffeccc", 2.6);
    sun.position.set(6, 11, 6);
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
    const fill = new THREE.DirectionalLight("#d4e8ff", 0.45);
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
    for (let i = 0; i < 5; i++) {
      const c = cloud(cr);
      c.position.set(-14 + i * 7 + cr() * 3, 7 + cr() * 2.5, -13 - cr() * 6);
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
  setSize(cols: number, rows: number) {
    if (cols === this.cols && rows === this.rows) return;
    this.cols = cols;
    this.rows = rows;
    this.buildIsland();
    for (const [plot, o] of this.objects) o.obj.position.copy(this.plotPos(plot));
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
      o.position.set(x, y, z);
      o.rotation.y = r() * Math.PI * 2;
      this.island.add(o);
      if (sway) {
        o.userData.seed = r() * 10;
        this.sways.push(o);
      }
      return o;
    };

    // Sea, shallows and a sandy beach all round.
    const water = new THREE.Mesh(new THREE.CircleGeometry(Math.max(W, D) * 4, 64), mat("#79cde8", { rough: 0.2 }));
    water.rotation.x = -Math.PI / 2;
    water.position.set(0, -0.48, cz);
    water.receiveShadow = true;
    this.water = water;
    this.island.add(water);
    const shallows = new THREE.Mesh(new RoundedBoxGeometry(W + 1.8, 0.04, D + 1.8, 6, 0.02), mat("#a2e2ef", { rough: 0.25, opacity: 0.75 }));
    shallows.position.set(0, -0.46, cz);
    this.island.add(shallows);
    const sand = new THREE.Mesh(new RoundedBoxGeometry(W + 1.0, 0.34, D + 1.0, 8, 0.17), toon({ color: "#f3dfb2" }));
    sand.position.set(0, -0.37, cz);
    sand.receiveShadow = true;
    this.island.add(sand);

    // The main island: earth sides under a painted grass top.
    const cliffMat = toon({ map: this.cliffTex });
    this.cliffTex.repeat.set(W / 2, 1);
    const earth = new THREE.Mesh(new RoundedBoxGeometry(W, 0.5, D, 8, 0.24), cliffMat);
    earth.position.set(0, -0.25, cz);
    earth.receiveShadow = true;
    this.island.add(earth);
    const grassMat = toon({ map: this.grassTex });
    this.grassTex.repeat.set(W / 3, D / 3);
    const grass = new THREE.Mesh(new RoundedBoxGeometry(W + 0.06, 0.2, D + 0.06, 8, 0.1), grassMat);
    grass.position.set(0, -0.02, cz);
    grass.receiveShadow = true;
    this.island.add(grass);

    // A raised terrace along the back, with a grass cap and soft cliff sides.
    const tD = BACK - 0.6;
    const tz = back + tD / 2 + 0.05;
    const terrace = new THREE.Mesh(new RoundedBoxGeometry(W - 0.1, TERRACE_H, tD, 8, 0.2), cliffMat);
    terrace.position.set(0, TERRACE_H / 2 - 0.02, tz);
    terrace.castShadow = true;
    terrace.receiveShadow = true;
    this.island.add(terrace);
    const cap = new THREE.Mesh(new RoundedBoxGeometry(W - 0.02, 0.14, tD + 0.08, 8, 0.07), grassMat);
    cap.position.set(0, TERRACE_H + 0.02, tz);
    cap.receiveShadow = true;
    this.island.add(cap);
    const topY = TERRACE_H + 0.09;

    // A stream down the left side, from a little waterfall off the terrace to the sea.
    const sx = -halfW - SIDE / 2 - 0.05;
    const streamMat = new THREE.MeshStandardMaterial({ map: this.streamTex, roughness: 0.15, metalness: 0 });
    this.streamTex.repeat.set(1, D / 2);
    const sLen = front - (tz + tD / 2) + 0.6;
    const sz = (front + 0.6 + tz + tD / 2) / 2;
    const stream = new THREE.Mesh(new RoundedBoxGeometry(0.62, 0.06, sLen, 4, 0.03), streamMat);
    stream.position.set(sx, 0.06, sz);
    stream.receiveShadow = true;
    this.island.add(stream);
    for (const side of [-1, 1]) {
      const bank = new THREE.Mesh(new RoundedBoxGeometry(0.12, 0.1, sLen - 0.2, 4, 0.05), toon({ color: "#e7d3a3" }));
      bank.position.set(sx + side * 0.36, 0.05, sz - 0.1);
      bank.receiveShadow = true;
      this.island.add(bank);
    }
    const fallMat = new THREE.MeshStandardMaterial({ map: this.fallTex, roughness: 0.2, metalness: 0, transparent: true, opacity: 0.92 });
    const fall = new THREE.Mesh(new THREE.PlaneGeometry(0.56, TERRACE_H + 0.1), fallMat);
    fall.position.set(sx, TERRACE_H / 2 + 0.06, tz + tD / 2 + 0.02);
    this.island.add(fall);
    const pool = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.05, 24), mat("#a8e6f4", { rough: 0.2, opacity: 0.85 }));
    pool.position.set(sx, 0.08, tz + tD / 2 + 0.25);
    this.island.add(pool);
    const topStream = new THREE.Mesh(new RoundedBoxGeometry(0.56, 0.04, tD * 0.7, 4, 0.02), streamMat);
    topStream.position.set(sx, topY, tz + tD * 0.15);
    this.island.add(topStream);
    for (let i = 0; i < 7; i++) add(rock(r, 0.06 + r() * 0.06, "#c9c3b8"), sx + (r() < 0.5 ? -1 : 1) * (0.36 + r() * 0.08), 0.06, sz - sLen / 2 + r() * sLen);
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

    // Plots: soft raised squares of slightly brighter lawn.
    const plotGeo = new RoundedBoxGeometry(T * 0.9, 0.05, T * 0.9, 4, 0.025);
    const plotMat = toon({ map: this.grassTex, color: "#ecffd8" });
    const pickGeo = new THREE.PlaneGeometry(T, T);
    for (let i = 0; i < this.cols * this.rows; i++) {
      const p = this.plotPos(i);
      const tile = new THREE.Mesh(plotGeo, plotMat);
      tile.position.set(p.x, 0.065, p.z);
      tile.receiveShadow = true;
      this.plotsGroup.add(tile);
      const pick = new THREE.Mesh(pickGeo, new THREE.MeshBasicMaterial({ visible: false }));
      pick.rotation.x = -Math.PI / 2;
      pick.position.set(p.x, 0.11, p.z);
      pick.userData.plot = i;
      this.pickers.push(pick);
      this.plotsGroup.add(pick);
    }

    // Trees and bushes along the terrace.
    const kinds: ("round" | "cedar" | "fruit")[] = ["round", "cedar", "round", "fruit", "cedar"];
    for (let x = -W / 2 + 0.55; x <= W / 2 - 0.4; x += 0.85 + r() * 0.35) {
      if (Math.abs(x - sx) < 0.5) continue;
      if (r() < 0.25) add(bushBall(r, 0.2 + r() * 0.08, r() < 0.5), x, topY, tz - tD * 0.15 + (r() - 0.5) * 0.4, true);
      else add(edgeTree(r, kinds[Math.floor(r() * kinds.length)], 1.25 + r() * 0.5), x, topY, tz - tD * 0.12 + (r() - 0.5) * 0.35, true);
    }
    for (let x = -W / 2 + 0.7; x <= W / 2 - 0.4; x += 0.45 + r() * 0.3) {
      if (Math.abs(x - sx) < 0.4) continue;
      add(r() < 0.5 ? wildflowers(r) : tuft(r), x, topY, tz + tD * 0.32 + (r() - 0.5) * 0.15, true);
    }

    // The flat border round the plots: bushes, wild flowers, grass and rocks.
    const free = (x: number, z: number) => (Math.abs(x) > halfW + 0.12 || z > halfD + 0.12 || (z < -halfD - 0.12 && z > tz + tD / 2 + 0.1)) && Math.abs(x - sx) > 0.55;
    let n = 0;
    for (let k = 0; n < 95 && k < 2000; k++) {
      const x = (r() - 0.5) * (W - 0.4);
      const z = back + 0.2 + r() * (D - 0.4);
      if (z < tz + tD / 2 + 0.1 || !free(x, z)) continue;
      n++;
      const roll = r();
      if (roll < 0.45) add(tuft(r, 0.12 + r() * 0.08), x, 0.08, z, true);
      else if (roll < 0.75) add(wildflowers(r), x, 0.08, z, true);
      else if (roll < 0.88) add(rock(r, 0.05 + r() * 0.05), x, 0.08, z);
      else add(bushBall(r, 0.14 + r() * 0.06, r() < 0.5), x, 0.08, z, true);
    }
    // A couple of round trees on the front-right corner frame the view.
    add(edgeTree(r, "fruit", 1.3), W / 2 - 0.45, 0.08, front - 0.45, true);
    add(bushBall(r, 0.22, true), W / 2 - 0.95, 0.08, front - 0.35, true);
    // Rocks where the grass meets the beach, and lily pads on the sea.
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2 + r() * 0.3;
      const x = Math.max(-W / 2 - 0.25, Math.min(W / 2 + 0.25, Math.cos(a) * (W / 2 + 0.3)));
      const z = Math.max(back - 0.25, Math.min(front + 0.25, cz + Math.sin(a) * (D / 2 + 0.3)));
      if (Math.abs(x - sx) < 0.5 && z > 0) continue;
      add(rock(r, 0.09 + r() * 0.08), x, -0.26, z);
    }
    for (let i = 0; i < 10; i++) {
      const a = r() * Math.PI * 2;
      const d = Math.max(W, D) * (0.7 + r() * 0.3);
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.02, 18, 1, false, 0.4, Math.PI * 1.85), mat("#5cb85c"));
      pad.position.set(Math.cos(a) * d, -0.46, cz + Math.sin(a) * d * 0.8);
      pad.rotation.y = r() * 6;
      this.island.add(pad);
    }

    const span = Math.max(this.cols, this.rows * 1.4);
    this.controls.maxDistance = 12 + span * 2.2;
    this.controls.minDistance = 4;
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
      const obj = cell.kind === "plant" ? buildPlant(cell.species!, cell.g ?? 0, cell.seed) : buildGardenDecor(cell.decor!, cell.seed);
      obj.position.copy(this.plotPos(cell.plot));
      obj.rotation.y = ((cell.rot ?? 0) * Math.PI) / 2 + (cell.kind === "plant" ? (cell.seed % 7) * 0.4 : 0);
      obj.userData.seed = cell.seed;
      this.scene.add(obj);
      this.objects.set(cell.plot, { key: cell.key, obj, cell });
      obj.scale.setScalar(0.6);
      obj.userData.pop = 0;
    }
    for (const plot of [...this.objects.keys()]) if (!seen.has(plot)) this.remove(plot);
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
  }

  /* ------------------------------------------------------------ Frame */
  private loop = () => {
    if (!this.alive) return;
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(0.05, this.clock.getDelta());
    const t = this.clock.elapsedTime;
    this.controls.update();

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
        if (obj.userData.petals) blooming.push(obj);
      }
    }
    for (const o of this.sways) o.rotation.z = Math.sin(t * 1.2 + (o.userData.seed as number)) * 0.018;
    for (const c of this.clouds) {
      c.position.x += c.userData.speed * dt;
      if (c.position.x > 22) c.position.x = -22;
    }
    this.streamTex.offset.y -= dt * 0.35;
    this.fallTex.offset.y += dt * 0.9;

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
    if (this.water) (this.water.material as THREE.MeshStandardMaterial).color.setHSL(0.54, 0.68, 0.66 + Math.sin(t * 0.8) * 0.012);

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
    this.controls.dispose();
    this.renderer.dispose();
    el.remove();
  }
}

/** Small pictures of every plant (in bloom) and decoration, for the lists beside the garden. */
export async function renderThumbs(size = 112): Promise<Record<string, string>> {
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
  for (const s of SPECIES) shoot(`plant:${s.id}`, buildPlant(s.id, 1, 13));
  for (const d of DECOR) shoot(`decor:${d.id}`, buildGardenDecor(d.id, 5));
  renderer.dispose();
  renderer.forceContextLoss();
  return out;
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
