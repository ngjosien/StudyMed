import { useEffect, useRef } from "react";

/*
 * The living background: a field of neurons that fire on their own. A firing cell flares,
 * sends a pulse down each of its axons, and the cells it reaches may fire in turn, so
 * activity ripples across the screen. Behind it drift a slow DNA helix and specks of plasma.
 * Plain canvas 2D: the wiring is drawn once into two cached layers (far and near, for
 * parallax) and only the pulses, glows, specks and helix are drawn every frame.
 */

type Pt = { x: number; y: number };
interface Neuron extends Pt {
  z: number; // depth 0.35 (far) .. 1 (near)
  r: number;
  out: number[]; // edge indexes
  glow: number; // 0..1, decays
  rest: number; // seconds until it can fire again
  next: number; // seconds until it fires on its own
}
interface Edge {
  a: number;
  b: number;
  pts: Pt[]; // sampled curve
  len: number;
}
interface Pulse {
  e: number;
  d: number; // distance travelled
  v: number; // px/s
}
interface Mote extends Pt {
  r: number;
  vy: number;
  vx: number;
  ph: number;
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const TAU = Math.PI * 2;

function cssColor(name: string, fallback: string) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

/** Any CSS colour -> [r,g,b] using the canvas parser. */
function rgb(color: string): [number, number, number] {
  const c = document.createElement("canvas").getContext("2d")!;
  c.fillStyle = "#000";
  c.fillStyle = color;
  const s = c.fillStyle as string;
  if (s.startsWith("#")) return [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
  const m = s.match(/[\d.]+/g)!;
  return [+m[0], +m[1], +m[2]];
}
const rgba = (c: [number, number, number], a: number) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
const mix = (a: [number, number, number], b: [number, number, number], t: number): [number, number, number] => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

function curve(a: Pt, b: Pt, bend: number, steps = 28): { pts: Pt[]; len: number } {
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const cx = mx - dy * bend;
  const cy = my + dx * bend;
  const pts: Pt[] = [];
  let len = 0;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const u = 1 - t;
    const p = { x: u * u * a.x + 2 * u * t * cx + t * t * b.x, y: u * u * a.y + 2 * u * t * cy + t * t * b.y };
    if (i) len += Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y);
    pts.push(p);
  }
  return { pts, len };
}

function at(e: Edge, d: number): Pt {
  const f = Math.max(0, Math.min(1, d / e.len)) * (e.pts.length - 1);
  const i = Math.min(e.pts.length - 2, Math.floor(f));
  const t = f - i;
  return { x: e.pts[i].x + (e.pts[i + 1].x - e.pts[i].x) * t, y: e.pts[i].y + (e.pts[i + 1].y - e.pts[i].y) * t };
}

/** A branching dendrite, drawn with tapering strokes. */
function dendrite(g: CanvasRenderingContext2D, x: number, y: number, ang: number, len: number, w: number, depth: number) {
  const bend = rand(-0.5, 0.5);
  const ex = x + Math.cos(ang) * len;
  const ey = y + Math.sin(ang) * len;
  const cx = x + Math.cos(ang + bend) * len * 0.55;
  const cy = y + Math.sin(ang + bend) * len * 0.55;
  g.lineWidth = w;
  g.beginPath();
  g.moveTo(x, y);
  g.quadraticCurveTo(cx, cy, ex, ey);
  g.stroke();
  if (depth > 0) {
    const n = Math.random() < 0.6 ? 2 : 1;
    for (let i = 0; i < n; i++) dendrite(g, ex, ey, ang + rand(-0.75, 0.75), len * rand(0.45, 0.7), w * 0.6, depth - 1);
  }
}

export function NeuralBackdrop({ still = false }: { still?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext("2d")!;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    let W = 0;
    let H = 0;
    let dpr = 1;
    let neurons: Neuron[] = [];
    let edges: Edge[] = [];
    let pulses: Pulse[] = [];
    let motes: Mote[] = [];
    const layers = [document.createElement("canvas"), document.createElement("canvas")]; // far, near
    let dark = false;
    let acc: [number, number, number] = [200, 120, 140];
    let alt: [number, number, number] = [240, 230, 220];
    let raf = 0;
    let last = performance.now();
    let t0 = last;
    const mouse = { x: 0, y: 0, tx: 0, ty: 0 };

    const readColors = () => {
      dark = document.documentElement.classList.contains("dark");
      acc = rgb(cssColor("--accent", "#b05070"));
      const fg = rgb(cssColor("--fg", dark ? "#eee" : "#222"));
      // The second hue: ivory/white light in the dark, the ink colour on paper.
      alt = dark ? mix(fg, [255, 255, 255], 0.3) : mix(acc, fg, 0.45);
    };

    const build = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      W = window.innerWidth;
      H = window.innerHeight;
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      // Jittered grid so cells cover the screen without clumping.
      const count = Math.round(Math.min(64, Math.max(24, (W * H) / 30000)));
      const cols = Math.ceil(Math.sqrt((count * W) / H));
      const rows = Math.ceil(count / cols);
      neurons = [];
      for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++) {
          const z = rand(0.35, 1);
          neurons.push({
            x: ((c + rand(0.15, 0.85)) / cols) * W * 1.08 - W * 0.04,
            y: ((r + rand(0.15, 0.85)) / rows) * H * 1.08 - H * 0.04,
            z,
            r: 2 + 3.4 * z,
            out: [],
            glow: 0,
            rest: 0,
            next: rand(1, 14),
          });
        }
      // Axons to the nearest neighbours at a similar depth.
      edges = [];
      const maxD = Math.max(W, H) / 5.2;
      neurons.forEach((n, i) => {
        const near = neurons
          .map((m, j) => ({ j, d: Math.hypot(m.x - n.x, m.y - n.y) + Math.abs(m.z - n.z) * 160 }))
          .filter((o) => o.j !== i && o.d < maxD)
          .sort((a, b) => a.d - b.d)
          .slice(0, Math.random() < 0.5 ? 2 : 3);
        for (const { j } of near) {
          if (edges.some((e) => e.a === j && e.b === i)) continue;
          const { pts, len } = curve(n, neurons[j], rand(-0.22, 0.22));
          n.out.push(edges.length);
          edges.push({ a: i, b: j, pts, len });
          // Signals can travel back the other way too.
          const back = { a: j, b: i, pts: [...pts].reverse(), len };
          neurons[j].out.push(edges.length);
          edges.push(back);
        }
      });
      // Cache the wiring: far layer and near layer.
      layers.forEach((layer, li) => {
        layer.width = (W + 80) * dpr;
        layer.height = (H + 80) * dpr;
        const g = layer.getContext("2d")!;
        g.setTransform(dpr, 0, 0, dpr, 40 * dpr, 40 * dpr);
        g.lineCap = "round";
        const inLayer = (n: Neuron) => (li === 0 ? n.z < 0.68 : n.z >= 0.68);
        // Soft nebula of the accent behind the far layer.
        if (li === 0) {
          for (let k = 0; k < 4; k++) {
            const x = rand(0, W);
            const y = rand(0, H);
            const rr = rand(0.35, 0.6) * Math.max(W, H);
            const grad = g.createRadialGradient(x, y, 0, x, y, rr);
            grad.addColorStop(0, rgba(k % 2 ? alt : acc, dark ? 0.07 : 0.06));
            grad.addColorStop(1, rgba(acc, 0));
            g.fillStyle = grad;
            g.fillRect(-40, -40, W + 80, H + 80);
          }
        }
        for (const e of edges) {
          const a = neurons[e.a];
          if (!inLayer(a) || e.a > e.b) continue;
          const z = (a.z + neurons[e.b].z) / 2;
          g.strokeStyle = rgba(mix(acc, alt, 0.35), (dark ? 0.22 : 0.13) * z);
          g.lineWidth = 0.6 + 0.7 * z;
          g.beginPath();
          e.pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
          g.stroke();
        }
        for (const n of neurons) {
          if (!inLayer(n)) continue;
          g.strokeStyle = rgba(mix(acc, alt, 0.25), (dark ? 0.3 : 0.17) * n.z);
          const k = 4 + Math.floor(Math.random() * 4);
          for (let i = 0; i < k; i++) dendrite(g, n.x, n.y, (i / k) * TAU + rand(-0.4, 0.4), (14 + 26 * n.z) * rand(0.7, 1.3), 0.5 + 1.1 * n.z, 2);
          const halo = g.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.r * 3.2);
          halo.addColorStop(0, rgba(alt, (dark ? 0.5 : 0.35) * n.z));
          halo.addColorStop(0.35, rgba(acc, (dark ? 0.28 : 0.2) * n.z));
          halo.addColorStop(1, rgba(acc, 0));
          g.fillStyle = halo;
          g.beginPath();
          g.arc(n.x, n.y, n.r * 3.2, 0, TAU);
          g.fill();
          g.fillStyle = rgba(mix(acc, alt, 0.5), (dark ? 0.65 : 0.45) * n.z);
          g.beginPath();
          g.arc(n.x, n.y, n.r * 0.75, 0, TAU);
          g.fill();
        }
      });
      motes = Array.from({ length: Math.round((W * H) / 16000) }, () => ({
        x: rand(0, W),
        y: rand(0, H),
        r: rand(0.4, 1.5),
        vy: rand(-6, -1.5),
        vx: rand(-2, 2),
        ph: rand(0, TAU),
      }));
      pulses = [];
    };

    const fire = (i: number) => {
      const n = neurons[i];
      if (n.rest > 0) return;
      n.glow = 1;
      n.rest = rand(2.2, 4);
      n.next = rand(9, 22);
      for (const e of n.out) if (pulses.length < 160) pulses.push({ e, d: 0, v: rand(80, 150) * (0.6 + 0.4 * n.z) });
    };

    const helix = (time: number, ox: number, oy: number) => {
      // A double helix lying diagonally across the screen, slowly turning.
      const len = Math.hypot(W, H) * 1.1;
      const ang = -0.52;
      const cx = W * 0.5 + ox * 0.3;
      const cy = H * 0.55 + oy * 0.3;
      const ux = Math.cos(ang);
      const uy = Math.sin(ang);
      const amp = Math.min(W, H) * 0.075;
      const steps = 70;
      const phase = time * 0.25;
      const pts: { a: Pt; b: Pt; za: number; zb: number }[] = [];
      for (let i = 0; i <= steps; i++) {
        const s = (i / steps - 0.5) * len;
        const th = i * 0.34 + phase;
        const bx = cx + ux * s;
        const by = cy + uy * s;
        const sa = Math.sin(th);
        const sb = Math.sin(th + Math.PI);
        pts.push({
          a: { x: bx - uy * sa * amp, y: by + ux * sa * amp },
          b: { x: bx - uy * sb * amp, y: by + ux * sb * amp },
          za: (Math.cos(th) + 1) / 2,
          zb: (Math.cos(th + Math.PI) + 1) / 2,
        });
      }
      const base = dark ? 0.1 : 0.08;
      ctx.lineWidth = 1;
      pts.forEach((p, i) => {
        if (i % 2 === 0) {
          ctx.strokeStyle = rgba(alt, base * 0.7);
          ctx.beginPath();
          ctx.moveTo(p.a.x, p.a.y);
          ctx.lineTo(p.b.x, p.b.y);
          ctx.stroke();
        }
        for (const [q, z] of [
          [p.a, p.za],
          [p.b, p.zb],
        ] as const) {
          ctx.fillStyle = rgba(z > 0.5 ? alt : acc, base * (0.6 + z * 1.6));
          ctx.beginPath();
          ctx.arc(q.x, q.y, 1.2 + z * 2.2, 0, TAU);
          ctx.fill();
        }
      });
    };

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const time = (now - t0) / 1000;
      mouse.x += (mouse.tx - mouse.x) * 0.03;
      mouse.y += (mouse.ty - mouse.y) * 0.03;
      // Slow breathing drift plus a touch of pointer parallax.
      const ox = Math.sin(time * 0.05) * 14 + mouse.x * 10;
      const oy = Math.cos(time * 0.04) * 10 + mouse.y * 8;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      ctx.globalCompositeOperation = "source-over";
      helix(time, ox, oy);
      ctx.drawImage(layers[0], -40 + ox * 0.45, -40 + oy * 0.45, W + 80, H + 80);
      ctx.drawImage(layers[1], -40 + ox, -40 + oy, W + 80, H + 80);

      ctx.globalCompositeOperation = dark ? "lighter" : "source-over";
      // Plasma specks.
      for (const m of motes) {
        m.y += m.vy * dt;
        m.x += m.vx * dt;
        if (m.y < -5) m.y = H + 5;
        if (m.x < -5) m.x = W + 5;
        if (m.x > W + 5) m.x = -5;
        const tw = 0.5 + 0.5 * Math.sin(time * 1.3 + m.ph);
        ctx.fillStyle = rgba(alt, (dark ? 0.35 : 0.25) * tw);
        ctx.beginPath();
        ctx.arc(m.x + ox * 0.6, m.y + oy * 0.6, m.r, 0, TAU);
        ctx.fill();
      }

      // Neurons: spontaneous firing and decaying glow.
      neurons.forEach((n, i) => {
        n.rest -= dt;
        n.next -= dt;
        if (n.next <= 0) fire(i);
        if (n.glow > 0.01) {
          const par = n.z >= 0.68 ? 1 : 0.45;
          const x = n.x + ox * par;
          const y = n.y + oy * par;
          const R = n.r * (4 + 6 * n.glow);
          const grad = ctx.createRadialGradient(x, y, 0, x, y, R);
          grad.addColorStop(0, rgba(alt, 0.85 * n.glow * n.z));
          grad.addColorStop(0.25, rgba(acc, 0.5 * n.glow * n.z));
          grad.addColorStop(1, rgba(acc, 0));
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(x, y, R, 0, TAU);
          ctx.fill();
          n.glow *= Math.pow(0.12, dt);
        }
      });

      // Action potentials travelling down axons, with a fading tail.
      const arrived: number[] = [];
      pulses = pulses.filter((p) => {
        const e = edges[p.e];
        p.d += p.v * dt;
        const a = neurons[e.a];
        const z = (a.z + neurons[e.b].z) / 2;
        const par = a.z >= 0.68 ? 1 : 0.45;
        for (let k = 6; k >= 0; k--) {
          const q = at(e, p.d - k * 7);
          const f = 1 - k / 7;
          ctx.fillStyle = rgba(k ? acc : alt, (k ? 0.35 : 0.95) * f * z);
          ctx.beginPath();
          ctx.arc(q.x + ox * par, q.y + oy * par, (k ? 1.4 : 2.1) * (0.6 + z * 0.6), 0, TAU);
          ctx.fill();
        }
        if (p.d >= e.len) {
          arrived.push(e.b);
          return false;
        }
        return true;
      });
      for (const b of arrived) if (Math.random() < 0.5) fire(b);

      ctx.globalCompositeOperation = "source-over";
      raf = requestAnimationFrame(frame);
    };

    const start = () => {
      cancelAnimationFrame(raf);
      last = performance.now();
      if (still || reduce.matches) {
        // One still frame: wiring and helix, nothing moving.
        frame(last);
        cancelAnimationFrame(raf);
      } else raf = requestAnimationFrame(frame);
    };

    readColors();
    build();
    start();

    let resizeT: ReturnType<typeof setTimeout>;
    const onResize = () => {
      clearTimeout(resizeT);
      resizeT = setTimeout(() => {
        build();
        start();
      }, 150);
    };
    const onMove = (e: MouseEvent) => {
      mouse.tx = e.clientX / W - 0.5;
      mouse.ty = e.clientY / H - 0.5;
    };
    // Stop drawing while minimised or hidden in the tray.
    const onVis = () => (document.hidden ? cancelAnimationFrame(raf) : start());
    // Re-colour when the theme or palette changes.
    const mo = new MutationObserver(() => {
      readColors();
      build();
      start();
    });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-palette"] });
    window.addEventListener("resize", onResize);
    window.addEventListener("mousemove", onMove);
    document.addEventListener("visibilitychange", onVis);
    reduce.addEventListener("change", start);
    return () => {
      cancelAnimationFrame(raf);
      mo.disconnect();
      window.removeEventListener("resize", onResize);
      window.removeEventListener("mousemove", onMove);
      document.removeEventListener("visibilitychange", onVis);
      reduce.removeEventListener("change", start);
    };
  }, [still]);

  return <canvas ref={ref} className="neural-canvas" aria-hidden />;
}
