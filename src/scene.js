import * as THREE from "three";

const SHEET_WIDTH = 2.82;
const SHEET_HEIGHT = 3.67;
const ROLES = ["source", "reference", "output"];
// Each stage places the three sheets nearer to or farther from the camera as focus moves through the trace.
const STAGES = [
  [[-.84, .06, .19, 1.09, .19, -.18], [.04, -.18, -.49, .79, -.27, .12], [.94, -.24, -.69, .75, -.31, .15]],
  [[-.98, -.22, -.48, .81, .32, -.23], [0, .19, .28, 1.13, -.08, -.06], [.96, -.2, -.52, .82, -.28, .17]],
  [[-.91, -.16, -.67, .77, .3, -.22], [-.06, -.17, -.35, .87, .14, -.055], [.88, .11, .32, 1.14, -.2, .14]],
];

function makePaperGeometry() {
  const geometry = new THREE.PlaneGeometry(SHEET_WIDTH, SHEET_HEIGHT, 28, 36);
  const points = geometry.getAttribute("position");
  for (let i = 0; i < points.count; i++) {
    const x = points.getX(i) / (SHEET_WIDTH * .5);
    const y = points.getY(i) / (SHEET_HEIGHT * .5);
    points.setZ(i, .09 * x ** 2 - .07 * y ** 2 + .035 * x * y);
  }
  geometry.computeVertexNormals();
  return geometry;
}

function drawPaper(canvas, preview, role) {
  const ctx = canvas.getContext("2d");
  const { width, height } = canvas;
  const isOutput = role === "output";
  ctx.clearRect(0, 0, width, height);
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(2, 2, width - 4, height - 4, 5);
  ctx.clip();

  ctx.fillStyle = isOutput ? preview.paper : role === "source" ? "#dce3d9" : "#d3e0d4";
  ctx.fillRect(0, 0, width, height);
  const shade = ctx.createLinearGradient(0, 0, width * .5, height);
  shade.addColorStop(0, "#f9fdf299");
  shade.addColorStop(.6, "#f9fdf200");
  shade.addColorStop(1, "#384e3c2b");
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, width, height);

  let grain = 11872;
  for (let i = 0; i < 2100; i++) {
    grain = (Math.imul(1664525, grain) + 1013904223) >>> 0;
    const x = grain % width;
    grain = (Math.imul(1664525, grain) + 1013904223) >>> 0;
    ctx.fillStyle = i % 2 ? "#425b481e" : "#fbfff669";
    ctx.fillRect(x, grain % height, 1.5, 2);
  }

  ctx.lineWidth = 1.8;
  ctx.strokeStyle = "#48665560";
  ctx.strokeRect(25, 25, width - 50, height - 50);
  ctx.textAlign = "left";

  const start = 67;
  const end = width - start;
  const rule = (y, color = "#738b785c") => {
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.moveTo(start, y);
    ctx.lineTo(end, y);
    ctx.stroke();
  };
  const text = (content, size, y, color, style = "monospace") => {
    ctx.fillStyle = color;
    ctx.font = size + "px " + style;
    ctx.fillText(content, start, y, end - start);
  };
  const ink = "#26392e";
  const serif = '"Newsreader", Georgia, serif';

  if (isOutput) {
    text(preview.type.toUpperCase(), 25, 125, preview.accent);
    text(preview.title, 86, 225, ink, serif);
    rule(264, preview.accent);
    preview.rows.forEach(([label, value], i) => {
      const rowY = 338 + i * 78;
      text(label, 29, rowY, ink);
      ctx.textAlign = "right";
      ctx.fillText(value, end, rowY);
      ctx.textAlign = "left";
      rule(rowY + 24);
    });
    ctx.fillStyle = preview.accent;
    ctx.fillRect(start, 608, end - start, 82);
    ctx.fillStyle = "#eff5e9";
    ctx.font = "24px monospace";
    ctx.fillText("SOURCE REFERENCE", start + 22, 658);
    text(preview.source, 28, 756, ink);
    text(preview.reference, 23, 803, preview.accent);
    rule(875);
  } else {
    const source = role === "source";
    text(source ? "ORIGINAL FILE" : "SOURCE REFERENCE", 25, 125, ink);
    text(source ? preview.source : preview.reference, 59, 218, ink, serif);
    rule(260, preview.accent);
    text(source ? preview.type : preview.title, 29, 330, preview.accent);
    ctx.fillStyle = "#f4f8f091";
    ctx.fillRect(start, 394, end - start, 152);
    text(preview.label, 33, 452, ink);
    text(preview.value, 37, 505, preview.accent);
    for (let y = 602; y < 860; y += 60) rule(y);
  }
  ctx.restore();
}

export function mountScene(container, firstPreview) {
  const canvas = container.querySelector("canvas");
  const context = canvas.getContext("webgl2", { alpha: true, antialias: true });
  if (!context) return null;

  const renderer = new THREE.WebGLRenderer({ canvas, context, alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.65));
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, .1, 40);
  camera.position.z = 8.8;
  scene.add(new THREE.HemisphereLight(0xf5faef, 0x8ea598, 1.65));
  const key = new THREE.DirectionalLight(0xf6fbf1, 2.2);
  key.position.set(-4, 6, 5);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xffffff, .5);
  fill.position.set(4, -1, 5);
  scene.add(fill);

  const folio = new THREE.Group();
  scene.add(folio);
  const paperGeometry = makePaperGeometry();
  const pages = ROLES.map((role, index) => {
    const art = document.createElement("canvas");
    art.width = 768;
    art.height = 1000;
    const texture = new THREE.CanvasTexture(art);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    const paper = new THREE.Mesh(paperGeometry, new THREE.MeshStandardMaterial({
      map: texture, roughness: .88, alphaTest: .48, alphaToCoverage: true, side: THREE.DoubleSide,
    }));
    paper.position.set((index - 1) * .7, -.48 + .15 * index, -.95 + index * .22);
    paper.rotation.set(.24, -.34 + index * .3, -.25 + index * .21);
    paper.scale.setScalar(.78);
    folio.add(paper);
    return { role, paper, art, texture };
  });

  const packet = new THREE.Mesh(
    new THREE.SphereGeometry(.07, 14, 8),
    new THREE.MeshBasicMaterial({ color: "#d6edc8" }),
  );
  packet.position.z = -.9;
  scene.add(packet);

  const reduce = matchMedia("(prefers-reduced-motion: reduce)");
  const viewTarget = new THREE.Vector2();
  let visible = true;
  let contextLost = false;
  let frame = 0;
  let previous = null;
  let stage = 0;
  let progress = 0;
  let spacing = 4.15;
  let turn = 0;

  function draw(time) {
    frame = 0;
    if (contextLost) return;
    const elapsed = previous === null ? 16.7 : Math.min(50, time - previous);
    previous = time;
    const still = reduce.matches;
    const blend = still ? 1 : 1 - Math.exp(-elapsed * .0064);
    turn *= still ? 0 : Math.pow(.9, elapsed / 16.7);
    let movement = 0;
    const approach = (from, to) => {
      movement = Math.max(movement, Math.abs(to - from));
      return THREE.MathUtils.lerp(from, to, blend);
    };

    folio.rotation.set(
      approach(folio.rotation.x, -.035 + viewTarget.x),
      approach(folio.rotation.y, viewTarget.y + turn),
      approach(folio.rotation.z, -.035 + viewTarget.y * .105),
    );
    camera.position.z = approach(camera.position.z, 8.8 + Math.abs(viewTarget.y) * 1.05 + Math.abs(viewTarget.x) * .55);
    for (const [i, { paper }] of pages.entries()) {
      const [x, y, z, scale, yaw, roll] = STAGES[stage][i];
      paper.position.set(approach(paper.position.x, x * spacing), approach(paper.position.y, y), approach(paper.position.z, z));
      paper.rotation.set(approach(paper.rotation.x, .11 + (i === stage ? -.11 : .12)), approach(paper.rotation.y, yaw), approach(paper.rotation.z, roll));
      paper.scale.setScalar(approach(paper.scale.x, scale));
    }
    packet.visible = progress > .005 && progress < .996;
    packet.position.x = THREE.MathUtils.lerp(-spacing * 1.2, spacing * 1.2, progress);
    packet.position.y = -1.57 + Math.sin(progress * Math.PI) * .26;
    packet.scale.setScalar(1.06 + .34 * Math.sin(progress * Math.PI * 8));
    renderer.render(scene, camera);
    container.classList.add("is-rendered");

    if (movement > .003 && !still && visible && !document.hidden) frame = requestAnimationFrame(draw);
    if (!frame) previous = null;
  }

  function sync() {
    if (visible && !document.hidden && !contextLost) {
      if (!frame) frame = requestAnimationFrame(draw);
    } else if (frame) {
      cancelAnimationFrame(frame);
      frame = 0;
      previous = null;
    }
  }

  function fit() {
    const { clientWidth: width, clientHeight: height } = container;
    if (!width || !height) return;
    camera.aspect = width / height;
    spacing = Math.min(4.2, Math.max(1.6, (camera.aspect * 2.69 - 1.5) * .72));
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    sync();
  }

  function show(preview) {
    for (const { art, texture, role } of pages) {
      drawPaper(art, preview, role);
      texture.needsUpdate = true;
    }
    turn = -.2;
    sync();
  }

  function setStep(index) {
    stage = index;
    sync();
  }

  function setTilt(x, y) {
    viewTarget.set(x, y);
    sync();
  }

  function setProgress(value) {
    progress = value;
    sync();
  }

  canvas.addEventListener("webglcontextlost", (event) => {
    event.preventDefault();
    contextLost = true;
    container.classList.remove("is-rendered");
    sync();
  });
  canvas.addEventListener("webglcontextrestored", () => {
    contextLost = false;
    sync();
  });
  new ResizeObserver(fit).observe(container);
  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    sync();
  }).observe(container);
  document.addEventListener("visibilitychange", sync);
  reduce.addEventListener("change", sync);

  show(firstPreview);
  fit();
  return { show, setStep, setTilt, setProgress };
}
