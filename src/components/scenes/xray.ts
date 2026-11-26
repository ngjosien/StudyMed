// X-ray blueprint: a real chest radiograph (CC0, Wikimedia Commons, "Chest Xray PA 3-8-2010"
// by Stillwaterising) on drafting paper, with anatomical callouts, a scan line sweeping the
// film, and an ECG strip whose beats make the heart shadow glow.
// Dark mode shows the film as it is; light mode shows it as a negative, like ink on paper.
import { drawLayer, layer, mix, nebula, rgba, TAU, type Env, type SceneFactory } from "./kit";

const MONO = 'ui-monospace, "Cascadia Mono", Consolas, monospace';
const SRC = "/scenes/chest-xray.jpg";
const IMG_W = 1500;
const IMG_H = 1216;

let image: Promise<HTMLImageElement> | null = null;
const loadImage = () =>
  (image ??= new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = rej;
    im.src = SRC;
  }));

/** Landmarks on the film, as fractions of its width/height. */
const MARKS: { x: number; y: number; text: string; side: -1 | 1; dy?: number }[] = [
  { x: 0.575, y: 0.33, text: "ARCUS AORTAE", side: 1 },
  { x: 0.64, y: 0.64, text: "COR", side: 1 },
];

/** One heartbeat (0..1) -> trace height: P, QRS, T. */
function ecg(p: number) {
  const bump = (c: number, w: number, h: number) => h * Math.exp(-(((p - c) / w) ** 2));
  return bump(0.12, 0.035, 0.12) + bump(0.3, 0.008, -0.12) + bump(0.32, 0.012, 1) + bump(0.345, 0.01, -0.28) + bump(0.58, 0.06, 0.28);
}

export const xray: SceneFactory = (env: Env) => {
  const { W, H, dark, acc, alt } = env;
  const ink = dark ? mix(alt, [205, 228, 255], 0.3) : mix(acc, [18, 28, 58], 0.45);

  // Film placement: right of centre, as tall as the window allows.
  const fh = Math.min(H * 0.9, (W * 0.72 * IMG_H) / IMG_W);
  const fw = (fh * IMG_W) / IMG_H;
  const fx = W * 0.97 - fw;
  const fy = (H - fh) / 2;
  const P = (x: number, y: number) => ({ x: fx + x * fw, y: fy + y * fh });

  const paper = layer(env);
  const film = layer(env);
  const notes = layer(env);
  let filmReady = false;
  let bright: HTMLCanvasElement | null = null;

  // ---- Drafting paper.
  {
    const g = paper.g;
    nebula(g, env, 3, 0.7);
    const step = 24;
    g.lineWidth = 1;
    for (let x = -40, i = 0; x < W + 40; x += step, i++) {
      g.strokeStyle = rgba(ink, i % 5 ? 0.03 : 0.065);
      g.beginPath();
      g.moveTo(x + 0.5, -40);
      g.lineTo(x + 0.5, H + 40);
      g.stroke();
    }
    for (let y = -40, i = 0; y < H + 40; y += step, i++) {
      g.strokeStyle = rgba(ink, i % 5 ? 0.03 : 0.065);
      g.beginPath();
      g.moveTo(-40, y + 0.5);
      g.lineTo(W + 40, y + 0.5);
      g.stroke();
    }
    g.strokeStyle = rgba(ink, 0.22);
    for (const [x, y, dx, dy] of [
      [16, 16, 1, 1],
      [W - 16, 16, -1, 1],
      [16, H - 16, 1, -1],
      [W - 16, H - 16, -1, -1],
    ]) {
      g.beginPath();
      g.moveTo(x, y + dy * 18);
      g.lineTo(x, y);
      g.lineTo(x + dx * 18, y);
      g.stroke();
    }
  }

  // ---- Callouts, dimension line and title block.
  {
    const g = notes.g;
    g.font = `600 10px ${MONO}`;
    g.lineWidth = 1;
    for (const m of MARKS) {
      const p = P(m.x, m.y);
      const ly = p.y + (m.dy ?? 0) * fh;
      const lx = m.side < 0 ? Math.min(p.x - 60, fx + fw * 0.08) : Math.min(W - 150, Math.max(p.x + 60, fx + fw * 0.9));
      g.strokeStyle = rgba(ink, dark ? 0.42 : 0.38);
      g.beginPath();
      g.arc(p.x, p.y, 3, 0, TAU);
      g.stroke();
      g.beginPath();
      g.moveTo(p.x + m.side * 3, p.y);
      g.lineTo(lx, ly);
      g.lineTo(lx + m.side * 14, ly);
      g.stroke();
      g.fillStyle = rgba(ink, dark ? 0.62 : 0.55);
      g.textAlign = m.side < 0 ? "right" : "left";
      g.textBaseline = "middle";
      g.fillText(m.text, lx + m.side * 18, ly);
    }
    // Dimension line along the left of the film.
    const x = fx - 22;
    const a = P(0, 0.17).y;
    const b = P(0, 0.82).y;
    g.strokeStyle = rgba(ink, dark ? 0.3 : 0.28);
    g.beginPath();
    g.moveTo(x, a);
    g.lineTo(x, b);
    for (const yy of [a, b]) {
      g.moveTo(x - 6, yy);
      g.lineTo(x + 6, yy);
    }
    for (let i = 1; i < 20; i++) {
      const yy = a + ((b - a) * i) / 20;
      g.moveTo(x - (i % 5 ? 2.5 : 5), yy);
      g.lineTo(x, yy);
    }
    g.stroke();
    g.save();
    g.translate(x - 12, (a + b) / 2);
    g.rotate(-Math.PI / 2);
    g.textAlign = "center";
    g.fillStyle = rgba(ink, dark ? 0.5 : 0.45);
    g.fillText("268 MM", 0, 0);
    g.restore();
    // Title block.
    const bw = 236;
    const bh = 64;
    const bx = W - bw - 30;
    const by = H - bh - 26;
    g.fillStyle = rgba(dark ? [10, 10, 14] : [255, 255, 255], dark ? 0.35 : 0.45);
    g.fillRect(bx, by, bw, bh);
    g.strokeStyle = rgba(ink, dark ? 0.3 : 0.28);
    g.strokeRect(bx + 0.5, by + 0.5, bw, bh);
    g.beginPath();
    g.moveTo(bx, by + 24.5);
    g.lineTo(bx + bw, by + 24.5);
    g.moveTo(bx + 146.5, by + 24);
    g.lineTo(bx + 146.5, by + bh);
    g.stroke();
    g.textAlign = "left";
    g.textBaseline = "middle";
    g.fillStyle = rgba(ink, dark ? 0.6 : 0.55);
    g.font = `700 10px ${MONO}`;
    g.fillText("STUDYMED · RADIOGRAPHIC STUDY", bx + 10, by + 12);
    g.font = `500 9px ${MONO}`;
    g.fillText("THORAX, PA ERECT", bx + 10, by + 38);
    g.fillText("FIG. 01 · NORMAL", bx + 10, by + 52);
    g.fillText("KV 120 · MAS 2", bx + 156, by + 38);
    g.fillText("SHEET 1/1", bx + 156, by + 52);
  }

  const ready = loadImage().then((im) => {
    // The film, tinted to the palette and feathered into the paper.
    const make = (strength: number) => {
      const c = document.createElement("canvas");
      c.width = Math.round(fw * env.dpr);
      c.height = Math.round(fh * env.dpr);
      const g = c.getContext("2d")!;
      g.filter = dark ? "contrast(1.15) brightness(1.05)" : "invert(1) contrast(1.2)";
      g.drawImage(im, 0, 0, c.width, c.height);
      g.filter = "none";
      // Cover the film's side marker (top right) so only anatomy shows.
      {
        const mx = c.width * 0.86;
        const my = c.height * 0.05;
        const mr = c.width * 0.09;
        const rg = g.createRadialGradient(mx, my, mr * 0.35, mx, my, mr);
        rg.addColorStop(0, dark ? "rgba(0,0,0,1)" : "rgba(255,255,255,1)");
        rg.addColorStop(1, dark ? "rgba(0,0,0,0)" : "rgba(255,255,255,0)");
        g.fillStyle = rg;
        g.fillRect(mx - mr, 0, mr * 2, my + mr);
      }
      g.globalCompositeOperation = "multiply";
      g.fillStyle = rgba(mix(ink, [255, 255, 255], dark ? 0.15 : 0.35), 1);
      g.fillRect(0, 0, c.width, c.height);
      // Feather the edges.
      g.globalCompositeOperation = "destination-in";
      const fade = (x0: number, y0: number, x1: number, y1: number) => {
        const lg = g.createLinearGradient(x0, y0, x1, y1);
        lg.addColorStop(0, "rgba(0,0,0,0)");
        lg.addColorStop(1, `rgba(0,0,0,${strength})`);
        return lg;
      };
      const e = Math.round(c.width * 0.08);
      const tmp = document.createElement("canvas");
      tmp.width = c.width;
      tmp.height = c.height;
      const t = tmp.getContext("2d")!;
      t.fillStyle = `rgba(0,0,0,${strength})`;
      t.fillRect(0, 0, c.width, c.height);
      t.globalCompositeOperation = "destination-in";
      t.fillStyle = fade(0, 0, e, 0);
      t.fillRect(0, 0, c.width, c.height);
      t.fillStyle = fade(c.width, 0, c.width - e, 0);
      t.fillRect(0, 0, c.width, c.height);
      t.fillStyle = fade(0, 0, 0, e);
      t.fillRect(0, 0, c.width, c.height);
      t.fillStyle = fade(0, c.height, 0, c.height - e);
      t.fillRect(0, 0, c.width, c.height);
      g.drawImage(tmp, 0, 0);
      return c;
    };
    const base = make(1);
    film.g.globalAlpha = dark ? 0.92 : 0.72;
    film.g.globalCompositeOperation = dark ? "screen" : "multiply";
    film.g.drawImage(base, fx, fy, fw, fh);
    bright = make(1);
    filmReady = true;
  });

  const ecgW = Math.min(360, W * 0.26);
  const ecgX0 = Math.max(W * 0.3, fx - 40);
  const ecgY = H - 58;
  const BPM = 66;
  const heart = P(0.6, 0.6);

  return {
    ready: ready.then(() => undefined),
    frame(ctx, time, _dt, ox, oy) {
      drawLayer(ctx, paper, env, ox * 0.2, oy * 0.2);
      if (filmReady) drawLayer(ctx, film, env, ox * 0.55, oy * 0.55);

      const p = ((time * BPM) / 60) % 1;
      const pump = Math.exp(-(((p - 0.36) / 0.09) ** 2));
      // Heart shadow glows a little on each beat.
      const hx = heart.x + ox * 0.55;
      const hy = heart.y + oy * 0.55;
      const r = fh * 0.2;
      const grad = ctx.createRadialGradient(hx, hy, 0, hx, hy, r);
      grad.addColorStop(0, rgba(acc, (dark ? 0.16 : 0.1) * pump));
      grad.addColorStop(1, rgba(acc, 0));
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(hx, hy, r, 0, TAU);
      ctx.fill();

      // Scan line: the band it passes over is shown brighter, as if being read.
      if (bright) {
        const span = fh + 160;
        const sy = fy - 80 + ((time * 50) % span);
        const band = 70;
        ctx.save();
        ctx.beginPath();
        ctx.rect(fx + ox * 0.55, sy - band + oy * 0.55, fw, band);
        ctx.clip();
        ctx.globalAlpha = dark ? 0.35 : 0.25;
        ctx.globalCompositeOperation = dark ? "lighter" : "multiply";
        ctx.drawImage(bright, fx + ox * 0.55, fy + oy * 0.55, fw, fh);
        ctx.restore();
        const lg = ctx.createLinearGradient(0, sy - band + oy * 0.55, 0, sy + oy * 0.55);
        lg.addColorStop(0, rgba(acc, 0));
        lg.addColorStop(1, rgba(mix(acc, ink, 0.5), dark ? 0.1 : 0.06));
        ctx.fillStyle = lg;
        ctx.fillRect(fx + ox * 0.55, sy - band + oy * 0.55, fw, band);
        ctx.fillStyle = rgba(ink, dark ? 0.5 : 0.35);
        ctx.fillRect(fx + fw * 0.04 + ox * 0.55, sy + oy * 0.55, fw * 0.92, 1);
      }

      drawLayer(ctx, notes, env, ox * 0.55, oy * 0.55);

      // ECG strip, written left to right and fading behind the pen.
      const pen = (time * 140) % ecgW;
      ctx.lineWidth = 1.5;
      ctx.globalCompositeOperation = dark ? "lighter" : "source-over";
      for (let x = 2; x < ecgW; x += 2) {
        const age = (pen - x + ecgW) % ecgW;
        if (age > ecgW * 0.85) continue;
        const v0 = ecg((((time - age / 140) * BPM) / 60) % 1);
        const v1 = ecg((((time - (age + 2) / 140) * BPM) / 60) % 1);
        ctx.strokeStyle = rgba(mix(acc, ink, 0.4), (dark ? 0.75 : 0.55) * (1 - age / (ecgW * 0.85)));
        ctx.beginPath();
        ctx.moveTo(ecgX0 + x - 2 + ox * 0.2, ecgY - v1 * 30 + oy * 0.2);
        ctx.lineTo(ecgX0 + x + ox * 0.2, ecgY - v0 * 30 + oy * 0.2);
        ctx.stroke();
      }
      ctx.fillStyle = rgba(ink, dark ? 0.9 : 0.65);
      ctx.beginPath();
      ctx.arc(ecgX0 + pen + ox * 0.2, ecgY - ecg(p) * 30 + oy * 0.2, 2.4, 0, TAU);
      ctx.fill();
      ctx.globalCompositeOperation = "source-over";
      ctx.font = `600 9px ${MONO}`;
      ctx.fillStyle = rgba(ink, dark ? 0.5 : 0.45);
      ctx.textAlign = "left";
      ctx.fillText(`LEAD II · ${BPM} BPM · 25 MM/S`, ecgX0 + ox * 0.2, ecgY + 24 + oy * 0.2);
    },
  };
};
