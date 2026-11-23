import { mountTrace } from "./trace.js";

const reduce = matchMedia("(prefers-reduced-motion: reduce)");
const wide = matchMedia("(min-width: 57rem) and (min-height: 43rem)");
const pageMeter = document.querySelector("[data-reading-meter]");
const cover = document.querySelector("[data-cover]");
const coverArt = cover.querySelector("[data-cover-art]");
const purchase = document.getElementById("get");
const purchaseArt = purchase.querySelector(".purchase-art");
const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));

function mountGallery(root) {
  const pin = root.querySelector("[data-gallery-pin]");
  const viewport = root.querySelector("[data-gallery-viewport]");
  const track = root.querySelector("[data-gallery-track]");
  const rail = root.querySelector("[data-gallery-rail]");
  const meter = root.querySelector("[data-gallery-meter]");
  const slides = [...track.querySelectorAll(".gallery-card")];
  const photos = slides.map((slide) => slide.querySelector(".gallery-photo img"));
  const controls = [...rail.querySelectorAll("[data-gallery-control]")];
  let layout;
  let active = 0;
  let lastPosition;

  function select(index) {
    if (index === active) return;
    active = index;
    controls.forEach((control, i) => {
      if (i === index) control.setAttribute("aria-current", "true");
      else control.removeAttribute("aria-current");
    });
  }

  function reset() {
    layout = undefined;
    root.classList.remove("is-pinned");
    root.style.minHeight = "";
    track.style.transform = "";
    rail.hidden = true;
    photos.forEach((photo) => { photo.style.transform = ""; });
  }

  function measure() {
    if (!wide.matches || reduce.matches) {
      reset();
      return;
    }
    root.classList.add("is-pinned");
    rail.hidden = false;
    const width = viewport.clientWidth;
    const height = pin.offsetHeight;
    const inset = parseFloat(getComputedStyle(pin).top) || 0;
    const shift = track.scrollWidth - width;
    if (shift <= 1 || height + inset > innerHeight - 8) {
      reset();
      return;
    }
    const travel = Math.round(innerHeight * .59 * (slides.length - 1));
    const offsets = slides.map((slide) => slide.offsetLeft);
    const stops = offsets.map((offset) => clamp(offset, 0, shift));
    layout = { width, shift, travel, inset, offsets, stops };
    root.style.minHeight = height + travel + "px";
    lastPosition = undefined;
  }

  function update() {
    if (reduce.matches) return;
    if (!layout) {
      photos.forEach((photo) => {
        const rect = photo.parentElement.getBoundingClientRect();
        if (rect.top >= innerHeight + 48 || rect.bottom <= -48) return;
        const phase = clamp((rect.top + rect.height / 2 - innerHeight / 2) / (innerHeight / 2), -1, 1);
        const drift = Math.min(21, rect.height * .085);
        photo.style.transform = "translate3d(0, " + (-phase * drift) + "px, 0) scale(1.18)";
      });
      return;
    }

    const position = clamp((layout.inset - root.getBoundingClientRect().top) / layout.travel);
    if (position === lastPosition) return;
    lastPosition = position;
    const moved = layout.shift * position;
    track.style.transform = "translate3d(" + (-moved) + "px, 0, 0)";
    meter.style.transform = "scaleX(" + position + ")";

    let nearest = 0;
    for (const [index, stop] of layout.stops.entries()) {
      if (Math.abs(stop - moved) < Math.abs(layout.stops[nearest] - moved)) nearest = index;
      const phase = clamp((layout.offsets[index] - moved) / layout.width, -1, 1);
      photos[index].style.transform = "translate3d(" + (-phase * 41) + "px, 0, 0) scale(1.18)";
    }
    select(nearest);
  }

  function jump(index, behavior) {
    if (!layout || index < 0 || index >= slides.length) return;
    const sectionTop = root.getBoundingClientRect().top + scrollY;
    const distance = layout.stops[index] / layout.shift * layout.travel;
    scrollTo({ top: Math.round(sectionTop - layout.inset + distance), behavior });
  }

  function followFragment() {
    const index = slides.findIndex((slide) => "#" + slide.id === location.hash);
    jump(index, "instant");
  }

  controls.forEach((control, index) => control.addEventListener("click", () => jump(index, "smooth")));
  track.addEventListener("focusin", (event) => {
    if (!layout || !event.target.matches(":focus-visible")) return;
    const index = slides.indexOf(event.target.closest(".gallery-card"));
    if (index !== active) jump(index, "instant");
  });
  addEventListener("hashchange", followFragment);

  return { measure, update, followFragment };
}

const gallery = mountGallery(document.querySelector("[data-gallery]"));
const updateTrace = mountTrace(document.querySelector("[data-trace]"), reduce);
let frame = 0;

function draw() {
  frame = 0;
  gallery.update();
  updateTrace();
  if (reduce.matches) return;

  const distance = document.documentElement.scrollHeight - innerHeight;
  pageMeter.style.transform = "scaleX(" + (distance > 0 ? clamp(scrollY / distance) : 0) + ")";
  const coverDistance = cover.offsetHeight;
  const coverProgress = clamp(scrollY / coverDistance);
  coverArt.style.transform = `translate3d(0, ${coverProgress * 9}%, 0) scale(${1 + coverProgress * .085})`;

  const bounds = purchase.getBoundingClientRect();
  if (bounds.top <= innerHeight && bounds.bottom >= 0) {
    const mid = bounds.top + bounds.height / 2;
    const position = clamp((mid - innerHeight / 2) / innerHeight, -1, 1);
    purchaseArt.style.transform = "translate3d(0, " + (-position * 65) + "px, 0)";
  }
}

function schedule() {
  if (!frame) frame = requestAnimationFrame(draw);
}

const animations = new Map();
const entrance = new IntersectionObserver((entries) => {
  for (const { target, isIntersecting } of entries) {
    if (!isIntersecting) continue;
    entrance.unobserve(target);
    if (reduce.matches || target.contains(document.activeElement)) continue;
    const animateTitle = target.hasAttribute("data-scroll-title");
    if (!animateTitle) target.classList.add("has-entered");
    const animation = target.animate(animateTitle ? [
      { clipPath: "inset(92% -8% -15%)", opacity: .3, transform: "translate3d(0,.38em,0)" },
      { clipPath: "inset(-24% -8% -25%)", opacity: 1, transform: "none" },
    ] : [
      { opacity: .56 },
      { opacity: 1 },
    ], {
      duration: animateTitle ? 720 : 640,
      easing: "cubic-bezier(.22, 1, .36, 1)",
    });
    animations.set(target, animation);
    animation.oncancel = animation.onfinish = () => animations.delete(target);
  }
}, { threshold: .18 });
document.querySelectorAll("[data-scroll-title], [data-scroll-panel]").forEach((target) => entrance.observe(target));

document.addEventListener("focusin", (event) => {
  const moving = event.target.closest("[data-scroll-panel]");
  animations.get(moving)?.cancel();
});

function refresh() {
  gallery.measure();
  pageMeter.parentElement.hidden = reduce.matches;
  if (reduce.matches) {
    coverArt.style.transform = "";
    purchaseArt.style.transform = "";
    animations.forEach((animation) => animation.cancel());
  }
  schedule();
}

addEventListener("scroll", schedule, { passive: true });
addEventListener("resize", refresh);
wide.addEventListener("change", refresh);
reduce.addEventListener("change", refresh);
document.fonts.ready.then(() => {
  refresh();
  gallery.followFragment();
});
refresh();
