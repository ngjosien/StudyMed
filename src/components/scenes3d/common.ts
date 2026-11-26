// Shared set-up for the WebGL scenes: renderer, depth of field, gentle bloom, soft sprites.
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { BokehPass } from "three/addons/postprocessing/BokehPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import type { Env, RGB } from "../scenes/kit";

export interface Scene3D {
  frame(time: number, dt: number, ox: number, oy: number): void;
  resize(W: number, H: number): void;
  dispose(): void;
}
export type Factory3D = (canvas: HTMLCanvasElement, env: Env) => Scene3D;

export const col = (c: RGB) => new THREE.Color().setRGB(c[0] / 255, c[1] / 255, c[2] / 255, THREE.SRGBColorSpace);
export const hex = (h: string) => new THREE.Color(h);

export function makeStage(canvas: HTMLCanvasElement, env: Env, o: { fov: number; focus: number; aperture: number; maxblur: number; bloom: number; exposure?: number; envLight?: number }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: "low-power" });
  renderer.setPixelRatio(Math.min(env.dpr, 1.25));
  renderer.setSize(env.W, env.H, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = o.exposure ?? 1;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envTex;
  scene.environmentIntensity = o.envLight ?? 0.6;

  const camera = new THREE.PerspectiveCamera(o.fov, env.W / env.H, 0.1, 200);
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bokeh = new BokehPass(scene, camera, { focus: o.focus, aperture: o.aperture, maxblur: o.maxblur });
  composer.addPass(bokeh);
  const bloom = new UnrealBloomPass(new THREE.Vector2(env.W, env.H), o.bloom, 0.55, 0.82);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  composer.setPixelRatio(Math.min(env.dpr, 1.25));
  composer.setSize(env.W, env.H);

  return {
    renderer,
    scene,
    camera,
    composer,
    resize(W: number, H: number) {
      camera.aspect = W / H;
      camera.updateProjectionMatrix();
      renderer.setSize(W, H, false);
      composer.setSize(W, H);
    },
    dispose() {
      scene.traverse((obj) => {
        const m = obj as THREE.Mesh;
        m.geometry?.dispose?.();
        const mat = m.material as THREE.Material | THREE.Material[] | undefined;
        (Array.isArray(mat) ? mat : mat ? [mat] : []).forEach((x) => {
          Object.values(x).forEach((v) => v instanceof THREE.Texture && v.dispose());
          x.dispose();
        });
      });
      envTex.dispose();
      pmrem.dispose();
      composer.dispose();
      renderer.dispose();
    },
  };
}

/** A soft round sprite, for out-of-focus specks. */
export function softDot() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.4, "rgba(255,255,255,0.55)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Cheap smooth noise for displacing surfaces. */
export function noise3(x: number, y: number, z: number) {
  return (
    Math.sin(x * 1.7 + Math.sin(y * 2.3)) * 0.5 +
    Math.sin(y * 2.9 + Math.sin(z * 1.3)) * 0.3 +
    Math.sin(z * 3.7 + Math.sin(x * 2.1)) * 0.2
  );
}
