import { useEffect, useRef } from "react";
import { mix, rgb, type Env, type Scene, type SceneFactory } from "./scenes/kit";
import { neurons } from "./scenes/neurons";
import { xray } from "./scenes/xray";
import type { Factory3D, Scene3D } from "./scenes3d/common";

/*
 * The living background. 2D scenes draw on a canvas; the 3D ones (DNA, bloodstream) load
 * three.js only when chosen. This engine handles size, palette, parallax, pausing when the
 * window is hidden, and the animated/still switch.
 */

export const SCENES = [
  { id: "neurons", label: "Neurons" },
  { id: "dna", label: "DNA" },
  { id: "blood", label: "Bloodstream" },
  { id: "xray", label: "X-ray" },
  { id: "wash", label: "Plain" },
] as const;
export type SceneId = (typeof SCENES)[number]["id"];
type Drawn = Exclude<SceneId, "wash">;

const FLAT: Partial<Record<Drawn, SceneFactory>> = { neurons, xray };
const DEEP: Partial<Record<Drawn, () => Promise<Factory3D>>> = {
  dna: () => import("./scenes3d/dna").then((m) => m.dna3d),
  blood: () => import("./scenes3d/blood").then((m) => m.blood3d),
};

/** Settings from before the scenes were split ("neural", "still") map onto the new ones. */
export function normalizeScene(v: unknown): SceneId {
  if (v === "neural" || v === "still") return "neurons";
  return SCENES.some((s) => s.id === v) ? (v as SceneId) : "neurons";
}

function cssColor(name: string, fallback: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

function readEnv(): Env {
  const dark = document.documentElement.classList.contains("dark");
  const acc = rgb(cssColor("--accent", "#b05070"));
  const fg = rgb(cssColor("--fg", dark ? "#eee" : "#222"));
  return {
    W: window.innerWidth,
    H: window.innerHeight,
    dpr: Math.min(window.devicePixelRatio || 1, 1.5),
    dark,
    acc,
    alt: dark ? mix(fg, [255, 255, 255], 0.3) : mix(acc, fg, 0.45),
  };
}

export function SceneBackdrop({ scene, still }: { scene: Drawn; still: boolean }) {
  // A fresh canvas per scene: a canvas can't switch between 2D and WebGL.
  return <SceneCanvas key={scene} scene={scene} still={still} />;
}

function SceneCanvas({ scene, still }: { scene: Drawn; still: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current!;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
    const is3d = !!DEEP[scene];
    const ctx = is3d ? null : canvas.getContext("2d")!;
    let env = readEnv();
    let flat: Scene | null = null;
    let deep: Scene3D | null = null;
    let factory3d: Factory3D | null = null;
    let raf = 0;
    let alive = true;
    let last = performance.now();
    const t0 = last;
    // 3D scenes run at up to 40 fps; it's a background, and this keeps laptops cool.
    const minStep = is3d ? 1 / 40 : 0;

    const build = async () => {
      env = readEnv();
      if (is3d) {
        factory3d ??= await DEEP[scene]!();
        if (!alive) return;
        deep?.dispose();
        deep = factory3d(canvas, env);
      } else {
        canvas.width = env.W * env.dpr;
        canvas.height = env.H * env.dpr;
        flat = FLAT[scene]!(env);
        await flat.ready;
      }
    };

    const draw = (time: number, dt: number) => {
      mouse.x += (mouse.tx - mouse.x) * 0.03;
      mouse.y += (mouse.ty - mouse.y) * 0.03;
      const ox = Math.sin(time * 0.05) * 14 + mouse.x * 10;
      const oy = Math.cos(time * 0.04) * 10 + mouse.y * 8;
      if (deep) deep.frame(time, dt, ox, oy);
      else if (flat && ctx) {
        ctx.setTransform(env.dpr, 0, 0, env.dpr, 0, 0);
        ctx.globalCompositeOperation = "source-over";
        ctx.clearRect(0, 0, env.W, env.H);
        flat.frame(ctx, time, dt, ox, oy);
        ctx.globalCompositeOperation = "source-over";
      }
    };

    let acc = 0;
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      acc += dt;
      if (acc >= minStep) {
        draw((now - t0) / 1000, acc);
        acc = 0;
      }
      raf = requestAnimationFrame(loop);
    };

    const start = () => {
      cancelAnimationFrame(raf);
      if (!alive) return;
      if (still || reduce.matches) {
        // Run a few simulated seconds so the still frame looks alive, then stop.
        const steps = is3d ? 30 : 180;
        for (let i = 0; i < steps; i++) draw(i / 30 + 4, 1 / 30);
        return;
      }
      last = performance.now();
      raf = requestAnimationFrame(loop);
    };

    const rebuild = () => void build().then(start);
    rebuild();

    let resizeT: ReturnType<typeof setTimeout>;
    const onResize = () => {
      clearTimeout(resizeT);
      resizeT = setTimeout(() => {
        if (deep) {
          env = readEnv();
          deep.resize(env.W, env.H);
          start();
        } else rebuild();
      }, 150);
    };
    const onMove = (e: MouseEvent) => {
      mouse.tx = e.clientX / env.W - 0.5;
      mouse.ty = e.clientY / env.H - 0.5;
    };
    // Stop drawing while minimised or hidden in the tray.
    const onVis = () => (document.hidden ? cancelAnimationFrame(raf) : start());
    const mo = new MutationObserver(rebuild);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-palette"] });
    window.addEventListener("resize", onResize);
    if (!still) window.addEventListener("mousemove", onMove);
    document.addEventListener("visibilitychange", onVis);
    reduce.addEventListener("change", start);
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      clearTimeout(resizeT);
      mo.disconnect();
      deep?.dispose();
      window.removeEventListener("resize", onResize);
      window.removeEventListener("mousemove", onMove);
      document.removeEventListener("visibilitychange", onVis);
      reduce.removeEventListener("change", start);
    };
  }, [scene, still]);

  return <canvas ref={ref} className="neural-canvas" aria-hidden />;
}
