const artifact = document.querySelector("[data-artifact]");
const visual = document.getElementById("artifact-visual");
const buttons = [...artifact.querySelectorAll("[data-preview]")];
const previews = {
  ledger: {
    type: "3PL reconciliation", title: "Fee rollup", label: "Pick & Pack", value: "46.20",
    source: "invoice_march.xlsx", reference: "Sheet1 · row 128", href: "#demo-ledger",
    action: "Try this demo", paper: "#e8ede4", accent: "#355c45",
    rows: [["Pick & Pack", "46.20"], ["Storage", "120.00"], ["Credit", "−6.00"]],
  },
  moodle: {
    type: "Moodle XML", title: "Question bank", label: "Multichoice", value: "q-101",
    source: "synthetic-sample.xml", reference: "Release pack / demo", href: "#demo-moodle",
    action: "Try this demo", paper: "#e4e9d9", accent: "#4b6243",
    rows: [["Multichoice", "q-101"], ["True / false", "q-102"], ["Cloze", "q-201"]],
  },
  galley: {
    type: "OJS production", title: "Galley proof", label: "JATS", value: "1.2",
    source: "accepted_article.docx", reference: "PDF · HTML · JATS", href: "./tools/ojs-galley-studio.zip",
    action: "Download Studio", paper: "#e6e9e6", accent: "#3d5f53",
    rows: [["Print galley", "PDF"], ["Web galley", "HTML"], ["Structured article", "JATS"]],
  },
};

const reduce = matchMedia("(prefers-reduced-motion: reduce)");
const phases = [...artifact.querySelectorAll("[data-step-control]")];
const playButton = artifact.querySelector("[data-play]");
const playLabel = artifact.querySelector("[data-play-label]");
const meter = artifact.querySelector(".play-meter");
const signal = artifact.querySelector(".stage-wipe");
const backdrop = artifact.querySelector(".stage-art");
const illustration = artifact.querySelector(".specimen-fallback");
const hint = document.getElementById("artifact-hint");
const coarse = matchMedia("(pointer: coarse)");
const selection = document.getElementById("artifact-selection");
const previewLink = document.getElementById("artifact-link");
const duration = 3820;
const starts = [0, 1170, 2440];

let active = artifact.dataset.artifact;
let scene;
let step = 0;
let elapsed = 0;
let playing = false;
let engaged = false;
let visible = false;
let frame = 0;
let previous = null;
let tiltX = 0;
let tiltY = 0;
let drag;

function setProgress() {
  const fraction = elapsed / duration;
  meter.style.transform = "scaleX(" + fraction + ")";
  signal.style.transform = "scaleX(" + fraction + ")";
  scene?.setProgress(fraction);
}

function setStep(number) {
  step = Math.min(2, Math.max(0, number));
  const preview = previews[active];
  selection.textContent = [preview.source, preview.reference, preview.title][step];
  artifact.dataset.step = String(step);
  phases.forEach((button, i) => button.setAttribute("aria-pressed", String(i === step)));
  scene?.setStep(step);
}

function play(time) {
  frame = 0;
  if (previous !== null) elapsed = Math.min(elapsed + time - previous, duration);
  previous = time;
  const next = elapsed >= starts[2] ? 2 : elapsed >= starts[1] ? 1 : 0;
  if (next !== step) setStep(next);
  setProgress();
  if (elapsed >= duration) {
    setPlaying(false);
  } else {
    frame = requestAnimationFrame(play);
  }
}

function sync() {
  if (frame) cancelAnimationFrame(frame);
  frame = 0;
  previous = null;
  if (playing && visible && !document.hidden) frame = requestAnimationFrame(play);
}

function setPlaying(next) {
  playing = next;
  artifact.dataset.playing = String(next);
  playLabel.textContent = reduce.matches ? "Next step"
    : next ? "Pause trace"
    : elapsed >= duration ? "Replay trace"
    : elapsed > 0 ? "Resume trace" : "Play trace";
  sync();
}

function goTo(number) {
  engaged = true;
  setStep(number);
  elapsed = starts[step];
  setProgress();
  setPlaying(false);
}

playButton.disabled = false;
playButton.addEventListener("click", () => {
  engaged = true;
  if (reduce.matches) {
    goTo((step + 1) % phases.length);
  } else if (playing) {
    setPlaying(false);
  } else {
    if (elapsed >= duration) goTo(0);
    setPlaying(true);
  }
});

phases.forEach((button, i) => {
  button.disabled = false;
  button.addEventListener("click", () => goTo(i));
});

buttons.forEach((button) => {
  button.disabled = false;
  button.addEventListener("click", () => {
    const selected = button.dataset.preview;
    if (selected === active) return;
    const preview = previews[selected];
    const wasPlaying = playing;
    active = selected;
    artifact.dataset.artifact = selected;
    for (const option of buttons) option.setAttribute("aria-pressed", String(option === button));
    const fields = {
      "paper-type": preview.type.toUpperCase(),
      "paper-title": preview.title,
      "paper-label": preview.label,
      "paper-value": preview.value,
      "paper-source": preview.source,
      "paper-reference": preview.reference,
      "artifact-source": preview.source,
      "artifact-reference": preview.reference,
      "artifact-output": preview.title,
    };
    for (const [id, text] of Object.entries(fields)) document.getElementById(id).textContent = text;
    previewLink.href = preview.href;
    previewLink.querySelector("span").textContent = preview.action;
    if (selected === "galley") {
      previewLink.dataset.track = "eval_download";
      previewLink.dataset.product = "n13";
    } else {
      delete previewLink.dataset.track;
      delete previewLink.dataset.product;
    }
    scene?.show(preview);
    goTo(0);
    if (wasPlaying) setPlaying(true);
  });
});

function displayTilt(x, y) {
  illustration.style.transform = "perspective(1050px) rotateX(" + x + "rad) rotateY(" + y + "rad)";
  backdrop.style.transform = reduce.matches ? "none" : "translate(" + (-y * 12) + "px, " + (x * 14) + "px) scale(1.06)";
  scene?.setTilt(x, y);
}

function tilt(x, y) {
  tiltX = Math.max(-.31, Math.min(.31, x));
  tiltY = Math.max(-.55, Math.min(.55, y));
  displayTilt(tiltX, tiltY);
}

visual.addEventListener("pointerdown", (event) => {
  if (reduce.matches || drag || event.button !== 0) return;
  engaged = true;
  setPlaying(false);
  drag = { id: event.pointerId, x: event.clientX, y: event.clientY, tiltX, tiltY, lastX: event.clientX, velocity: 0, time: event.timeStamp };
  visual.setPointerCapture(event.pointerId);
  visual.dataset.dragging = "true";
});
visual.addEventListener("pointermove", (event) => {
  if (!drag) {
    if (!reduce.matches && event.pointerType === "mouse") {
      const bounds = visual.getBoundingClientRect();
      displayTilt(
        tiltX + (.5 - (event.clientY - bounds.top) / bounds.height) * .105,
        tiltY + ((event.clientX - bounds.left) / bounds.width - .5) * .15,
      );
    }
    return;
  }
  if (drag.id !== event.pointerId) return;
  const dx = event.clientX - drag.x;
  const dy = event.clientY - drag.y;
  drag.velocity = (event.clientX - drag.lastX) / Math.max(1, event.timeStamp - drag.time);
  drag.lastX = event.clientX;
  drag.time = event.timeStamp;
  tilt(drag.tiltX - dy * .006, drag.tiltY + dx * .006);
});
visual.addEventListener("pointerleave", () => {
  if (!drag && !reduce.matches) displayTilt(tiltX, tiltY);
});
function endDrag(event) {
  if (drag?.id !== event.pointerId) return;
  const recent = event.timeStamp - drag.time < 65;
  const momentum = event.type === "pointerup" && recent ? drag.velocity * .12 : 0;
  drag = undefined;
  delete visual.dataset.dragging;
  tilt(tiltX, tiltY + momentum);
}
for (const event of ["pointerup", "pointercancel", "lostpointercapture"]) visual.addEventListener(event, endDrag);
visual.addEventListener("keydown", (event) => {
  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
  event.preventDefault();
  goTo(step + (event.key === "ArrowRight" ? 1 : -1));
});

hint.hidden = false;
function updateMotion() {
  hint.textContent = reduce.matches ? "← / → to change steps"
    : coarse.matches ? "Drag to tilt" : "Drag to tilt · ← / → to change steps";
  if (reduce.matches) tilt(0, 0);
  setPlaying(false);
}
reduce.addEventListener("change", updateMotion);
updateMotion();
document.addEventListener("visibilitychange", sync);

new IntersectionObserver(([entry]) => {
  visible = entry.isIntersecting;
  if (visible && !engaged && !reduce.matches) {
    engaged = true;
    setPlaying(true);
  } else {
    sync();
  }
}, { threshold: .22 }).observe(artifact);

if (matchMedia("(min-width: 43rem) and (pointer: fine)").matches && !reduce.matches) {
  const preload = new IntersectionObserver(async ([entry]) => {
    if (!entry.isIntersecting || reduce.matches) return;
    preload.disconnect();
    try {
      const { mountScene } = await import("./scene.js");
      scene = mountScene(visual, previews[active]);
      scene?.setStep(step);
      scene?.setTilt(tiltX, tiltY);
      setProgress();
    } catch (error) {
      console.info("Source preview is using the CSS illustration.", error.message);
    }
  }, { rootMargin: "280px" });
  preload.observe(visual);
}
