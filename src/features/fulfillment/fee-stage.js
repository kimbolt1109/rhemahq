import { reconcileRows } from "../../domain/fulfillment/ledger.js";
import { LEDGER_SAMPLE } from "./sample.js";

const stage = document.querySelector("[data-fee-stage]");
const canvas = stage.querySelector("[data-fee-route]");
const context = canvas.getContext("2d");
const slider = stage.querySelector("[data-fee-slider]");
const buttons = [...stage.querySelectorAll("[data-fee-step]")];
const controls = stage.querySelector("[data-fee-controls]");
const number = stage.querySelector("[data-fee-number]");
const kind = stage.querySelector("[data-fee-type]");
const name = stage.querySelector("[data-fee-name]");
const detail = stage.querySelector("[data-fee-detail]");
const announcement = stage.querySelector("[data-fee-message]");
const paper = stage.querySelector(".fee-paper");
const reduce = matchMedia("(prefers-reduced-motion: reduce)");
const row = LEDGER_SAMPLE[0];
const result = reconcileRows(LEDGER_SAMPLE).summary.find(({ label }) => label === row.label);
const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: row.currency });
const stops = [
  ["Source row", row.row, row.file, row.sheet + " · row " + row.row],
  ["Billed charge", currency.format(row.total), row.label, row.quantity + " × " + currency.format(row.unit)],
  ["Monthly rollup", currency.format(result.total), result.label, result.count + " source rows · " + result.month],
];
const route = [[.012, .80], [.13, .80], [.26, .64], [.43, .64], [.57, .33], [.82, .33], [.973, .13]];
const travel = [.22, .62, 1];
let width = 0;
let height = 0;
let ratio = 1;
let active = 0;
let progress = travel[0];
let frame = 0;
let lastTime;

function paint() {
  if (!context || !width || !height) return;
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, width, height);
  const points = route.map(([x, y]) => [x * width, y * height]);
  context.lineWidth = 1;
  context.lineJoin = "round";
  context.strokeStyle = "#ffe0b163";
  context.setLineDash([2, 6]);
  context.beginPath();
  context.moveTo(...points[0]);
  points.slice(1).forEach((point) => context.lineTo(...point));
  context.stroke();
  context.setLineDash([]);

  const lengths = points.slice(1).map(([x, y], i) => Math.hypot(x - points[i][0], y - points[i][1]));
  let remaining = lengths.reduce((a, b) => a + b, 0) * progress;
  let tip = points[0];
  context.beginPath();
  context.moveTo(...tip);
  for (const [index, distance] of lengths.entries()) {
    const [x, y] = points[index];
    const [endX, endY] = points[index + 1];
    const portion = Math.min(1, remaining / distance);
    tip = [x + (endX - x) * portion, y + (endY - y) * portion];
    context.lineTo(...tip);
    remaining -= distance;
    if (remaining <= 0) break;
  }
  context.lineWidth = 2;
  context.strokeStyle = "#ffca81";
  context.shadowColor = "#ffa843";
  context.shadowBlur = 15;
  context.stroke();
  context.beginPath();
  context.arc(...tip, 4, 0, 2 * Math.PI);
  context.fillStyle = "#fff1ce";
  context.fill();
  context.shadowBlur = 0;
}

function tick(time) {
  const target = travel[active];
  const elapsed = lastTime === undefined ? 16 : Math.min(40, time - lastTime);
  lastTime = time;
  progress += (target - progress) * (1 - Math.exp(-elapsed / 68));
  if (reduce.matches || Math.abs(target - progress) < .002) progress = target;
  paint();
  if (progress !== target) {
    frame = requestAnimationFrame(tick);
  } else {
    frame = 0;
    lastTime = undefined;
  }
}

function select(index, announce = false) {
  const [type, value, title, subtitle] = stops[index];
  active = index;
  stage.dataset.feeStep = String(index);
  slider.value = String(index);
  slider.style.setProperty("--fee-position", (index * 50) + "%");
  slider.setAttribute("aria-valuetext", type + ", " + value);
  kind.textContent = type;
  number.textContent = value;
  name.textContent = title;
  detail.textContent = subtitle;
  buttons.forEach((button, position) => button.setAttribute("aria-pressed", String(position === index)));
  if (announce) announcement.textContent = type + ", " + value + ", " + subtitle;
  if (!frame) frame = requestAnimationFrame(tick);
}

new ResizeObserver(([entry]) => {
  ({ width, height } = entry.contentRect);
  ratio = Math.min(devicePixelRatio, 2);
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  paint();
}).observe(canvas);

slider.addEventListener("input", () => select(Number(slider.value)));
buttons.forEach((button, index) => button.addEventListener("click", () => select(index, true)));
stage.addEventListener("pointermove", (event) => {
  if (reduce.matches || event.pointerType !== "mouse") return;
  const bounds = stage.getBoundingClientRect();
  const x = (event.clientX - bounds.left) / bounds.width - .5;
  const y = (event.clientY - bounds.top) / bounds.height - .5;
  paper.style.setProperty("--tilt-y", (x * 12).toFixed(2) + "deg");
  paper.style.setProperty("--tilt-x", (-y * 10).toFixed(2) + "deg");
});
function resetTilt() {
  paper.style.removeProperty("--tilt-x");
  paper.style.removeProperty("--tilt-y");
}
stage.addEventListener("pointerleave", resetTilt);
reduce.addEventListener("change", resetTilt);
select(0);
controls.hidden = false;
