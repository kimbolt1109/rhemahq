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
  const buf = [];
  function flush() {
    if (sink && buf.length && sink(buf.slice()) !== false) buf.length = 0;
    return buf.length;
  }
  return {
    push(ev) {
      buf.push({ ...ev, ts: Date.now() });
      flush();
    },
    flush,
    get pending() {
      return buf.length;
    },
  };
}

/* ---------------- browser wiring (DOM only) ---------------- */
if (typeof document !== "undefined") {
  const sink = (events) => {
    if (typeof window.plausible === "function") {
      for (const e of events) window.plausible(e.event, { props: e });
      return true;
    }
    if (!Array.isArray(window.dataLayer)) return false;
    for (const e of events) window.dataLayer.push(e);
    return true;
  };
  const queue = createQueue(sink);

  queue.push({ event: "page_view", path: location.pathname });

  function track(e) {
    const t = e.target.closest?.("[data-track]");
    if (!t) return;
    if ((t.dataset.track === "demo_upload") !== (e.type === "change")) return;
    if (e.type === "change" && !t.files?.length) return;
    queue.push({
      event: t.dataset.track,
      product: t.dataset.product || null,
      href: t.getAttribute("href") || null,
    });
  }
  document.addEventListener("click", track, true);
  document.addEventListener("change", track, true);

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") queue.flush();
  });
}
