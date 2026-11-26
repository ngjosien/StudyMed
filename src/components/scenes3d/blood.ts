// Inside a blood vessel: biconcave red cells (the Evans–Fung shape) tumbling towards you,
// with white cells, platelets and plasma specks, a textured vessel wall, depth of field and fog.
import * as THREE from "three";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import { col, hex, makeStage, noise3, softDot, type Factory3D } from "./common";
import { mix } from "../scenes/kit";

/** Red cell cross-section (Evans & Fung 1972), radius 1. */
function rbcGeometry() {
  const C0 = 0.207161;
  const C2 = 2.002558;
  const C4 = -1.122762;
  const h = (x: number) => 0.5 * Math.sqrt(Math.max(0, 1 - x * x)) * (C0 + C2 * x * x + C4 * x ** 4);
  const pts: THREE.Vector2[] = [];
  const N = 40;
  for (let i = 0; i <= N; i++) {
    const x = Math.sin((i / N) * (Math.PI / 2)); // denser near the rim
    pts.push(new THREE.Vector2(x * 0.999 + 0.0005, h(x) + 0.004));
  }
  for (let i = N; i >= 0; i--) {
    const x = Math.sin((i / N) * (Math.PI / 2));
    pts.push(new THREE.Vector2(x * 0.999 + 0.0005, -h(x) - 0.004));
  }
  const g = new THREE.LatheGeometry(pts, 56);
  g.computeVertexNormals();
  return g;
}

/** A lumpy sphere for white cells. */
function wbcGeometry() {
  // Shared vertices, so the surface shades smoothly instead of in facets.
  const g = mergeVertices(new THREE.IcosahedronGeometry(1, 6));
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = noise3(v.x * 3, v.y * 3, v.z * 3) * 0.07 + noise3(v.x * 9, v.y * 9, v.z * 9) * 0.025;
    v.multiplyScalar(1 + n);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

/** Blotchy endothelium for the vessel wall (colour + bump). */
function wallTexture(dark: boolean) {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 512;
  const g = c.getContext("2d")!;
  g.fillStyle = dark ? "#5a0d16" : "#e7b3ae";
  g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 900; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const r = 6 + Math.random() * 26;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    const a = 0.08 + Math.random() * 0.12;
    grad.addColorStop(0, dark ? `rgba(140,30,40,${a})` : `rgba(200,90,95,${a})`);
    grad.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = grad;
    g.beginPath();
    g.ellipse(x, y, r * 1.8, r, 0, 0, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(3, 8);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const TUBE_R = 8;
const NEAR_Z = 6;
const FAR_Z = -70;

export const blood3d: Factory3D = (canvas, env) => {
  const { dark } = env;
  const stage = makeStage(canvas, env, { fov: 58, focus: 13, aperture: 0.0012, maxblur: 0.01, bloom: dark ? 0.18 : 0.06, exposure: dark ? 0.75 : 0.95, envLight: dark ? 0.3 : 0.5 });
  const { scene, camera, composer } = stage;

  const bg = dark ? col(mix([30, 4, 8], env.acc, 0.12)) : col(mix([246, 226, 222], env.acc, 0.06));
  scene.background = bg;
  scene.fog = new THREE.FogExp2(bg, dark ? 0.045 : 0.035);

  scene.add(new THREE.HemisphereLight(dark ? 0xffd0c8 : 0xffffff, dark ? 0x2a0508 : 0xd9a3a0, dark ? 0.55 : 1.1));
  const key = new THREE.DirectionalLight(0xfff1e6, dark ? 1.6 : 2.0);
  key.position.set(-6, 9, 8);
  scene.add(key);
  const rim = new THREE.DirectionalLight(dark ? 0xff5a4a : 0xff8f80, dark ? 2.4 : 1.4);
  rim.position.set(4, -3, -12);
  scene.add(rim);
  const lamp = new THREE.PointLight(0xffe8e0, dark ? 30 : 20, 40, 1.6);
  lamp.position.set(0, 1.5, 4);
  scene.add(lamp);

  // Vessel wall.
  const wallTex = wallTexture(dark);
  const wall = new THREE.Mesh(
    new THREE.CylinderGeometry(TUBE_R + 2.5, TUBE_R + 2.5, 120, 64, 1, true),
    new THREE.MeshStandardMaterial({ map: wallTex, bumpMap: wallTex, bumpScale: 2.5, roughness: 0.55, metalness: 0, side: THREE.BackSide, color: dark ? 0xb04050 : 0xffffff }),
  );
  wall.rotation.x = Math.PI / 2;
  wall.position.z = -30;
  scene.add(wall);

  // Red cells.
  const N = 230;
  const rbcMat = new THREE.MeshPhysicalMaterial({
    color: dark ? 0xa3121f : 0xc4313a,
    roughness: 0.42,
    clearcoat: 0.35,
    clearcoatRoughness: 0.45,
    sheen: 1,
    sheenColor: hex(dark ? "#ff6b5e" : "#ffb0a6"),
    sheenRoughness: 0.45,
    emissive: hex(dark ? "#2b0306" : "#000000"),
  });
  const rbcs = new THREE.InstancedMesh(rbcGeometry(), rbcMat, N);
  scene.add(rbcs);

  type Body = { p: THREE.Vector3; v: number; axis: THREE.Vector3; ang: number; spin: number; s: number; sway: number };
  const spawn = (b: Partial<Body> = {}, z?: number): Body => {
    const r = Math.sqrt(Math.random()) * (TUBE_R - 1.2);
    const a = Math.random() * Math.PI * 2;
    // Leave a little clear space straight ahead so the view isn't blocked.
    const rr = r < 1.6 ? 1.6 + Math.random() * 2 : r;
    return Object.assign(b, {
      p: new THREE.Vector3(Math.cos(a) * rr, Math.sin(a) * rr, z ?? THREE.MathUtils.lerp(FAR_Z, NEAR_Z, Math.random())),
      v: 2.4 + Math.random() * 2.6 * (1 - rr / TUBE_R + 0.4),
      axis: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize(),
      ang: Math.random() * Math.PI * 2,
      spin: (Math.random() - 0.5) * 1.4,
      s: 0.85 + Math.random() * 0.3,
      sway: Math.random() * 10,
    }) as Body;
  };
  const cells = Array.from({ length: N }, () => spawn());

  // White cells and platelets.
  const wbcs = new THREE.InstancedMesh(
    wbcGeometry(),
    new THREE.MeshPhysicalMaterial({ color: dark ? 0xd9cdd6 : 0xeee4ea, roughness: 0.7, sheen: 1, sheenColor: hex("#fff4f8"), sheenRoughness: 0.5, clearcoat: 0.2 }),
    3,
  );
  scene.add(wbcs);
  const whites = Array.from({ length: 3 }, () => {
    const b = spawn();
    b.s = 1.15 + Math.random() * 0.3;
    b.v *= 0.7;
    return b;
  });
  const plGeo = new THREE.SphereGeometry(1, 16, 12);
  plGeo.scale(1, 0.45, 0.8);
  const platelets = new THREE.InstancedMesh(plGeo, new THREE.MeshStandardMaterial({ color: dark ? 0xe0a09a : 0xd98c86, roughness: 0.6 }), 60);
  scene.add(platelets);
  const plates = Array.from({ length: 60 }, () => {
    const b = spawn();
    b.s = 0.18 + Math.random() * 0.12;
    return b;
  });

  // Plasma specks.
  const specN = 700;
  const spec = new Float32Array(specN * 3);
  for (let i = 0; i < specN; i++) {
    const r = Math.random() * TUBE_R;
    const a = Math.random() * Math.PI * 2;
    spec.set([Math.cos(a) * r, Math.sin(a) * r, THREE.MathUtils.lerp(FAR_Z, NEAR_Z, Math.random())], i * 3);
  }
  const specGeo = new THREE.BufferGeometry();
  specGeo.setAttribute("position", new THREE.BufferAttribute(spec, 3));
  const specks = new THREE.Points(
    specGeo,
    new THREE.PointsMaterial({ map: softDot(), size: 0.16, transparent: true, depthWrite: false, opacity: dark ? 0.55 : 0.45, color: dark ? 0xffc4b8 : 0xb4555a, blending: dark ? THREE.AdditiveBlending : THREE.NormalBlending }),
  );
  scene.add(specks);

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const sc = new THREE.Vector3();
  const place = (mesh: THREE.InstancedMesh, list: Body[], dt: number, time: number, flat = false) => {
    list.forEach((b, i) => {
      b.p.z += b.v * dt;
      if (b.p.z > NEAR_Z) spawn(b, FAR_Z);
      b.ang += b.spin * dt;
      const sway = Math.sin(time * 0.6 + b.sway) * 0.25;
      q.setFromAxisAngle(b.axis, b.ang);
      sc.setScalar(b.s);
      if (flat) sc.y *= 1;
      m.compose(new THREE.Vector3(b.p.x + sway, b.p.y + sway * 0.6, b.p.z), q, sc);
      mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
  };

  camera.position.set(0, 0, 9);
  return {
    frame(time, dt, ox, oy) {
      place(rbcs, cells, dt, time);
      place(wbcs, whites, dt, time);
      place(platelets, plates, dt, time, true);
      const pos = specGeo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < specN; i++) {
        let z = pos.getZ(i) + 3.2 * dt;
        if (z > NEAR_Z) z = FAR_Z;
        pos.setZ(i, z);
      }
      pos.needsUpdate = true;
      wallTex.offset.y -= dt * 0.03;
      camera.position.x = ox * 0.05 + Math.sin(time * 0.13) * 0.4;
      camera.position.y = -oy * 0.04 + Math.cos(time * 0.11) * 0.3;
      camera.lookAt(camera.position.x * 0.3, camera.position.y * 0.3, -20);
      camera.rotateZ(Math.sin(time * 0.05) * 0.06);
      composer.render(dt);
    },
    resize: stage.resize,
    dispose: stage.dispose,
  };
};
