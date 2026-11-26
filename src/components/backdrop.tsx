import { useEffect, useRef } from "react";
import { mix, rgb, type Env, type Scene, type SceneFactory } from "./scenes/kit";
import { neurons } from "./scenes/neurons";
import { xray } from "./scenes/xray";
import { cells } from "./scenes/cells";
import { heartbeat } from "./scenes/heartbeat";
import { bronchi } from "./scenes/bronchi";
import { capillaries } from "./scenes/capillaries";
import { histology } from "./scenes/histology";

/*
 * The living background: one-colour scenes drawn on a canvas. This engine handles size,
 * palette, parallax, pausing when the window is hidden, and the animated/still switch.
 */

export const SCENES = [
  { id: "neurons", label: "Neurons" },
  { id: "cells", label: "Cells" },
  { id: "heartbeat", label: "Heartbeat" },
  { id: "xray", label: "X-ray" },
  { id: "bronchi", label: "Bronchial tree" },
  { id: "capillaries", label: "Capillary bed" },
  { id: "histology", label: "Histology slide" },
  { id: "wash", label: "Plain" },
] as const;
export type SceneId = (typeof SCENES)[number]["id"];
type Drawn = Exclude<SceneId, "wash">;

const FLAT: Record<Drawn, SceneFactory> = { neurons, cells, heartbeat, xray, bronchi, capillaries, histology };

/** Settings from before the scenes were split ("neural", "still") map onto the new ones. */
export function normalizeScene(v: unknown): SceneId {
  // Older names: "neural"/"still" were neurons; the 3D DNA and bloodstream scenes were retired.
  if (v === "neural" || v === "still") return "neurons";
  if (v === "dna") return "cells";
  if (v === "blood") return "heartbeat";
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
  // A fresh canvas per scene, so nothing from the last one lingers.
  return <SceneCanvas key={scene} scene={scene} still={still} />;
}

function SceneCanvas({ scene, still }: { scene: Drawn; still: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current!;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
    const ctx = canvas.getContext("2d")!;
    let env = readEnv();
    let flat: Scene | null = null;
    let raf = 0;
    let alive = true;
    let last = performance.now();
    const t0 = last;
    // A background doesn't need more than 40 fps; this keeps laptops cool.
    const minStep = 1 / 40;

    const build = async () => {
      env = readEnv();
      canvas.width = env.W * env.dpr;
      canvas.height = env.H * env.dpr;
      flat = FLAT[scene](env);
      await flat.ready;
    };

    const draw = (time: number, dt: number) => {
      mouse.x += (mouse.tx - mouse.x) * 0.03;
      mouse.y += (mouse.ty - mouse.y) * 0.03;
      const ox = Math.sin(time * 0.05) * 14 + mouse.x * 10;
      const oy = Math.cos(time * 0.04) * 10 + mouse.y * 8;
      if (flat) {
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
        for (let i = 0; i < 180; i++) draw(i / 30 + 4, 1 / 30);
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
        rebuild();
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
      window.removeEventListener("resize", onResize);
      window.removeEventListener("mousemove", onMove);
      document.removeEventListener("visibilitychange", onVis);
      reduce.removeEventListener("change", start);
    };
  }, [scene, still]);

  return <canvas ref={ref} className="neural-canvas" aria-hidden />;
}
