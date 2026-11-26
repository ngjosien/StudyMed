// A histology slide: tissue seen down a microscope, drawn in one colour. Packed
// polygonal cells with nuclei and nucleoli, a band of wavy connective-tissue
// fibres and a small vessel. The slide drifts slowly under the lens, and now and
// then a nucleus brightens as that cell gets ready to divide.
import { drawLayer, layer, mix, nebula, rand, rgba, TAU, type Env, type Pt, type SceneFactory } from "./kit";

/** Clip a convex polygon to the half-plane closer to `p` than to `q`. */
function clip(poly: Pt[], p: Pt, q: Pt): Pt[] {
  const mx = (p.x + q.x) / 2;
  const my = (p.y + q.y) / 2;
  const nx = q.x - p.x;
  const ny = q.y - p.y;
  const side = (v: Pt) => (v.x - mx) * nx + (v.y - my) * ny; // < 0 = p's side
  const out: Pt[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const sa = side(a);
    const sb = side(b);
    if (sa <= 0) out.push(a);
    if (sa * sb < 0) {
      const t = sa / (sa - sb);
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }
  return out;
}

function roundedPoly(g: CanvasRenderingContext2D, pts: Pt[], shrink: number, c: Pt) {
  const p = pts.map((v) => ({ x: c.x + (v.x - c.x) * shrink, y: c.y + (v.y - c.y) * shrink }));
  g.beginPath();
  for (let i = 0; i < p.length; i++) {
    const a = p[i];
    const b = p[(i + 1) % p.length];
    const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    if (i === 0) g.moveTo(m.x, m.y);
    else g.quadraticCurveTo(a.x, a.y, m.x, m.y);
  }
  const a = p[0];
  const b = p[1 % p.length];
  g.quadraticCurveTo(a.x, a.y, (a.x + b.x) / 2, (a.y + b.y) / 2);
  g.closePath();
}

export const histology: SceneFactory = (env: Env) => {
  const { W, H, dark, acc, alt } = env;
  const line = mix(acc, alt, 0.3);
  const size = Math.max(44, Math.min(W, H) / 11);
  const M = 60;
  // A band of connective tissue runs diagonally; cells fill the rest.
  const band = (x: number, y: number) => {
    const d = (y - H * 0.62 - (x - W * 0.5) * -0.32) / H;
    return Math.abs(d + Math.sin(x / W * 5) * 0.03);
  };
  const seeds: (Pt & { z: number })[] = [];
  const cols = Math.ceil((W + M * 2) / size);
  const rows = Math.ceil((H + M * 2) / size);
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const x = -M + (c + 0.5 + (r % 2) * 0.5 + rand(-0.3, 0.3)) * size;
      const y = -M + (r + 0.5 + rand(-0.3, 0.3)) * size * 0.9;
      if (band(x, y) < 0.07) continue;
      seeds.push({ x, y, z: rand(0.5, 1) });
    }

  const l = layer(env, 40);
  const g = l.g;
  nebula(g, env, 4, 1);
  const nuclei: { x: number; y: number; r: number; rot: number; z: number; glow: number; next: number }[] = [];
  const R2 = (size * 2.2) ** 2;
  for (const s of seeds) {
    let poly: Pt[] = [
      { x: s.x - size * 1.6, y: s.y - size * 1.6 },
      { x: s.x + size * 1.6, y: s.y - size * 1.6 },
      { x: s.x + size * 1.6, y: s.y + size * 1.6 },
      { x: s.x - size * 1.6, y: s.y + size * 1.6 },
    ];
    for (const o of seeds) {
      if (o === s) continue;
      const dx = o.x - s.x;
      const dy = o.y - s.y;
      if (dx * dx + dy * dy > R2) continue;
      poly = clip(poly, s, o);
      if (poly.length < 3) break;
    }
    if (poly.length < 3) continue;
    // Cytoplasm, then the membrane.
    roundedPoly(g, poly, 0.93, s);
    g.fillStyle = rgba(acc, (dark ? 0.035 : 0.025) * s.z);
    g.fill();
    g.strokeStyle = rgba(line, (dark ? 0.24 : 0.13) * s.z);
    g.lineWidth = 0.9;
    g.stroke();
    // Granular cytoplasm.
    g.fillStyle = rgba(line, (dark ? 0.1 : 0.06) * s.z);
    for (let i = 0; i < 5; i++) {
      const a = rand(0, TAU);
      const d = rand(size * 0.22, size * 0.4);
      g.beginPath();
      g.arc(s.x + Math.cos(a) * d, s.y + Math.sin(a) * d, rand(0.5, 1.1), 0, TAU);
      g.fill();
    }
    const nr = size * rand(0.16, 0.22);
    const rot = rand(0, Math.PI);
    g.fillStyle = rgba(acc, (dark ? 0.18 : 0.11) * s.z);
    g.strokeStyle = rgba(line, (dark ? 0.32 : 0.18) * s.z);
    g.beginPath();
    g.ellipse(s.x, s.y, nr * 1.2, nr, rot, 0, TAU);
    g.fill();
    g.stroke();
    // Chromatin specks and a nucleolus.
    g.fillStyle = rgba(line, (dark ? 0.28 : 0.16) * s.z);
    for (let i = 0; i < 4; i++) {
      g.beginPath();
      g.arc(s.x + rand(-nr * 0.7, nr * 0.7), s.y + rand(-nr * 0.55, nr * 0.55), 0.7, 0, TAU);
      g.fill();
    }
    g.fillStyle = rgba(alt, (dark ? 0.4 : 0.22) * s.z);
    g.beginPath();
    g.arc(s.x + nr * 0.25, s.y - nr * 0.2, nr * 0.28, 0, TAU);
    g.fill();
    nuclei.push({ x: s.x, y: s.y, r: nr, rot, z: s.z, glow: 0, next: rand(2, 30) });
  }
  // Connective tissue: long wavy collagen fibres with the odd fibroblast nucleus.
  g.lineCap = "round";
  for (let k = 0; k < 26; k++) {
    const off = rand(-0.06, 0.06) * H;
    const ph = rand(0, TAU);
    g.strokeStyle = rgba(line, (dark ? 0.22 : 0.13) * rand(0.6, 1));
    g.lineWidth = rand(0.6, 1.6);
    g.beginPath();
    for (let x = -M; x <= W + M; x += 8) {
      const y = H * 0.62 + (x - W * 0.5) * -0.32 + off - Math.sin((x / W) * 5) * 0.03 * H + Math.sin(x / 26 + ph) * 3;
      if (x === -M) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();
  }
  g.fillStyle = rgba(acc, dark ? 0.32 : 0.2);
  for (let k = 0; k < 14; k++) {
    const x = rand(0, W);
    const y = H * 0.62 + (x - W * 0.5) * -0.32 - Math.sin((x / W) * 5) * 0.03 * H + rand(-0.05, 0.05) * H;
    g.beginPath();
    g.ellipse(x, y, 7, 1.8, Math.atan(-0.32), 0, TAU);
    g.fill();
  }
  // A small vessel in cross-section, with red cells inside.
  const vx = W * 0.8;
  const vy = H * 0.62 + (vx - W * 0.5) * -0.32 - Math.sin(4) * 0.03 * H;
  const vr = size * 1.1;
  g.strokeStyle = rgba(line, dark ? 0.4 : 0.24);
  g.lineWidth = 2.2;
  g.beginPath();
  g.ellipse(vx, vy, vr * 1.25, vr, -0.3, 0, TAU);
  g.stroke();
  g.lineWidth = 0.8;
  g.beginPath();
  g.ellipse(vx, vy, vr * 1.05, vr * 0.8, -0.3, 0, TAU);
  g.stroke();
  for (let i = 0; i < 6; i++) {
    g.fillStyle = rgba(acc, dark ? 0.4 : 0.26);
    g.beginPath();
    g.ellipse(vx + rand(-vr * 0.55, vr * 0.55), vy + rand(-vr * 0.4, vr * 0.4), 5, 3.2, rand(0, Math.PI), 0, TAU);
    g.fill();
  }

  // The lens: a soft circular field, a touch brighter in the middle.
  const lens = document.createElement("canvas");
  lens.width = W * env.dpr;
  lens.height = H * env.dpr;
  const lg = lens.getContext("2d")!;
  lg.scale(env.dpr, env.dpr);
  const R = Math.hypot(W, H) * 0.55;
  const grad = lg.createRadialGradient(W / 2, H / 2, R * 0.55, W / 2, H / 2, R);
  grad.addColorStop(0, rgba(acc, 0));
  grad.addColorStop(1, rgba(dark ? [0, 0, 0] : mix(acc, [255, 255, 255], 0.8), dark ? 0.35 : 0.25));
  lg.fillStyle = grad;
  lg.fillRect(0, 0, W, H);

  let dx = 0;
  let dy = 0;
  return {
    frame(ctx, time, dt, ox, oy) {
      // The slide drifts slowly under the lens.
      dx = Math.sin(time * 0.021) * 22;
      dy = Math.cos(time * 0.017) * 16;
      drawLayer(ctx, l, env, ox * 0.7 + dx, oy * 0.7 + dy);
      ctx.globalCompositeOperation = dark ? "lighter" : "source-over";
      for (const n of nuclei) {
        n.next -= dt;
        if (dt && n.next <= 0) {
          n.glow = 1;
          n.next = rand(25, 70);
        }
        if (n.glow < 0.02) continue;
        const x = n.x + ox * 0.7 + dx;
        const y = n.y + oy * 0.7 + dy;
        const r = n.r * (2.2 + 2 * n.glow);
        const gr = ctx.createRadialGradient(x, y, 0, x, y, r);
        gr.addColorStop(0, rgba(alt, 0.55 * n.glow * n.z));
        gr.addColorStop(0.35, rgba(acc, 0.3 * n.glow * n.z));
        gr.addColorStop(1, rgba(acc, 0));
        ctx.fillStyle = gr;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, TAU);
        ctx.fill();
        n.glow *= Math.pow(0.35, dt);
      }
      ctx.globalCompositeOperation = "source-over";
      ctx.drawImage(lens, 0, 0, W, H);
    },
  };
};
