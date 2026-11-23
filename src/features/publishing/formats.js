import { mountTabs } from "../product-tabs.js";
import { mountHorizontalSwipe } from "../product-swipe.js";

const controls = document.querySelector("[data-format-controls]");
const press = document.querySelector("[data-press]");
const surface = press.querySelector("[data-press-surface]");
const page = press.querySelector("[data-press-page]");
const turning = press.querySelector("[data-press-turning]");
const outgoing = turning.querySelector("[data-press-outgoing]");
const label = press.querySelector("[data-press-label]");
const download = press.querySelector("[data-press-download]");
const pdf = page.firstElementChild;
const templates = [...press.querySelectorAll("[data-press-template]")];
const formats = [...controls.querySelectorAll("button")].map((button) => ({
  name: button.textContent,
  file: document.getElementById(button.getAttribute("aria-controls")).querySelector("a[download]").href,
}));
const reduce = matchMedia("(prefers-reduced-motion: reduce)");
let active = 0;
let dragAngle = 0;
let directionHint;
let animation;

function stopTurn() {
  animation?.cancel();
  animation = undefined;
  turning.hidden = true;
}

function render(index, previous) {
  stopTurn();
  const old = page.firstElementChild;
  const replacement = index === 0 ? pdf.cloneNode(true) : templates[index - 1].content.cloneNode(true);
  page.replaceChildren(replacement);
  const format = formats[index];
  label.textContent = format.name;
  download.href = format.file;
  download.querySelector("span").textContent = "Download " + format.name;
  press.dataset.pressFormat = format.name;
  active = index;
  if (previous === undefined || reduce.matches) return;

  const direction = directionHint ?? Math.sign(index - previous);
  outgoing.replaceChildren(old);
  turning.hidden = false;
  const start = dragAngle;
  const angle = direction > 0 ? -173 : 86;
  const turn = turning.animate([
    { transform: `rotateY(${start}deg)`, opacity: 1 },
    { transform: `rotateY(${angle * .8}deg)`, opacity: .94, offset: .65 },
    { transform: `rotateY(${angle}deg)`, opacity: .04 },
  ], { duration: 440, easing: "cubic-bezier(.23, 1, .32, 1)" });
  animation = turn;
  turn.onfinish = () => {
    if (animation === turn) stopTurn();
  };
}

const select = mountTabs(controls, render);

function advance(direction) {
  directionHint = direction;
  select((active + direction + formats.length) % formats.length);
  directionHint = undefined;
}

press.querySelector("[data-press-prev]").addEventListener("click", () => advance(-1));
press.querySelector("[data-press-next]").addEventListener("click", () => advance(1));
press.querySelector("[data-press-controls]").hidden = false;

function resetBend() {
  page.style.removeProperty("--page-bend");
  dragAngle = 0;
}

mountHorizontalSwipe(surface, {
  move(distance) {
    if (reduce.matches) return;
    if (animation) stopTurn();
    const bend = distance / (surface.clientWidth * .005 + Math.abs(distance) / 95);
    dragAngle = Math.max(-74, Math.min(39, bend));
    page.style.setProperty("--page-bend", dragAngle.toFixed(2) + "deg");
  },
  finish(direction) {
    if (direction) advance(direction);
    resetBend();
  },
});
reduce.addEventListener("change", () => {
  stopTurn();
  resetBend();
});
