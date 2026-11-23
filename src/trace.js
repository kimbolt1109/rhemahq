const clamp = (value) => Math.min(1, Math.max(0, value));

export function mountTrace(trace, reduce) {
  const chapters = [...trace.querySelectorAll("[data-trace-chapter]")];
  const controls = [...trace.querySelectorAll("[data-trace-control]")];
  const strokes = [...trace.querySelectorAll(".trace-connector > span")];
  const layers = [...trace.querySelectorAll(".trace-layer")];
  let active = 0;
  let scrollIndex = -1;
  let manual = false;

  function show(index) {
    if (index === active) return;
    active = index;
    trace.dataset.traceStep = String(index);
    controls.forEach((button, i) => {
      if (i === index) button.setAttribute("aria-current", "step");
      else button.removeAttribute("aria-current");
    });
  }

  function ink(index, progress) {
    strokes[index].style.transform = "scaleY(" + progress + ")";
  }

  controls.forEach((button, index) => {
    button.disabled = false;
    button.addEventListener("click", () => {
      manual = true;
      show(index);
      strokes.forEach((_, i) => ink(i, Number(i < index)));
    });
  });

  return function update() {
    if (reduce.matches) layers.forEach((layer) => { layer.style.transform = ""; });
    const rect = trace.getBoundingClientRect();
    if (rect.top > innerHeight || rect.bottom < 0) return;

    const line = innerHeight * .59;
    const tops = chapters.map((chapter) => chapter.getBoundingClientRect().top);
    const index = Math.max(0, tops.findLastIndex((top) => top <= line));
    if (index !== scrollIndex) {
      scrollIndex = index;
      manual = false;
      show(index);
    }

    if (!manual) {
      strokes.forEach((_, i) => {
        const fraction = clamp((line - tops[i]) / Math.max(1, tops[i + 1] - tops[i]));
        ink(i, reduce.matches ? Number(i < index) : fraction);
      });
    }

    if (!reduce.matches) {
      const progress = clamp((line - tops[0]) / Math.max(1, tops.at(-1) - tops[0]));
      const spread = .15 + progress * .85;
      layers[0].style.transform = "translate3d(" + (-11 * spread) + "px, " + (13 * spread) + "px, 0) rotate(" + (-2.9 * spread) + "deg)";
      layers[1].style.transform = "translate3d(" + (10 * spread) + "px, " + (8 * spread) + "px, 0) rotate(" + (2.1 * spread) + "deg)";
    }
  };
}
