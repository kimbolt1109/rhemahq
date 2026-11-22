// Sync Sanctuary — interactive WebGL centerpiece.
// A verified "seal" orbited by source-shards joined by provenance threads;
// scroll drives the camera, pointer adds parallax, hover raycasts a live receipt.
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

const canvas = document.getElementById("gl");
const tip = document.getElementById("gl-tip");
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
const coarse = matchMedia("(pointer: coarse)").matches;
const small = Math.min(innerWidth, innerHeight) < 700;

const RECEIPTS = [
  "row 128 · Pick & Pack · 46.20", "row 129 · Pick & Pack · 18.70", "row 130 · Storage · 120.00",
  "row 008 · Returns · 12.50", "row 009 · Credit · -6.00", "q-101 · multichoice · verified",
  "q-102 · truefalse · verified", "q-201 · cloze · verified", "galley · JATS 1.2 · DTD clean",
  "galley · PDF · two-column", "galley · HTML · standalone", "sha256 · tied to source",
];

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: !small, alpha: true, powerPreference: "high-performance" });
} catch (err) {
  canvas.remove();
  document.body.classList.add("no-gl");
  throw err;
}

renderer.setClearColor(0x000000, 0);
renderer.setPixelRatio(Math.min(devicePixelRatio, small ? 1.5 : 2));
renderer.setSize(innerWidth, innerHeight);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x060709, 0.045);
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 0, 9);

scene.add(new THREE.AmbientLight(0xffffff, 0.25));
const key = new THREE.DirectionalLight(0xE6E1D3, 0.9); key.position.set(4, 6, 6); scene.add(key);
const core = new THREE.PointLight(0x00E38C, 12, 20); core.position.set(0, 0, 0); scene.add(core);

// The verified seal
const seal = new THREE.Group();
const sealBody = new THREE.Mesh(
  new THREE.IcosahedronGeometry(1.15, 0),
  new THREE.MeshStandardMaterial({ color: 0x0b0e10, metalness: 0.9, roughness: 0.28, emissive: 0x00E38C, emissiveIntensity: 0.12 })
);
const sealEdges = new THREE.LineSegments(
  new THREE.EdgesGeometry(sealBody.geometry),
  new THREE.LineBasicMaterial({ color: 0x00E38C, transparent: true, opacity: 0.85 })
);
const ring = new THREE.Mesh(
  new THREE.TorusGeometry(1.75, 0.012, 8, 96),
  new THREE.MeshBasicMaterial({ color: 0xE6E1D3, transparent: true, opacity: 0.5 })
);
ring.rotation.x = Math.PI / 2.4;
seal.add(sealBody, sealEdges, ring);
scene.add(seal);

// Orbiting source-shards (instanced)
const SHARDS = small ? 26 : 48;
const shardGeo = new THREE.BoxGeometry(0.4, 0.56, 0.02);
const shardMat = new THREE.MeshStandardMaterial({ color: 0xC9C4B4, metalness: 0.35, roughness: 0.62, emissive: 0x000000 });
const shards = new THREE.InstancedMesh(shardGeo, shardMat, SHARDS);
const base = [];
const dummy = new THREE.Object3D();
for (let i = 0; i < SHARDS; i++) {
  const a = (i / SHARDS) * Math.PI * 2 * 3;           // three helix turns
  const r = 3.6 + (i % 7) * 0.3;
  const y = ((i / SHARDS) - 0.5) * 5.2;
  base.push({ a, r, y, spin: 0.2 + (i % 5) * 0.07 });
  dummy.position.set(Math.cos(a) * r, y, Math.sin(a) * r);
  dummy.lookAt(0, y * 0.3, 0);
  dummy.updateMatrix();
  shards.setMatrixAt(i, dummy.matrix);
  shards.setColorAt(i, new THREE.Color(0xE6E1D3));
}
scene.add(shards);

// Provenance threads: shard -> seal
const threadPos = new Float32Array(SHARDS * 6);
for (let i = 0; i < SHARDS; i++) {
  const b = base[i];
  threadPos.set([Math.cos(b.a) * b.r, b.y, Math.sin(b.a) * b.r, 0, 0, 0], i * 6);
}
const threadGeo = new THREE.BufferGeometry();
threadGeo.setAttribute("position", new THREE.BufferAttribute(threadPos, 3));
const threads = new THREE.LineSegments(threadGeo, new THREE.LineBasicMaterial({ color: 0x00E38C, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false }));
scene.add(threads);

// Drifting particles
const P = small ? 160 : 620;
const pPos = new Float32Array(P * 3);
for (let i = 0; i < P; i++) {
  pPos[i * 3] = (Math.random() - 0.5) * 22;
  pPos[i * 3 + 1] = (Math.random() - 0.5) * 14;
  pPos[i * 3 + 2] = (Math.random() - 0.5) * 16;
}
const pGeo = new THREE.BufferGeometry();
pGeo.setAttribute("position", new THREE.BufferAttribute(pPos, 3));
const particles = new THREE.Points(pGeo, new THREE.PointsMaterial({ color: 0xE6E1D3, size: 0.025, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
scene.add(particles);

// Post-processing (bloom) — skipped on small / coarse devices
let composer = null;
if (!small && !coarse) {
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.45, 0.7, 0.35));
  composer.addPass(new OutputPass());
}

// Interaction state
const pointer = new THREE.Vector2(0, 0);
const target = new THREE.Vector2(0, 0);
const ray = new THREE.Raycaster();
let hovered = -1;
let scrollP = 0;

addEventListener("pointermove", (e) => {
  target.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  if (tip) {
    ray.setFromCamera(target, camera);
    const hit = ray.intersectObject(shards)[0];
    const id = hit ? hit.instanceId : -1;
    if (id !== hovered) {
      if (hovered >= 0) shards.setColorAt(hovered, new THREE.Color(0xE6E1D3));
      hovered = id;
      if (id >= 0) {
        shards.setColorAt(id, new THREE.Color(0x00E38C));
        tip.textContent = RECEIPTS[id % RECEIPTS.length] + "  ✓";
        tip.classList.add("on");
      } else tip.classList.remove("on");
      shards.instanceColor.needsUpdate = true;
    }
    if (id >= 0) { tip.style.left = e.clientX + 14 + "px"; tip.style.top = e.clientY + 12 + "px"; }
  }
}, { passive: true });

addEventListener("scroll", () => {
  const max = document.documentElement.scrollHeight - innerHeight;
  scrollP = max > 0 ? scrollY / max : 0;
  canvas.style.opacity = String(Math.max(0, 1 - scrollP * 3.2));
}, { passive: true });

addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  if (composer) composer.setSize(innerWidth, innerHeight);
});

const clock = new THREE.Clock();
function frame() {
  const t = clock.getElapsedTime();
  pointer.lerp(target, 0.06);

  seal.rotation.y = t * 0.16 + scrollP * 2.4;
  seal.rotation.x = Math.sin(t * 0.2) * 0.12;
  ring.rotation.z = t * 0.3;
  const pulse = 1 + Math.sin(t * 1.2) * 0.03;
  seal.scale.setScalar(pulse);
  core.intensity = 10 + Math.sin(t * 1.6) * 3;

  for (let i = 0; i < SHARDS; i++) {
    const b = base[i];
    const a = b.a + t * 0.05;
    const y = b.y + Math.sin(t * b.spin + i) * 0.16;
    dummy.position.set(Math.cos(a) * b.r, y, Math.sin(a) * b.r);
    dummy.lookAt(0, y * 0.3, 0);
    dummy.updateMatrix();
    shards.setMatrixAt(i, dummy.matrix);
  }
  shards.instanceMatrix.needsUpdate = true;
  particles.rotation.y = t * 0.012;

  camera.position.z = 9 - scrollP * 4.5;
  camera.position.x = pointer.x * 0.7;
  camera.position.y = pointer.y * 0.45 + scrollP * 1.2;
  camera.lookAt(0, scrollP * 0.6, 0);

  if (composer) composer.render(); else renderer.render(scene, camera);
}

if (reduce) {
  frame();  // single static frame, no loop
} else {
  renderer.setAnimationLoop(() => { if (!document.hidden) frame(); });
}
