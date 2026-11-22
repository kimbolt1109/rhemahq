// First-party event instrumentation for rhemahq.com.
// No network calls by default: events buffer in memory and are forwarded only if a
// first-party sink exists (window.plausible or a GA4 window.dataLayer). Pure helpers
// are exported for unit tests; DOM wiring only runs in a browser.

export function buildUtm(href, params) {
  const absolute = /^https?:\/\//i.test(href);
  const url = new URL(href, "https://rhemahq.com");
  for (const [k, v] of Object.entries(params)) {
    if (v !== null && v !== undefined) url.searchParams.set(k, String(v));
  }
  return absolute ? url.toString() : url.pathname + url.search + url.hash;
}

export function createQueue(sink) {
  let buf = [];
  return {
    push(ev) {
      buf.push({ ...ev, ts: Date.now() });
      if (sink) sink(buf.splice(0));
    },
    flush() {
      if (sink && buf.length) sink(buf.splice(0));
      return buf.length;
    },
    get pending() {
      return buf.length;
    },
  };
}

/* ---------------- browser wiring (DOM only) ---------------- */
if (typeof document !== "undefined") {
  const sink = (events) => {
    for (const e of events) {
      if (typeof window.plausible === "function") window.plausible(e.event, { props: e });
      else if (Array.isArray(window.dataLayer)) window.dataLayer.push(e);
    }
  };
  const hasSink = typeof window.plausible === "function" || Array.isArray(window.dataLayer);
  const queue = createQueue(hasSink ? sink : null);

  queue.push({ event: "page_view", path: location.pathname });

  document.addEventListener("click", (e) => {
    const t = e.target.closest("[data-track]");
    if (!t) return;
    queue.push({
      event: t.dataset.track,
      product: t.dataset.product || null,
      href: t.getAttribute("href") || null,
    });
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") queue.flush();
  });
}
