// Shared helpers for the background scenes.

export type RGB = [number, number, number];
export interface Pt {
  x: number;
  y: number;
}

/** What every scene gets: the screen size and the current palette. */
export interface Env {
  W: number;
  H: number;
  dpr: number;
  dark: boolean;
  /** Palette accent. */
  acc: RGB;
  /** The second light: ivory in the dark, ink on paper. */
  alt: RGB;
}

export interface Scene {
  /** Draws one frame. `ox`/`oy` is the parallax offset for the nearest layer. */
  frame(ctx: CanvasRenderingContext2D, time: number, dt: number, ox: number, oy: number): void;
  /** Resolves once anything the scene loads (an image) is in. */
  ready?: Promise<void>;
}
export type SceneFactory = (env: Env) => Scene;

export const TAU = Math.PI * 2;
export const rand = (a: number, b: number) => a + Math.random() * (b - a);
export const rgba = (c: RGB, a: number) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${Math.max(0, Math.min(1, a))})`;
export const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** Any CSS colour -> [r,g,b], using the canvas colour parser. */
export function rgb(color: string): RGB {
  const c = document.createElement("canvas").getContext("2d")!;
  c.fillStyle = "#000";
  c.fillStyle = color;
  const s = c.fillStyle as string;
  if (s.startsWith("#")) return [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
  const m = s.match(/[\d.]+/g)!;
  return [+m[0], +m[1], +m[2]];
}

/** An offscreen canvas the size of the screen plus a margin for parallax. */
export function layer(env: Env, margin = 40) {
  const c = document.createElement("canvas");
  c.width = (env.W + margin * 2) * env.dpr;
  c.height = (env.H + margin * 2) * env.dpr;
  const g = c.getContext("2d")!;
  g.setTransform(env.dpr, 0, 0, env.dpr, margin * env.dpr, margin * env.dpr);
  g.lineCap = "round";
  g.lineJoin = "round";
  return { c, g, margin };
}
export function drawLayer(ctx: CanvasRenderingContext2D, l: { c: HTMLCanvasElement; margin: number }, env: Env, ox: number, oy: number) {
  ctx.drawImage(l.c, -l.margin + ox, -l.margin + oy, env.W + l.margin * 2, env.H + l.margin * 2);
}

/** A few very large, faint glows of the palette, so the scene sits in a soft atmosphere. */
export function nebula(g: CanvasRenderingContext2D, env: Env, n = 4, strength = 1) {
  for (let k = 0; k < n; k++) {
    const x = rand(0, env.W);
    const y = rand(0, env.H);
    const r = rand(0.35, 0.6) * Math.max(env.W, env.H);
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, rgba(k % 2 ? env.alt : env.acc, (env.dark ? 0.07 : 0.06) * strength));
    grad.addColorStop(1, rgba(env.acc, 0));
    g.fillStyle = grad;
    g.fillRect(-40, -40, env.W + 80, env.H + 80);
  }
}
