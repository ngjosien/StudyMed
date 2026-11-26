// B-form DNA, built to scale: 10.5 base pairs a turn, 0.34 nm rise, a minor and a major
// groove. Glossy atoms on a phosphate backbone, slowly turning, with depth of field.
import * as THREE from "three";
import { col, hex, makeStage, softDot, type Factory3D } from "./common";
import { mix, type RGB } from "../scenes/kit";

const TWIST = (Math.PI * 2) / 10.5;
const RISE = 0.34;
const GROOVE = 2.45; // angle between the two strands' phosphates: makes the minor groove

function helix(bp: number, palette: { backbone: THREE.Color; sugar: THREE.Color; bases: THREE.Color[] }, glossy: boolean) {
  const group = new THREE.Group();
  const mat = (c: THREE.Color, rough = 0.28) =>
    new THREE.MeshPhysicalMaterial({ color: c, roughness: rough, metalness: 0, clearcoat: glossy ? 1 : 0.5, clearcoatRoughness: 0.18 });

  const atom = new THREE.SphereGeometry(1, 28, 20);
  const phosphates: THREE.Vector3[][] = [[], []];
  const sugars: THREE.Vector3[] = [];
  const bases: { p: THREE.Vector3; c: number; r: number }[] = [];
  for (let i = 0; i < bp; i++) {
    const z = (i - bp / 2) * RISE;
    const th = i * TWIST;
    const pair = Math.random() < 0.5 ? 0 : 1; // A–T or G–C
    const flip = Math.random() < 0.5;
    for (const s of [0, 1]) {
      const a = th + s * GROOVE;
      phosphates[s].push(new THREE.Vector3(Math.cos(a) * 1.0, Math.sin(a) * 1.0, z));
      const sa = a + (s ? -0.32 : 0.32);
      const sug = new THREE.Vector3(Math.cos(sa) * 0.78, Math.sin(sa) * 0.78, z + (s ? -0.06 : 0.06));
      sugars.push(sug);
    }
    // The base pair spans from one sugar to the other, passing near the axis.
    const sA = sugars[sugars.length - 2];
    const sB = sugars[sugars.length - 1];
    const mid = new THREE.Vector3().addVectors(sA, sB).multiplyScalar(0.5);
    mid.multiplyScalar(0.25); // pull the middle of the pair towards the axis
    const steps = 7;
    for (let k = 1; k < steps; k++) {
      const t = k / steps;
      const p = t < 0.5 ? sA.clone().lerp(mid, t * 2) : mid.clone().lerp(sB, (t - 0.5) * 2);
      const half = t < 0.5 ? 0 : 1;
      const c = pair * 2 + ((half ^ (flip ? 1 : 0)) as number);
      bases.push({ p, c, r: 0.17 + Math.sin(t * Math.PI) * 0.05 });
    }
  }

  // Instanced atoms.
  const put = (list: { p: THREE.Vector3; r: number }[], m: THREE.Material) => {
    const mesh = new THREE.InstancedMesh(atom, m, list.length);
    const mt = new THREE.Matrix4();
    list.forEach((a, i) => mesh.setMatrixAt(i, mt.compose(a.p, new THREE.Quaternion(), new THREE.Vector3(a.r, a.r, a.r))));
    group.add(mesh);
  };
  put([...phosphates[0], ...phosphates[1]].map((p) => ({ p, r: 0.27 })), mat(palette.backbone, 0.22));
  put(sugars.map((p) => ({ p, r: 0.21 })), mat(palette.sugar, 0.3));
  for (let c = 0; c < 4; c++) put(bases.filter((b) => b.c === c), mat(palette.bases[c], 0.32));

  // Smooth backbone ribbons through the phosphates.
  for (const s of [0, 1]) {
    const curve = new THREE.CatmullRomCurve3(phosphates[s]);
    group.add(new THREE.Mesh(new THREE.TubeGeometry(curve, bp * 6, 0.11, 10, false), mat(palette.backbone, 0.2)));
  }
  return group;
}

export const dna3d: Factory3D = (canvas, env) => {
  const { dark, acc, alt } = env;
  const stage = makeStage(canvas, env, { fov: 40, focus: 16, aperture: 0.0007, maxblur: 0.009, bloom: dark ? 0.22 : 0.06, exposure: dark ? 0.85 : 0.95, envLight: dark ? 0.35 : 0.55 });
  const { scene, camera, composer } = stage;

  const bgRGB: RGB = dark ? mix([12, 8, 12], acc, 0.1) : mix([246, 241, 236], acc, 0.05);
  scene.background = col(bgRGB);
  scene.fog = new THREE.Fog(col(bgRGB), 20, 42);

  const lerp = (a: RGB, b: RGB, t: number) => col(mix(a, b, t));
  const palette = {
    backbone: lerp(acc, [200, 170, 120], 0.35),
    sugar: lerp(acc, [235, 225, 210], 0.45),
    // Adenine/thymine and guanine/cytosine in four harmonised hues.
    bases: [hex("#3fa7a0"), hex("#e07a5f"), hex("#e3b04b"), hex("#7f6fc0")].map((c) => c.lerp(col(acc), 0.18)),
  };

  scene.add(new THREE.HemisphereLight(0xffffff, dark ? 0x221018 : 0xd8cfc6, dark ? 0.25 : 0.6));
  const key = new THREE.DirectionalLight(0xfff4ea, dark ? 1.5 : 1.8);
  key.position.set(-5, 8, 10);
  scene.add(key);
  const rim = new THREE.DirectionalLight(col(acc), dark ? 1.6 : 0.8);
  rim.position.set(6, -2, -8);
  scene.add(rim);

  const main = helix(64, palette, true);
  main.rotation.set(0.2, 0.35, -0.95);
  main.position.set(3.2, -0.2, 0);
  scene.add(main);
  const back = helix(48, palette, false);
  back.rotation.set(-0.3, 0.6, -0.4);
  back.position.set(-9, 3.5, -16);
  back.scale.setScalar(1.1);
  scene.add(back);

  // Out-of-focus specks floating in front of and behind the molecule.
  const n = 260;
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) pos.set([(Math.random() - 0.5) * 40, (Math.random() - 0.5) * 26, -30 + Math.random() * 40], i * 3);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const specks = new THREE.Points(
    g,
    new THREE.PointsMaterial({ map: softDot(), size: 0.35, color: col(mix(acc, alt, 0.5)), transparent: true, opacity: dark ? 0.45 : 0.35, depthWrite: false, blending: dark ? THREE.AdditiveBlending : THREE.NormalBlending }),
  );
  scene.add(specks);

  camera.position.set(0, 0, 16);
  const axisMain = new THREE.Vector3(0, 0, 1);
  return {
    frame(time, dt, ox, oy) {
      main.rotateOnAxis(axisMain, dt * 0.22);
      back.rotateOnAxis(axisMain, -dt * 0.15);
      specks.rotation.y = Math.sin(time * 0.03) * 0.15;
      specks.position.y = Math.sin(time * 0.1) * 0.4;
      camera.position.x = ox * 0.04;
      camera.position.y = -oy * 0.035;
      camera.lookAt(0, 0, 0);
      composer.render(dt);
    },
    resize: stage.resize,
    dispose: stage.dispose,
  };
};
