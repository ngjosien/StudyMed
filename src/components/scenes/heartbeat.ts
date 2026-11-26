// Heartbeat: ECG traces on fine monitor paper, in one colour. Each lead is written by a
// bright pen that sweeps across and erases just ahead of itself, like a bedside monitor.
import { drawLayer, layer, mix, nebula, rgba, TAU, type Env, type SceneFactory } from "./kit";

const MONO = 'ui-monospace, "Cascadia Mono", Consolas, monospace';

/** One beat (0..1) of a lead's waveform: P, QRS, T with lead-specific shape. */
function wave(p: number, shape: { q: number; r: number; s: number; t: number }) {
  const b = (c: number, w: number, h: number) => h * Math.exp(-(((p - c) / w) ** 2));
  return b(0.14, 0.035, 0.12) + b(0.3, 0.009, shape.q) + b(0.322, 0.011, shape.r) + b(0.346, 0.011, shape.s) + b(0.58, 0.055, shape.t);
}

export const heartbeat: SceneFactory = (env: Env) => {
  const { W, H, dark, acc, alt } = env;
  const ink = mix(acc, alt, dark ? 0.5 : 0.3);
  const paper = layer(env);
  const g = paper.g;
  nebula(g, env, 3, 0.8);
  // ECG paper: 1 mm squares, 5 mm squares heavier.
  const mm = Math.max(5, Math.round(Math.min(W, H) / 130));
  for (let x = -40, i = 0; x < W + 40; x += mm, i++) {
    g.strokeStyle = rgba(ink, i % 5 ? 0.035 : 0.08);
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(x + 0.5, -40);
    g.lineTo(x + 0.5, H + 40);
    g.stroke();
  }
  for (let y = -40, i = 0; y < H + 40; y += mm, i++) {
    g.strokeStyle = rgba(ink, i % 5 ? 0.035 : 0.08);
    g.beginPath();
    g.moveTo(-40, y + 0.5);
    g.lineTo(W + 40, y + 0.5);
    g.stroke();
  }

  const leads = [
    { name: "II", y: 0.26, amp: 0.065, z: 0.6, speed: 0.17, bpm: 68, shape: { q: -0.1, r: 1, s: -0.25, t: 0.3 } },
    { name: "V2", y: 0.56, amp: 0.085, z: 1, speed: 0.2, bpm: 68, shape: { q: -0.05, r: 0.6, s: -0.9, t: 0.42 } },
    { name: "aVR", y: 0.84, amp: 0.055, z: 0.45, speed: 0.16, bpm: 68, shape: { q: 0.08, r: -0.85, s: 0.15, t: -0.22 } },
  ];
  // Labels and a calibration pulse at the start of each lead.
  g.font = `600 10px ${MONO}`;
  g.textBaseline = "middle";
  for (const l of leads) {
    const y = l.y * H;
    const a = H * l.amp;
    g.fillStyle = rgba(ink, 0.4 + l.z * 0.2);
    g.fillText(l.name, 22, y - a * 0.9);
    g.strokeStyle = rgba(ink, 0.3 + l.z * 0.2);
    g.lineWidth = 1.2;
    g.beginPath();
    g.moveTo(14, y);
    g.lineTo(22, y);
    g.lineTo(22, y - a * 0.7);
    g.lineTo(32, y - a * 0.7);
    g.lineTo(32, y);
    g.lineTo(40, y);
    g.stroke();
  }
  g.fillStyle = rgba(ink, dark ? 0.45 : 0.4);
  g.textAlign = "right";
  g.fillText("25 MM/S · 10 MM/MV", W - 24, H - 22);

  const x0 = 46;
  const span = W - x0 - 20;

  return {
    frame(ctx, time, _dt, ox, oy) {
      drawLayer(ctx, paper, env, ox * 0.2, oy * 0.2);
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      for (const l of leads) {
        const par = 0.2 + l.z * 0.5;
        const y0 = l.y * H + oy * par;
        const a = H * l.amp;
        const pxPerSec = span * l.speed;
        const pen = (time * pxPerSec) % span;
        const gap = 26;
        const beatAt = (x: number) => {
          // Time at which the pen wrote column x most recently.
          const age = (pen - x + span) % span;
          const t = time - age / pxPerSec;
          return wave(((t * l.bpm) / 60) % 1, l.shape);
        };
        // Glow pass, then the crisp line.
        for (const pass of [0, 1]) {
          ctx.strokeStyle = pass ? rgba(mix(ink, alt, 0.3), (dark ? 0.42 : 0.34) * (0.5 + l.z * 0.5)) : rgba(acc, (dark ? 0.1 : 0.05) * l.z);
          ctx.lineWidth = pass ? 0.9 + l.z * 0.5 : 5 * l.z;
          ctx.beginPath();
          let drawing = false;
          for (let x = 0; x <= span; x += 1.5) {
            const ahead = (x - pen + span) % span;
            if (ahead > 0 && ahead < gap) {
              drawing = false;
              continue;
            }
            const px = x0 + x + ox * par;
            const py = y0 - beatAt(x) * a;
            if (!drawing) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
            drawing = true;
          }
          ctx.stroke();
        }
        // The pen.
        const px = x0 + pen + ox * par;
        const py = y0 - beatAt(pen) * a;
        ctx.globalCompositeOperation = dark ? "lighter" : "source-over";
        const gl = ctx.createRadialGradient(px, py, 0, px, py, 14);
        gl.addColorStop(0, rgba(alt, 0.55 * l.z));
        gl.addColorStop(1, rgba(acc, 0));
        ctx.fillStyle = gl;
        ctx.beginPath();
        ctx.arc(px, py, 14, 0, TAU);
        ctx.fill();
        ctx.globalCompositeOperation = "source-over";
      }
      // Heart rate readout that blinks with each beat.
      const p = ((time * 68) / 60) % 1;
      const blink = Math.exp(-(((p - 0.33) / 0.06) ** 2));
      ctx.font = `600 11px ${MONO}`;
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      ctx.fillStyle = rgba(ink, dark ? 0.5 : 0.42);
      ctx.fillText("HR 68", W - 40 + ox * 0.2, 30 + oy * 0.2);
      ctx.fillStyle = rgba(alt, 0.25 + blink * 0.6);
      ctx.beginPath();
      ctx.arc(W - 28 + ox * 0.2, 30 + oy * 0.2, 3.2, 0, TAU);
      ctx.fill();
      ctx.textAlign = "left";
    },
  };
};
