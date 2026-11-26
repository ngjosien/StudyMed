// The bronchial tree, drawn like an anatomy plate: the trachea with its cartilage
// rings splits into the bronchi, which branch again and again down to clusters of
// alveoli. The whole tree breathes slowly, and air drifts down the airways on
// each breath in, lighting the alveoli it reaches.
import { mix, nebula, rand, rgba, TAU, type Env, type Pt, type SceneFactory } from "./kit";

interface Seg {
  a: Pt;
  b: Pt;
  c: Pt; // control point
  w: number;
  depth: number;
  parent: number;
  tip: boolean;
}

const BREATH = 6.5; // seconds per breath

const bez = (s: Seg, t: number): Pt => {
  const u = 1 - t;
  return { x: u * u * s.a.x + 2 * u * t * s.c.x + t * t * s.b.x, y: u * u * s.a.y + 2 * u * t * s.c.y + t * t * s.b.y };
};

export const bronchi: SceneFactory = (env: Env) => {
  const { W, H, dark, acc, alt } = env;
  const S = Math.min(W * 0.62, H * 1.05);
  const maxDepth = W * H > 1.6e6 ? 9 : 8;
  const segs: Seg[] = [];

  const grow = (a: Pt, ang: number, len: number, w: number, depth: number, parent: number) => {
    const b = { x: a.x + Math.cos(ang) * len, y: a.y + Math.sin(ang) * len };
    const bend = rand(-0.18, 0.18) * len;
    const c = { x: (a.x + b.x) / 2 - Math.sin(ang) * bend, y: (a.y + b.y) / 2 + Math.cos(ang) * bend };
    const tip = depth >= maxDepth || len < 9;
    segs.push({ a, b, c, w, depth, parent, tip });
    const me = segs.length - 1;
    if (tip) return;
    // The two main bronchi spread wide; deeper splits are tighter and uneven.
    const spread = depth === 0 ? rand(0.62, 0.72) : rand(0.32, 0.55);
    const lean = rand(-0.12, 0.12);
    const k = depth === 0 ? 0.62 : rand(0.7, 0.82);
    grow(b, ang - spread + lean, len * k * rand(0.9, 1.08), w * 0.72, depth + 1, me);
    grow(b, ang + spread + lean, len * k * rand(0.9, 1.08), w * 0.72, depth + 1, me);
  };
  const carina = { x: W * 0.5, y: H * 0.3 };
  grow({ x: W * 0.5, y: -40 }, Math.PI / 2, carina.y + 40, Math.max(14, S * 0.05), 0, -1);
  // The first segment is the trachea; re-root the two main bronchi at the carina.
  segs[0].b = carina;
  segs[0].c = { x: W * 0.5, y: carina.y / 2 };

  const tips = segs.map((s, i) => (s.tip ? i : -1)).filter((i) => i >= 0);
  const alveoli = tips.map((i) => {
    const s = segs[i];
    const n = 4 + Math.floor(Math.random() * 4);
    return {
      seg: i,
      x: s.b.x,
      y: s.b.y,
      sacs: Array.from({ length: n }, () => ({ a: rand(0, TAU), d: rand(2, 7), r: rand(2.2, 4.6) })),
      glow: 0,
    };
  });

  // Draw the tree once onto an offscreen canvas.
  const c = document.createElement("canvas");
  c.width = W * env.dpr;
  c.height = H * env.dpr;
  const g = c.getContext("2d")!;
  g.scale(env.dpr, env.dpr);
  g.lineCap = "round";
  g.lineJoin = "round";
  nebula(g, env, 4, 1.1);
  const line = mix(acc, alt, 0.3);
  const lineA = dark ? 0.3 : 0.18;
  // Walls: a stroke, then the inside hollowed out, so each airway reads as a tube.
  const tube = document.createElement("canvas");
  tube.width = c.width;
  tube.height = c.height;
  const tg = tube.getContext("2d")!;
  tg.scale(env.dpr, env.dpr);
  tg.lineCap = "round";
  tg.lineJoin = "round";
  for (const s of segs) {
    tg.strokeStyle = rgba(line, 1);
    tg.lineWidth = s.w + 1.6;
    tg.beginPath();
    tg.moveTo(s.a.x, s.a.y);
    tg.quadraticCurveTo(s.c.x, s.c.y, s.b.x, s.b.y);
    tg.stroke();
  }
  tg.globalCompositeOperation = "destination-out";
  for (const s of segs) {
    if (s.w < 2.6) continue;
    tg.strokeStyle = "rgba(0,0,0,0.82)";
    tg.lineWidth = s.w - 0.4;
    tg.beginPath();
    tg.moveTo(s.a.x, s.a.y);
    tg.quadraticCurveTo(s.c.x, s.c.y, s.b.x, s.b.y);
    tg.stroke();
  }
  g.globalAlpha = lineA * 1.6;
  g.drawImage(tube, 0, 0, W, H);
  g.globalAlpha = 1;
  // Cartilage rings on the big airways.
  g.strokeStyle = rgba(line, lineA * 0.9);
  for (const s of segs) {
    if (s.depth > 2) continue;
    const n = Math.floor(Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y) / (s.w * 0.55));
    g.lineWidth = s.depth === 0 ? 1.4 : 1;
    for (let i = 1; i < n; i++) {
      const t = i / n;
      const p = bez(s, t);
      const q = bez(s, Math.min(1, t + 0.01));
      const ang = Math.atan2(q.y - p.y, q.x - p.x) + Math.PI / 2;
      const r = s.w * 0.42;
      g.beginPath();
      g.moveTo(p.x - Math.cos(ang) * r, p.y - Math.sin(ang) * r);
      g.quadraticCurveTo(p.x + Math.cos(ang - Math.PI / 2) * r * 0.25, p.y + Math.sin(ang - Math.PI / 2) * r * 0.25, p.x + Math.cos(ang) * r, p.y + Math.sin(ang) * r);
      g.stroke();
    }
  }
  // Alveolar sacs.
  for (const al of alveoli) {
    for (const sac of al.sacs) {
      const x = al.x + Math.cos(sac.a) * sac.d;
      const y = al.y + Math.sin(sac.a) * sac.d;
      g.strokeStyle = rgba(line, lineA);
      g.lineWidth = 0.7;
      g.beginPath();
      g.arc(x, y, sac.r, 0, TAU);
      g.stroke();
      g.fillStyle = rgba(acc, dark ? 0.05 : 0.04);
      g.fill();
    }
  }

  // Air: little motes that travel from the trachea down a random path to a tip.
  const route = (tip: number) => {
    const chain: number[] = [];
    for (let i = tip; i >= 0; i = segs[i].parent) chain.unshift(i);
    return chain;
  };
  let air: { chain: number[]; k: number; t: number; v: number; al: number }[] = [];
  const motes = Array.from({ length: Math.round((W * H) / 26000) }, () => ({ x: rand(0, W), y: rand(0, H), r: rand(0.4, 1.3), ph: rand(0, TAU), vy: rand(-5, -1) }));
  let lastPhase = 0;

  return {
    frame(ctx, time, dt, ox, oy) {
      const ph = (time % BREATH) / BREATH;
      const breath = 0.5 - 0.5 * Math.cos(ph * TAU); // 0 out .. 1 in
      const sc = 1 + breath * 0.014;
      ctx.save();
      ctx.translate(carina.x + ox * 0.6, carina.y + oy * 0.6);
      ctx.scale(sc, sc);
      ctx.translate(-carina.x, -carina.y);
      ctx.drawImage(c, 0, 0, W, H);
      ctx.globalCompositeOperation = dark ? "lighter" : "source-over";

      // Breathing in: send a puff of air down the tree.
      if (ph < 0.45 && dt && air.length < 70 && Math.random() < 0.55) {
        const al = Math.floor(Math.random() * alveoli.length);
        air.push({ chain: route(alveoli[al].seg), k: 0, t: 0, v: rand(1.6, 2.4), al });
      }
      if (ph < lastPhase) air = air.slice(-30);
      lastPhase = ph;
      air = air.filter((p) => {
        p.t += p.v * dt * (1.4 - p.k * 0.08);
        while (p.t >= 1 && p.k < p.chain.length - 1) {
          p.t -= 1;
          p.k++;
        }
        if (p.t >= 1) {
          alveoli[p.al].glow = 1;
          return false;
        }
        const q = bez(segs[p.chain[p.k]], p.t);
        ctx.fillStyle = rgba(alt, dark ? 0.75 : 0.5);
        ctx.beginPath();
        ctx.arc(q.x, q.y, 1.6, 0, TAU);
        ctx.fill();
        ctx.fillStyle = rgba(acc, dark ? 0.25 : 0.16);
        ctx.beginPath();
        ctx.arc(q.x, q.y, 4.5, 0, TAU);
        ctx.fill();
        return true;
      });
      for (const al of alveoli) {
        if (al.glow < 0.02) continue;
        const R = 16 * al.glow + 6;
        const grad = ctx.createRadialGradient(al.x, al.y, 0, al.x, al.y, R);
        grad.addColorStop(0, rgba(alt, 0.5 * al.glow));
        grad.addColorStop(0.4, rgba(acc, 0.3 * al.glow));
        grad.addColorStop(1, rgba(acc, 0));
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(al.x, al.y, R, 0, TAU);
        ctx.fill();
        al.glow *= Math.pow(0.25, dt);
      }
      ctx.restore();
      ctx.globalCompositeOperation = dark ? "lighter" : "source-over";
      for (const m of motes) {
        m.y += m.vy * dt;
        if (m.y < -4) m.y = H + 4;
        ctx.fillStyle = rgba(alt, (dark ? 0.3 : 0.2) * (0.5 + 0.5 * Math.sin(time * 1.1 + m.ph)));
        ctx.beginPath();
        ctx.arc(m.x + ox, m.y + oy, m.r, 0, TAU);
        ctx.fill();
      }
      ctx.globalCompositeOperation = "source-over";
    },
  };
};
