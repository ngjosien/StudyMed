// Neurons that fire on their own: a firing cell flares and sends pulses down its axons,
// and the cells it reaches may fire in turn, so activity ripples across the screen.
import { drawLayer, layer, mix, nebula, rand, rgba, TAU, type Env, type Pt, type SceneFactory } from "./kit";

interface Neuron extends Pt {
  z: number;
  r: number;
  out: number[];
  glow: number;
  rest: number;
  next: number;
}
interface Edge {
  a: number;
  b: number;
  pts: Pt[];
  len: number;
}

function curve(a: Pt, b: Pt, bend: number, steps = 28) {
  const cx = (a.x + b.x) / 2 - (b.y - a.y) * bend;
  const cy = (a.y + b.y) / 2 + (b.x - a.x) * bend;
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

function dendrite(g: CanvasRenderingContext2D, x: number, y: number, ang: number, len: number, w: number, depth: number) {
  const bend = rand(-0.5, 0.5);
  const ex = x + Math.cos(ang) * len;
  const ey = y + Math.sin(ang) * len;
  g.lineWidth = w;
  g.beginPath();
  g.moveTo(x, y);
  g.quadraticCurveTo(x + Math.cos(ang + bend) * len * 0.55, y + Math.sin(ang + bend) * len * 0.55, ex, ey);
  g.stroke();
  if (depth > 0) {
    const n = Math.random() < 0.6 ? 2 : 1;
    for (let i = 0; i < n; i++) dendrite(g, ex, ey, ang + rand(-0.75, 0.75), len * rand(0.45, 0.7), w * 0.6, depth - 1);
  }
}

const NEAR = 0.68;

export const neurons: SceneFactory = (env: Env) => {
  const { W, H, dark, acc, alt } = env;
  const count = Math.round(Math.min(64, Math.max(24, (W * H) / 30000)));
  const cols = Math.ceil(Math.sqrt((count * W) / H));
  const rows = Math.ceil(count / cols);
  const cells: Neuron[] = [];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const z = rand(0.35, 1);
      cells.push({
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
  const edges: Edge[] = [];
  const maxD = Math.max(W, H) / 5.2;
  cells.forEach((n, i) => {
    const near = cells
      .map((m, j) => ({ j, d: Math.hypot(m.x - n.x, m.y - n.y) + Math.abs(m.z - n.z) * 160 }))
      .filter((o) => o.j !== i && o.d < maxD)
      .sort((a, b) => a.d - b.d)
      .slice(0, Math.random() < 0.5 ? 2 : 3);
    for (const { j } of near) {
      if (edges.some((e) => e.a === j && e.b === i)) continue;
      const { pts, len } = curve(n, cells[j], rand(-0.22, 0.22));
      n.out.push(edges.length);
      edges.push({ a: i, b: j, pts, len });
      cells[j].out.push(edges.length);
      edges.push({ a: j, b: i, pts: [...pts].reverse(), len });
    }
  });

  // The wiring is drawn once, into a far and a near layer.
  const layers = [layer(env), layer(env)];
  layers.forEach(({ g }, li) => {
    const inLayer = (n: Neuron) => (li === 0 ? n.z < NEAR : n.z >= NEAR);
    if (li === 0) nebula(g, env);
    for (const e of edges) {
      const a = cells[e.a];
      if (!inLayer(a) || e.a > e.b) continue;
      const z = (a.z + cells[e.b].z) / 2;
      g.strokeStyle = rgba(mix(acc, alt, 0.35), (dark ? 0.22 : 0.13) * z);
      g.lineWidth = 0.6 + 0.7 * z;
      g.beginPath();
      e.pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
      g.stroke();
    }
    for (const n of cells) {
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

  const motes = Array.from({ length: Math.round((W * H) / 16000) }, () => ({
    x: rand(0, W),
    y: rand(0, H),
    r: rand(0.4, 1.5),
    vy: rand(-6, -1.5),
    vx: rand(-2, 2),
    ph: rand(0, TAU),
  }));
  let pulses: { e: number; d: number; v: number }[] = [];

  const fire = (i: number) => {
    const n = cells[i];
    if (n.rest > 0) return;
    n.glow = 1;
    n.rest = rand(2.2, 4);
    n.next = rand(9, 22);
    for (const e of n.out) if (pulses.length < 160) pulses.push({ e, d: 0, v: rand(80, 150) * (0.6 + 0.4 * n.z) });
  };

  return {
    frame(ctx, time, dt, ox, oy) {
      drawLayer(ctx, layers[0], env, ox * 0.45, oy * 0.45);
      drawLayer(ctx, layers[1], env, ox, oy);
      ctx.globalCompositeOperation = dark ? "lighter" : "source-over";
      for (const m of motes) {
        m.y += m.vy * dt;
        m.x += m.vx * dt;
        if (m.y < -5) m.y = H + 5;
        if (m.x < -5) m.x = W + 5;
        if (m.x > W + 5) m.x = -5;
        ctx.fillStyle = rgba(alt, (dark ? 0.35 : 0.25) * (0.5 + 0.5 * Math.sin(time * 1.3 + m.ph)));
        ctx.beginPath();
        ctx.arc(m.x + ox * 0.6, m.y + oy * 0.6, m.r, 0, TAU);
        ctx.fill();
      }
      cells.forEach((n, i) => {
        n.rest -= dt;
        n.next -= dt;
        if (dt && n.next <= 0) fire(i);
        if (n.glow > 0.01) {
          const par = n.z >= NEAR ? 1 : 0.45;
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
      const arrived: number[] = [];
      pulses = pulses.filter((p) => {
        const e = edges[p.e];
        p.d += p.v * dt;
        const a = cells[e.a];
        const z = (a.z + cells[e.b].z) / 2;
        const par = a.z >= NEAR ? 1 : 0.45;
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
    },
  };
};
