import { mountTrace } from "../trace.js";

const reduce = matchMedia("(prefers-reduced-motion: reduce)");
const scenes = [...document.querySelectorAll("[data-scroll-scene]")];
const trace = document.querySelector("[data-trace]");
const updateTrace = trace ? mountTrace(trace, reduce) : null;
let frame = 0;

function draw() {
  frame = 0;
  updateTrace?.();
  if (reduce.matches) return;
  for (const scene of scenes) {
    const { top, height } = scene.getBoundingClientRect();
    if (!height || top > innerHeight || top + height < 0) continue;
    const progress = scene.dataset.scrollScene === "cover"
      ? -top / height
      : (innerHeight - top) / (innerHeight + height);
    scene.style.setProperty("--scene-progress", Math.min(1, Math.max(0, progress)).toFixed(3));
  }
}

function schedule() {
  if (!frame) frame = requestAnimationFrame(draw);
}

addEventListener("scroll", schedule, { passive: true });
addEventListener("resize", schedule);
document.fonts.ready.then(schedule);
reduce.addEventListener("change", () => {
  if (reduce.matches) scenes.forEach((scene) => scene.style.removeProperty("--scene-progress"));
  schedule();
});
schedule();

if (!reduce.matches) {
  const reveal = new IntersectionObserver((entries) => {
    for (const { isIntersecting, target } of entries) {
      if (!isIntersecting) continue;
      if (!target.contains(document.activeElement)) target.classList.add("product-entered");
      reveal.unobserve(target);
    }
  }, { threshold: .12 });
  document.querySelectorAll("[data-product-reveal]").forEach((element) => reveal.observe(element));
}
