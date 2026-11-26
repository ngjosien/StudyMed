// A capillary bed: an arteriole comes in on one side and splits into a fine mesh of
// capillaries that gather again into a venule. Red cells squeeze through in single
// file, always drifting from the arteriole towards the venule.
import { drawLayer, layer, mix, nebula, rand, rgba, TAU, type Env, type Pt, type SceneFactory } from "./kit";

interface Edge {
  a: number;
  b: number;
  pts: Pt[];
  len: number;
  w: number;
}

function curve(a: Pt, b: Pt, bend: number, steps = 14) {
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
const at = (e: Edge, d: number): Pt & { ang: number } => {
  const f = Math.max(0, Math.min(1, d / e.len)) * (e.pts.length - 1);
  const i = Math.min(e.pts.length - 2, Math.floor(f));
  const t = f - i;
  const p = e.pts[i];
  const q = e.pts[i + 1];
  return { x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t, ang: Math.atan2(q.y - p.y, q.x - p.x) };
};

export const capillaries: SceneFactory = (env: Env) => {
  const { W, H, dark, acc, alt } = env;
  const step = Math.max(58, Math.min(W, H) / 9);
  const cols = Math.ceil(W / step) + 2;
  const rows = Math.ceil(H / step) + 2;
  // A jittered grid of junctions.
  const nodes: Pt[] = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) nodes.push({ x: (c - 0.5 + rand(-0.32, 0.32)) * step, y: (r - 0.5 + rand(-0.32, 0.32)) * step });
  const id = (c: number, r: number) => r * cols + c;
  const edges: Edge[] = [];
  const out: number[][] = nodes.map(() => []);
  const link = (a: number, b: number, w: number) => {
    // Edges always point downstream (left to right, roughly), so cells flow one way.
    const [s, t] = nodes[a].x <= nodes[b].x ? [a, b] : [b, a];
    const { pts, len } = curve(nodes[s], nodes[t], rand(-0.25, 0.25));
    out[s].push(edges.length);
    edges.push({ a: s, b: t, pts, len, w });
  };
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      if (c < cols - 1) link(id(c, r), id(c + 1, r), rand(1.4, 2.4));
      if (r < rows - 1 && Math.random() < 0.62) link(id(c, r), id(c + (Math.random() < 0.5 ? 1 : 0), r + 1), rand(1.2, 2));
    }

  // Two larger vessels: an arteriole and a venule, winding across the screen.
  const vessel = (y0: number, wob: number) => {
    const pts: Pt[] = [];
    for (let i = 0; i <= 40; i++) {
      const x = (i / 40) * (W + 120) - 60;
      pts.push({ x, y: y0 + Math.sin(i * 0.33 + wob) * H * 0.06 + Math.sin(i * 0.11 + wob * 2) * H * 0.05 });
    }
    return pts;
  };
  const arteriole = vessel(H * 0.28, rand(0, TAU));
  const venule = vessel(H * 0.74, rand(0, TAU));

  const l = layer(env);
  const g = l.g;
  nebula(g, env, 4, 1.1);
  const line = mix(acc, alt, 0.3);
  for (const e of edges) {
    g.strokeStyle = rgba(line, dark ? 0.24 : 0.14);
    g.lineWidth = e.w + 1.4;
    g.beginPath();
    e.pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
    g.stroke();
    g.strokeStyle = rgba(acc, dark ? 0.06 : 0.05);
    g.lineWidth = e.w;
    g.stroke();
  }
  const bigVessel = (pts: Pt[], w: number) => {
    const trace = () => {
      g.beginPath();
      pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
    };
    trace();
    g.strokeStyle = rgba(line, dark ? 0.3 : 0.18);
    g.lineWidth = w + 2;
    g.stroke();
    g.strokeStyle = rgba(acc, dark ? 0.08 : 0.06);
    g.lineWidth = w;
    g.stroke();
    // Smooth muscle bands across the wall.
    g.strokeStyle = rgba(line, dark ? 0.18 : 0.1);
    g.lineWidth = 0.8;
    for (let i = 1; i < pts.length; i += 1) {
      const p = pts[i];
      const q = pts[i - 1];
      const a = Math.atan2(p.y - q.y, p.x - q.x) + Math.PI / 2;
      g.beginPath();
      g.moveTo(p.x - Math.cos(a) * w * 0.55, p.y - Math.sin(a) * w * 0.55);
      g.lineTo(p.x + Math.cos(a) * w * 0.55, p.y + Math.sin(a) * w * 0.55);
      g.stroke();
    }
  };
  bigVessel(arteriole, Math.max(14, step * 0.22));
  bigVessel(venule, Math.max(18, step * 0.28));
  // Endothelial nuclei dotted along the capillaries.
  g.fillStyle = rgba(line, dark ? 0.28 : 0.16);
  for (const e of edges) {
    if (Math.random() < 0.5) continue;
    const p = at(e, e.len * rand(0.25, 0.75));
    g.beginPath();
    g.ellipse(p.x, p.y, 3.2, 1.4, p.ang, 0, TAU);
    g.fill();
  }

  // Red cells.
  const n = Math.round(Math.min(220, (W * H) / 9000));
  const cells = Array.from({ length: n }, () => {
    const e = Math.floor(Math.random() * edges.length);
    return { e, d: rand(0, edges[e].len), v: rand(22, 40), r: rand(3.2, 4.2), spin: rand(0, TAU) };
  });
  const big = [arteriole, venule].map((pts, k) => ({
    pts,
    cells: Array.from({ length: 26 }, () => ({ t: rand(0, 1), off: rand(-0.35, 0.35), v: rand(0.018, 0.03) * (k ? 0.8 : 1.1) })),
  }));
  const along = (pts: Pt[], t: number) => {
    const f = t * (pts.length - 1);
    const i = Math.min(pts.length - 2, Math.floor(f));
    const u = f - i;
    return { x: pts[i].x + (pts[i + 1].x - pts[i].x) * u, y: pts[i].y + (pts[i + 1].y - pts[i].y) * u, ang: Math.atan2(pts[i + 1].y - pts[i].y, pts[i + 1].x - pts[i].x) };
  };
  const rbc = (ctx: CanvasRenderingContext2D, x: number, y: number, r: number, ang: number) => {
    ctx.fillStyle = rgba(mix(acc, alt, 0.15), dark ? 0.7 : 0.5);
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * 0.62, ang, 0, TAU);
    ctx.fill();
    ctx.fillStyle = rgba(alt, dark ? 0.35 : 0.25);
    ctx.beginPath();
    ctx.ellipse(x, y, r * 0.42, r * 0.26, ang, 0, TAU);
    ctx.fill();
  };

  return {
    frame(ctx, time, dt, ox, oy) {
      drawLayer(ctx, l, env, ox, oy);
      ctx.globalCompositeOperation = dark ? "lighter" : "source-over";
      for (const c of cells) {
        c.d += c.v * dt;
        let e = edges[c.e];
        if (c.d >= e.len) {
          const next = out[e.b];
          c.d -= e.len;
          c.e = next.length ? next[Math.floor(Math.random() * next.length)] : Math.floor(Math.random() * edges.length);
          if (!next.length) c.d = 0;
          e = edges[c.e];
        }
        const p = at(e, c.d);
        // Squeezed a little in the narrowest capillaries.
        rbc(ctx, p.x + ox, p.y + oy, c.r * (0.8 + e.w * 0.08), p.ang);
      }
      for (const v of big) {
        for (const c of v.cells) {
          c.t += c.v * dt;
          if (c.t > 1) c.t -= 1;
          const p = along(v.pts, c.t);
          const w = v === big[0] ? Math.max(14, step * 0.22) : Math.max(18, step * 0.28);
          const nx = -Math.sin(p.ang) * w * c.off;
          const ny = Math.cos(p.ang) * w * c.off;
          rbc(ctx, p.x + nx + ox, p.y + ny + oy, 3.6, p.ang + Math.sin(time + c.off * 9) * 0.4);
        }
      }
      ctx.globalCompositeOperation = "source-over";
    },
  };
};
