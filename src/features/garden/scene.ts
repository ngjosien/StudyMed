// The garden island in 3D: a grassy island on calm water, a grid of plots, soft
// sunlight and shadows. Plants sway; the one growing right now sparkles; cherry
// trees in bloom drop petals. Drag to turn, scroll to zoom, click a plot to pick it.
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { buildDecor, buildPlant, disposeObject, ell, mat, rng } from "./models";

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
const GRASS = "#8fd16a";
const GRASS_TOP = "#9bdc74";

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

  constructor(
    private host: HTMLElement,
    private onPick: (plot: number | null) => void,
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.display = "block";
    this.renderer.domElement.style.outline = "none";

    this.camera = new THREE.PerspectiveCamera(32, 1, 0.1, 200);
    this.camera.position.set(5.6, 6.4, 7.2);
    this.scene.fog = new THREE.Fog("#d9eefa", 16, 40);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.enablePan = false;
    this.controls.minPolarAngle = 0.45;
    this.controls.maxPolarAngle = 1.2;
    this.controls.minDistance = 6;
    this.controls.maxDistance = 22;
    this.controls.target.set(0, 0.2, 0);

    // Soft daylight: a sky/grass bounce, a warm sun with soft shadows, a cool fill.
    this.scene.add(new THREE.HemisphereLight("#e6f4ff", "#9ccf7a", 1.15));
    const sun = new THREE.DirectionalLight("#fff1d6", 2.1);
    sun.position.set(6, 11, 5);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.radius = 4;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.02;
    const sc = sun.shadow.camera as THREE.OrthographicCamera;
    sc.left = -9;
    sc.right = 9;
    sc.top = 9;
    sc.bottom = -9;
    this.scene.add(sun);
    const fill = new THREE.DirectionalLight("#cfe4ff", 0.45);
    fill.position.set(-6, 4, -4);
    this.scene.add(fill);

    this.scene.add(this.island);
    this.scene.add(this.plotsGroup);

    const ringGeo = roundedRing(0.94, 0.07);
    this.hoverRing = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.75, depthWrite: false }));
    this.selectRing = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: "#ffd84d", transparent: true, opacity: 0.95, depthWrite: false }));
    for (const r of [this.hoverRing, this.selectRing]) {
      r.rotation.x = -Math.PI / 2;
      r.visible = false;
      r.renderOrder = 2;
      this.scene.add(r);
    }
    for (let i = 0; i < 14; i++) {
      const s = ell(0.025, 0.025, 0.025, "#fff6b0", { emissive: "#ffe680", ei: 2 }, true);
      s.castShadow = false;
      s.visible = false;
      s.userData = { phase: i / 14 };
      this.sparkles.push(s);
      this.scene.add(s);
    }

    this.buildIsland();
    const el = this.renderer.domElement;
    el.addEventListener("pointerdown", this.onDown);
    el.addEventListener("pointerup", this.onUp);
    el.addEventListener("pointermove", this.onMove);
    el.addEventListener("pointerleave", this.onLeave);
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    this.resize();
    document.addEventListener("visibilitychange", this.onVis);
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
    return new THREE.Vector3((c - (this.cols - 1) / 2) * T, 0.14, (r - (this.rows - 1) / 2) * T);
  }

  private buildIsland() {
    for (const g of [this.island, this.plotsGroup]) {
      g.traverse((c) => {
        const m = c as THREE.Mesh;
        if (m.geometry && m.geometry.type !== "SphereGeometry" && m.geometry.type !== "DodecahedronGeometry" && m.geometry.type !== "CylinderGeometry" && m.geometry.type !== "ConeGeometry") m.geometry.dispose();
      });
      g.clear();
    }
    this.pickers = [];
    const W = this.cols * T + 1.7;
    const D = this.rows * T + 1.7;
    const r = rng(7 + this.rows);

    // Water all around, and the island: earth sides, a grass top with a lip.
    const water = new THREE.Mesh(new THREE.CircleGeometry(Math.max(W, D) * 4, 64), mat("#7fd0ee", { rough: 0.25 }));
    water.rotation.x = -Math.PI / 2;
    water.position.y = -0.42;
    water.receiveShadow = true;
    this.water = water;
    this.island.add(water);
    const foam = new THREE.Mesh(new RoundedBoxGeometry(W + 0.5, 0.04, D + 0.5, 4, 0.02), mat("#e8f8ff", { rough: 0.4, opacity: 0.6 }));
    foam.position.y = -0.4;
    this.island.add(foam);
    const earth = new THREE.Mesh(new RoundedBoxGeometry(W, 0.62, D, 6, 0.28), mat("#b07f55"));
    earth.position.y = -0.33;
    earth.receiveShadow = true;
    this.island.add(earth);
    const earth2 = new THREE.Mesh(new RoundedBoxGeometry(W - 0.12, 0.2, D - 0.12, 6, 0.1), mat("#9a6a45"));
    earth2.position.y = -0.52;
    this.island.add(earth2);
    const grass = new THREE.Mesh(new RoundedBoxGeometry(W + 0.06, 0.2, D + 0.06, 6, 0.1), mat(GRASS));
    grass.position.y = -0.04;
    grass.receiveShadow = true;
    this.island.add(grass);

    // Plots: a soft square each, slightly checkered like a mown lawn.
    const plotGeo = new RoundedBoxGeometry(T * 0.9, 0.08, T * 0.9, 4, 0.035);
    const pickGeo = new THREE.PlaneGeometry(T, T);
    for (let i = 0; i < this.cols * this.rows; i++) {
      const p = this.plotPos(i);
      const c = i % this.cols;
      const rr = Math.floor(i / this.cols);
      const tile = new THREE.Mesh(plotGeo, mat((c + rr) % 2 ? GRASS_TOP : "#a4e07e"));
      tile.position.set(p.x, 0.07, p.z);
      tile.receiveShadow = true;
      this.plotsGroup.add(tile);
      const pick = new THREE.Mesh(pickGeo, new THREE.MeshBasicMaterial({ visible: false }));
      pick.rotation.x = -Math.PI / 2;
      pick.position.set(p.x, 0.12, p.z);
      pick.userData.plot = i;
      this.pickers.push(pick);
      this.plotsGroup.add(pick);
    }

    // The border: grass tufts, little wild flowers and pebbles round the edge.
    const inBorder = (x: number, z: number) => Math.abs(x) > (this.cols * T) / 2 + 0.05 || Math.abs(z) > (this.rows * T) / 2 + 0.05;
    let placed = 0;
    for (let k = 0; placed < 70 && k < 600; k++) {
      const x = (r() - 0.5) * (W - 0.3);
      const z = (r() - 0.5) * (D - 0.3);
      if (!inBorder(x, z)) continue;
      placed++;
      const kind = r();
      if (kind < 0.5) {
        const tuft = new THREE.Group();
        for (let b = 0; b < 4; b++) {
          const blade = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.16 + r() * 0.08, 5), mat(b % 2 ? "#6fbf4f" : "#7fcb5a"));
          blade.position.set((r() - 0.5) * 0.08, 0.1, (r() - 0.5) * 0.08);
          blade.rotation.set((r() - 0.5) * 0.5, 0, (r() - 0.5) * 0.5);
          blade.castShadow = true;
          tuft.add(blade);
        }
        tuft.position.set(x, 0.06, z);
        this.island.add(tuft);
      } else if (kind < 0.8) {
        const f = new THREE.Group();
        const colors = ["#ffffff", "#ffe066", "#ffb3c7", "#c3a6f4"];
        f.add(Object.assign(ell(0.03, 0.03, 0.03, colors[Math.floor(r() * 4)], undefined, true), {}));
        f.children[0].position.y = 0.13;
        const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.12, 5), mat("#5aa84a"));
        stem.position.y = 0.06;
        f.add(stem);
        f.position.set(x, 0.06, z);
        this.island.add(f);
      } else {
        const peb = ell(0.06 + r() * 0.05, 0.03, 0.05 + r() * 0.04, r() < 0.5 ? "#cfc8bd" : "#b9b1a6");
        peb.position.set(x, 0.07, z);
        peb.rotation.y = r() * 3;
        this.island.add(peb);
      }
    }
    // A few lily pads and reeds on the water.
    for (let i = 0; i < 9; i++) {
      const a = r() * Math.PI * 2;
      const d = Math.max(W, D) * (0.62 + r() * 0.25);
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.02, 16, 1, false, 0.4, Math.PI * 1.85), mat("#5cb85c"));
      pad.position.set(Math.cos(a) * d, -0.4, Math.sin(a) * d * 0.8);
      pad.rotation.y = r() * 6;
      this.island.add(pad);
    }

    const span = Math.max(this.cols, this.rows * 1.4);
    this.controls.maxDistance = 10 + span * 2.2;
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
      const obj = cell.kind === "plant" ? buildPlant(cell.species!, cell.g ?? 0, cell.seed) : buildDecor(cell.decor!, cell.seed);
      obj.position.copy(this.plotPos(cell.plot));
      obj.rotation.y = ((cell.rot ?? 0) * Math.PI) / 2 + (cell.kind === "plant" ? (cell.seed % 7) * 0.4 : 0);
      obj.userData.seed = cell.seed;
      this.scene.add(obj);
      this.objects.set(cell.plot, { key: cell.key, obj, cell });
      // Little pop when something new appears.
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
        obj.rotation.z = Math.sin(t * 1.4 + s) * 0.025;
        obj.rotation.x = Math.cos(t * 1.1 + s * 0.7) * 0.018;
        if (cell.growing) growing = obj;
        if (obj.userData.petals) blooming.push(obj);
      }
    }

    // Sparkles rise around the plant that's growing right now.
    for (const s of this.sparkles) {
      s.visible = !!growing;
      if (!growing) continue;
      const ph = (t * 0.35 + (s.userData.phase as number)) % 1;
      const a = (s.userData.phase as number) * Math.PI * 2 * 3 + t * 0.6;
      s.position.set(growing.position.x + Math.cos(a) * 0.32, growing.position.y + 0.1 + ph * 0.9, growing.position.z + Math.sin(a) * 0.32);
      s.scale.setScalar(0.025 * Math.sin(ph * Math.PI) + 0.004);
    }

    // Cherry petals drift down from trees in bloom.
    if (blooming.length && this.petals.length < 40 && Math.random() < dt * 6) {
      const src = blooming[Math.floor(Math.random() * blooming.length)];
      const m = ell(0.03, 0.006, 0.02, "#ffc1d6", undefined, true);
      m.castShadow = false;
      m.position.set(src.position.x + (Math.random() - 0.5) * 0.8, src.position.y + 1.1 + Math.random() * 0.3, src.position.z + (Math.random() - 0.5) * 0.8);
      this.scene.add(m);
      this.petals.push({ m, vx: 0.15 + Math.random() * 0.2, vz: (Math.random() - 0.5) * 0.2, spin: Math.random() * 4, life: 0 });
    }
    this.petals = this.petals.filter((p) => {
      p.life += dt;
      p.m.position.x += p.vx * dt + Math.sin(t * 2 + p.spin) * 0.004;
      p.m.position.z += p.vz * dt;
      p.m.position.y -= 0.28 * dt;
      p.m.rotation.set(t * p.spin, t * 0.7, t * p.spin * 0.5);
      if (p.m.position.y < 0.12 || p.life > 8) {
        this.scene.remove(p.m);
        return false;
      }
      return true;
    });

    // Rings: hover in white, the picked plot in gold with a gentle pulse.
    const place = (ring: THREE.Mesh, plot: number | null, lift: number) => {
      ring.visible = plot != null;
      if (plot == null) return;
      const p = this.plotPos(plot);
      ring.position.set(p.x, 0.125 + lift, p.z);
    };
    place(this.hoverRing, this.hovered !== this.selected ? this.hovered : null, 0);
    place(this.selectRing, this.selected, 0.002);
    this.selectRing.scale.setScalar(1 + Math.sin(t * 3) * 0.025);
    (this.water.material as THREE.MeshStandardMaterial).color.setHSL(0.54, 0.72, 0.68 + Math.sin(t * 0.8) * 0.012);

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
