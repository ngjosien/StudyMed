// Cells under the microscope, drawn like a fine-line plate: membranes, nuclei with
// nucleoli and chromatin, mitochondria, ER and vesicles. They drift and turn slowly,
// a few are dividing, and now and then one lights up with a calcium flash.
import { drawLayer, layer, mix, nebula, rand, rgba, TAU, type Env, type SceneFactory } from "./kit";

interface Cell {
  x: number;
  y: number;
  z: number;
  r: number;
  rot: number;
  vr: number;
  vx: number;
  vy: number;
  sprite: HTMLCanvasElement;
  size: number;
  glow: number;
  next: number;
}

/** Smooth closed blob through n wobbly points. */
function blob(g: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number, wob: number[], rot = 0) {
  const n = wob.length;
  const pts = wob.map((w, i) => {
    const a = (i / n) * TAU;
    const x = Math.cos(a) * rx * w;
    const y = Math.sin(a) * ry * w;
    return { x: cx + x * Math.cos(rot) - y * Math.sin(rot), y: cy + x * Math.sin(rot) + y * Math.cos(rot) };
  });
  g.beginPath();
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % n];
    const mx = (p.x + q.x) / 2;
    const my = (p.y + q.y) / 2;
    if (i === 0) g.moveTo(mx, my);
    else g.quadraticCurveTo(p.x, p.y, mx, my);
  }
  const p0 = pts[0];
  const q0 = pts[1 % n];
  g.quadraticCurveTo(p0.x, p0.y, (p0.x + q0.x) / 2, (p0.y + q0.y) / 2);
  g.closePath();
}

const wobble = (n: number, amt: number) => Array.from({ length: n }, () => 1 + rand(-amt, amt));

function drawCell(env: Env, r: number, z: number, dividing: boolean): { c: HTMLCanvasElement; size: number } {
  const { dark, acc, alt } = env;
  const line = mix(acc, alt, 0.35);
  const size = Math.ceil(r * (dividing ? 4.6 : 2.8));
  const c = document.createElement("canvas");
  c.width = c.height = Math.ceil(size * env.dpr);
  const g = c.getContext("2d")!;
  g.scale(env.dpr, env.dpr);
  g.lineCap = "round";
  g.lineJoin = "round";
  const a = (dark ? 1 : 0.85) * (0.35 + z * 0.65);
  const mid = size / 2;

  const one = (cx: number, cy: number, rx: number, ry: number) => {
    const w = wobble(9, 0.07);
    // Cytoplasm: a faint fill, brighter towards the membrane.
    blob(g, cx, cy, rx, ry, w);
    const fill = g.createRadialGradient(cx, cy, 0, cx, cy, Math.max(rx, ry));
    fill.addColorStop(0, rgba(acc, 0.02 * a));
    fill.addColorStop(0.8, rgba(acc, 0.06 * a));
    fill.addColorStop(1, rgba(alt, 0.12 * a));
    g.fillStyle = fill;
    g.fill();
    // Membrane: a soft outer line and a fine inner one (the bilayer).
    g.strokeStyle = rgba(line, 0.22 * a);
    g.lineWidth = 3.2;
    g.stroke();
    g.strokeStyle = rgba(alt, 0.55 * a);
    g.lineWidth = 1;
    g.stroke();
    blob(g, cx, cy, rx * 0.95, ry * 0.95, w);
    g.strokeStyle = rgba(line, 0.25 * a);
    g.lineWidth = 0.6;
    g.stroke();

    // Nucleus, off-centre.
    const nx = cx + rand(-0.12, 0.12) * rx;
    const ny = cy + rand(-0.12, 0.12) * ry;
    const nr = Math.min(rx, ry) * rand(0.34, 0.42);
    const nw = wobble(7, 0.05);
    blob(g, nx, ny, nr, nr * rand(0.85, 1), nw, rand(0, TAU));
    g.fillStyle = rgba(acc, 0.1 * a);
    g.fill();
    g.strokeStyle = rgba(alt, 0.5 * a);
    g.lineWidth = 1.1;
    g.stroke();
    // Nuclear envelope pores: a dotted second line.
    g.setLineDash([1.2, 3]);
    blob(g, nx, ny, nr * 1.12, nr * 1.12 * 0.95, nw);
    g.strokeStyle = rgba(line, 0.35 * a);
    g.lineWidth = 0.8;
    g.stroke();
    g.setLineDash([]);
    // Chromatin specks and a nucleolus.
    for (let i = 0; i < nr * 1.2; i++) {
      const t = rand(0, TAU);
      const d = Math.sqrt(Math.random()) * nr * 0.85;
      g.fillStyle = rgba(alt, rand(0.15, 0.45) * a);
      g.beginPath();
      g.arc(nx + Math.cos(t) * d, ny + Math.sin(t) * d, rand(0.4, 1.1), 0, TAU);
      g.fill();
    }
    const nl = g.createRadialGradient(nx + nr * 0.2, ny - nr * 0.15, 0, nx + nr * 0.2, ny - nr * 0.15, nr * 0.32);
    nl.addColorStop(0, rgba(alt, 0.7 * a));
    nl.addColorStop(1, rgba(alt, 0));
    g.fillStyle = nl;
    g.beginPath();
    g.arc(nx + nr * 0.2, ny - nr * 0.15, nr * 0.32, 0, TAU);
    g.fill();

    // Rough ER: arcs wrapped around the nucleus, dotted with ribosomes.
    for (let k = 0; k < 3; k++) {
      const rr = nr * (1.35 + k * 0.22);
      const s = rand(0, TAU);
      const e = s + rand(0.8, 1.6);
      g.strokeStyle = rgba(line, 0.32 * a);
      g.lineWidth = 0.8;
      g.beginPath();
      g.arc(nx, ny, rr, s, e);
      g.stroke();
      for (let t = s; t < e; t += 0.18) {
        g.fillStyle = rgba(alt, 0.4 * a);
        g.beginPath();
        g.arc(nx + Math.cos(t) * (rr + 1.6), ny + Math.sin(t) * (rr + 1.6), 0.55, 0, TAU);
        g.fill();
      }
    }
    // Mitochondria: capsules with folded cristae.
    const mito = Math.round(rand(3, 6) * (r / 40));
    for (let i = 0; i < mito; i++) {
      const t = rand(0, TAU);
      const d = rand(0.55, 0.8);
      const mx = cx + Math.cos(t) * rx * d;
      const my = cy + Math.sin(t) * ry * d;
      const len = r * rand(0.16, 0.24);
      const wid = len * 0.42;
      g.save();
      g.translate(mx, my);
      g.rotate(t + Math.PI / 2 + rand(-0.4, 0.4));
      g.beginPath();
      g.roundRect(-len / 2, -wid / 2, len, wid, wid / 2);
      g.strokeStyle = rgba(alt, 0.5 * a);
      g.lineWidth = 0.9;
      g.stroke();
      g.beginPath();
      for (let k = 0; k <= 6; k++) {
        const x = -len / 2 + wid * 0.4 + (k / 6) * (len - wid * 0.8);
        g.lineTo(x, (k % 2 ? 1 : -1) * wid * 0.28);
      }
      g.strokeStyle = rgba(line, 0.4 * a);
      g.lineWidth = 0.6;
      g.stroke();
      g.restore();
    }
    // Vesicles.
    for (let i = 0; i < 8; i++) {
      const t = rand(0, TAU);
      const d = rand(0.3, 0.85);
      g.strokeStyle = rgba(line, 0.35 * a);
      g.lineWidth = 0.6;
      g.beginPath();
      g.arc(cx + Math.cos(t) * rx * d, cy + Math.sin(t) * ry * d, rand(1, 2.6), 0, TAU);
      g.stroke();
    }
  };

  if (dividing) {
    // Late telophase: two daughter cells still joined by a narrow bridge.
    const off = r * 0.95;
    one(mid - off, mid, r * 0.92, r * 0.86);
    one(mid + off, mid, r * 0.92, r * 0.86);
    g.strokeStyle = rgba(alt, 0.45 * a);
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(mid - r * 0.12, mid - r * 0.08);
    g.quadraticCurveTo(mid, mid - r * 0.02, mid + r * 0.12, mid - r * 0.08);
    g.moveTo(mid - r * 0.12, mid + r * 0.08);
    g.quadraticCurveTo(mid, mid + r * 0.02, mid + r * 0.12, mid + r * 0.08);
    g.stroke();
  } else one(mid, mid, r, r * rand(0.78, 0.95));
  return { c, size };
}

export const cells: SceneFactory = (env: Env) => {
  const { W, H, dark, acc, alt } = env;
  const S = Math.min(W, H);
  const back = layer(env);
  nebula(back.g, env, 4, 0.9);
  // A faint circular field stop, like the edge of a microscope's view.
  {
    const g = back.g;
    const R = Math.hypot(W, H) * 0.56;
    const vg = g.createRadialGradient(W / 2, H / 2, R * 0.6, W / 2, H / 2, R);
    vg.addColorStop(0, rgba(acc, 0));
    vg.addColorStop(1, rgba(dark ? [0, 0, 0] : acc, dark ? 0.35 : 0.06));
    g.fillStyle = vg;
    g.fillRect(-40, -40, W + 80, H + 80);
  }

  const count = Math.round(Math.min(30, Math.max(14, (W * H) / 60000)));
  const list: Cell[] = [];
  for (let i = 0; i < count; i++) {
    const z = Math.pow(Math.random(), 0.8) * 0.7 + 0.3;
    const r = S * rand(0.035, 0.07) * (0.55 + z * 0.6);
    const { c, size } = drawCell(env, r, z, Math.random() < 0.12);
    list.push({
      x: rand(-0.05, 1.05) * W,
      y: rand(-0.05, 1.05) * H,
      z,
      r,
      rot: rand(0, TAU),
      vr: rand(-0.03, 0.03),
      vx: rand(-4, 4) * z,
      vy: rand(-3, 3) * z,
      sprite: c,
      size,
      glow: 0,
      next: rand(2, 20),
    });
  }
  list.sort((a, b) => a.z - b.z);
  const specks = Array.from({ length: Math.round((W * H) / 14000) }, () => ({ x: rand(0, W), y: rand(0, H), r: rand(0.4, 1.3), ph: rand(0, TAU), v: rand(-3, 3) }));

  return {
    frame(ctx, time, dt, ox, oy) {
      drawLayer(ctx, back, env, ox * 0.3, oy * 0.3);
      for (const s of specks) {
        s.x += s.v * dt;
        if (s.x < -4) s.x = W + 4;
        if (s.x > W + 4) s.x = -4;
        ctx.fillStyle = rgba(alt, (dark ? 0.3 : 0.2) * (0.5 + 0.5 * Math.sin(time * 1.1 + s.ph)));
        ctx.beginPath();
        ctx.arc(s.x + ox * 0.4, s.y + oy * 0.4, s.r, 0, TAU);
        ctx.fill();
      }
      for (const c of list) {
        c.x += c.vx * dt;
        c.y += c.vy * dt;
        c.rot += c.vr * dt;
        const m = c.size / 2;
        if (c.x < -m) c.x = W + m;
        if (c.x > W + m) c.x = -m;
        if (c.y < -m) c.y = H + m;
        if (c.y > H + m) c.y = -m;
        c.next -= dt;
        if (dt && c.next <= 0) {
          c.glow = 1;
          c.next = rand(10, 28);
        }
        const x = c.x + ox * c.z;
        const y = c.y + oy * c.z;
        // Gentle breathing, so the cells feel alive.
        const s = 1 + Math.sin(time * 0.5 + c.rot * 3) * 0.015;
        if (c.glow > 0.01) {
          ctx.globalCompositeOperation = dark ? "lighter" : "source-over";
          const R = c.r * 1.6;
          const gl = ctx.createRadialGradient(x, y, 0, x, y, R);
          gl.addColorStop(0, rgba(alt, 0.3 * c.glow * c.z));
          gl.addColorStop(0.6, rgba(acc, 0.18 * c.glow * c.z));
          gl.addColorStop(1, rgba(acc, 0));
          ctx.fillStyle = gl;
          ctx.beginPath();
          ctx.arc(x, y, R, 0, TAU);
          ctx.fill();
          ctx.globalCompositeOperation = "source-over";
          c.glow *= Math.pow(0.25, dt);
        }
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(c.rot);
        ctx.scale(s, s);
        ctx.drawImage(c.sprite, -m, -m, c.size, c.size);
        ctx.restore();
      }
    },
  };
};
