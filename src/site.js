// Sync Sanctuary site module.
// Pure handoff logic is exported for unit tests; browser wiring only runs in a DOM.

export async function sha256Hex(text) {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// rows: {file, sheet, row, provider, batch, currency, date, label, quantity, unit, total}
export function reconcileRows(rows) {
  const groups = new Map();
  for (const r of rows) {
    const month = String(r.date || "").slice(0, 7);
    const key = [r.provider, r.currency, month, r.label].join("|");
    if (!groups.has(key)) {
      groups.set(key, { provider: r.provider, currency: r.currency, month, label: r.label, count: 0, quantity: null, unit: r.unit ?? null, total: 0 });
    }
    const g = groups.get(key);
    g.count += 1;
    g.total += Number(r.total) || 0;
    if (r.quantity !== null && r.quantity !== undefined && r.quantity !== "") {
      g.quantity = (g.quantity ?? 0) + Number(r.quantity);
    }
  }
  const summary = [...groups.values()].map((g) => ({ ...g, total: round2(g.total) }));
  const sources = rows.map((r) => ({ file: r.file, sheet: r.sheet, row: r.row, label: r.label, total: round2(Number(r.total) || 0) }));
  return { summary, sources };
}

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// questions: {category, id, type, xml, line}
export async function buildMoodleRelease(questions) {
  const seen = new Set();
  const counts = {};
  const receipt = [];
  const parts = ['<?xml version="1.0" encoding="UTF-8"?>', "<quiz>"];
  let lastCategory = null;
  for (const q of questions) {
    const dupKey = q.category + "|" + q.id;
    if (seen.has(dupKey)) {
      throw new Error(`Duplicate question id ${q.id} in category ${q.category}`);
    }
    seen.add(dupKey);
    if (q.category !== lastCategory) {
      parts.push(`  <question type="category"><category><text>$course$/top/${escapeXml(q.category)}</text></category></question>`);
      lastCategory = q.category;
    }
    parts.push(q.xml);
    counts[q.category] = (counts[q.category] || 0) + 1;
    receipt.push({ category: q.category, id: q.id, line: q.line, checksum: await sha256Hex(q.xml) });
  }
  parts.push("</quiz>");
  return { importXml: parts.join("\n"), receipt, counts };
}

function escapeXml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export const LEDGER_SAMPLE = [
  { file: "invoice_march.xlsx", sheet: "Sheet1", row: 128, provider: "ShipBob", batch: "MAR-01", currency: "USD", date: "2026-03-04", label: "Pick & Pack", quantity: 42, unit: 1.1, total: 46.2 },
  { file: "invoice_march.xlsx", sheet: "Sheet1", row: 129, provider: "ShipBob", batch: "MAR-01", currency: "USD", date: "2026-03-04", label: "Pick & Pack", quantity: 17, unit: 1.1, total: 18.7 },
  { file: "invoice_march.xlsx", sheet: "Sheet1", row: 130, provider: "ShipBob", batch: "MAR-01", currency: "USD", date: "2026-03-11", label: "Storage", quantity: null, unit: null, total: 120.0 },
  { file: "invoice_march_b.xlsx", sheet: "Fees", row: 8, provider: "ShipBob", batch: "MAR-02", currency: "USD", date: "2026-03-18", label: "Returns", quantity: 5, unit: 2.5, total: 12.5 },
  { file: "invoice_march_b.xlsx", sheet: "Fees", row: 9, provider: "ShipBob", batch: "MAR-02", currency: "USD", date: "2026-03-18", label: "Credit", quantity: null, unit: null, total: -6.0 },
];

export const MOODLE_SAMPLE = [
  { category: "Release pack / demo", id: "q-101", type: "multichoice", line: 12, xml: '  <question type="multichoice"><name><text>Capital of France</text></name><questiontext format="html"><text>What is the capital of France?</text></questiontext><answer fraction="100"><text>Paris</text></answer><answer fraction="0"><text>Lyon</text></answer></question>' },
  { category: "Release pack / demo", id: "q-102", type: "truefalse", line: 30, xml: '  <question type="truefalse"><name><text>Water boils at 100C at sea level</text></name><questiontext format="html"><text>Water boils at 100C at sea level.</text></questiontext><answer fraction="100"><text>true</text></answer></question>' },
  { category: "Release pack / cloze", id: "q-201", type: "cloze", line: 47, xml: '  <question type="cloze"><name><text>Fill the blanks</text></name><questiontext format="html"><text>The capital of France is {1:SHORTANSWER:=Paris} and it sits on the {1:SHORTANSWER:=Seine}.</text></questiontext></question>' },
];

/* ---------------- browser wiring (DOM only) ---------------- */
if (typeof document !== "undefined") {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
  }, { threshold: 0.15 });
  document.querySelectorAll(".reveal").forEach((el) => io.observe(el));

  // count-up stats
  const statIo = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      statIo.unobserve(e.target);
      const target = Number(e.target.dataset.count);
      if (reduce) { e.target.textContent = target; continue; }
      const t0 = performance.now();
      const tick = (t) => {
        const p = Math.min(1, (t - t0) / 900);
        e.target.textContent = Math.round(target * (1 - Math.pow(2, -10 * p)));
        if (p < 1) requestAnimationFrame(tick); else e.target.textContent = target;
      };
      requestAnimationFrame(tick);
    }
  }, { threshold: 0.4 });
  document.querySelectorAll("[data-count]").forEach((el) => statIo.observe(el));

  // self-drawing provenance wires
  document.querySelectorAll(".provenance .wire").forEach((p, i) => {
    const len = p.getTotalLength();
    p.style.strokeDasharray = len;
    p.style.strokeDashoffset = reduce ? 0 : len;
    if (!reduce) {
      p.style.transition = `stroke-dashoffset 1.1s cubic-bezier(0.16,1,0.3,1) ${0.3 + i * 0.15}s`;
      requestAnimationFrame(() => requestAnimationFrame(() => { p.style.strokeDashoffset = 0; }));
    }
  });

  // streaming receipt console
  const receiptEl = document.getElementById("receipt");
  const LINES = [
    "read  invoice_march.xlsx · Sheet1",
    "row 128  Pick & Pack   42 × 1.10 = 46.20",
    "row 129  Pick & Pack   17 × 1.10 = 18.70",
    "row 130  Storage      —        = 120.00",
    "sha256 9f2c…a41d  ✓ tied to source",
    "write fulfillment_ledger.xlsx · 2 sheets",
  ];
  if (receiptEl) {
    if (reduce) {
      receiptEl.innerHTML = LINES.map((l) => l.includes("✓") ? `<span class="ok">${l}</span>` : l).join("\n");
    } else {
      let li = 0, ci = 0, out = "";
      const type = () => {
        if (li >= LINES.length) { setTimeout(() => { li = 0; ci = 0; out = ""; receiptEl.innerHTML = ""; type(); }, 2600); return; }
        const line = LINES[li];
        ci++;
        const shown = out + line.slice(0, ci);
        receiptEl.innerHTML = (shown.includes("✓") ? `<span class="ok">${shown}</span>` : shown);
        if (ci >= line.length) { out += line + "\n"; li++; ci = 0; setTimeout(type, 220); }
        else setTimeout(type, Math.random() * 37 + 18);
      };
      type();
    }
  }

  // marquee (constant velocity)
  const track = document.getElementById("marquee");
  if (track && !reduce) {
    track.innerHTML += track.innerHTML;
    let x = 0, last = performance.now();
    const half = () => track.scrollWidth / 2;
    const loop = (t) => { x -= (t - last) * 0.04; last = t; if (-x >= half()) x += half(); track.style.transform = `translateX(${x}px)`; requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }

  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const table = (head, rows) => `<table><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td class="${typeof c === "number" ? "num" : ""}">${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;

  /* ---- Fulfillment Ledger demo ---- */
  let ledgerRows = null, ledgerHashes = {}, ledgerOut = null;
  const lRun = document.getElementById("ledger-run"), lDl = document.getElementById("ledger-download");
  const setLedger = (rows, hashes) => { ledgerRows = rows; ledgerHashes = hashes; lRun.disabled = false; };
  document.querySelector('[data-sample="ledger"]').addEventListener("click", async () => {
    const csv = "provider,batch,currency,date,label,quantity,unit,total\n" + LEDGER_SAMPLE.map((r) => [r.provider, r.batch, r.currency, r.date, `"${r.label}"`, r.quantity ?? "", r.unit ?? "", r.total].join(",")).join("\n");
    ledgerHashes = { "invoice_march.xlsx": await sha256Hex(csv), "invoice_march_b.xlsx": await sha256Hex(csv) };
    setLedger(LEDGER_SAMPLE, ledgerHashes);
    document.getElementById("ledger-note").textContent = "Synthetic sample loaded (5 rows, 2 files). Build the workbook.";
  });
  document.getElementById("ledger-file").addEventListener("change", async (e) => {
    const f = e.target.files[0]; if (!f) return;
    const buf = await f.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const rows = []; const hashes = {};
    hashes[f.name] = await sha256Hex(new TextDecoder().decode(buf));
    for (const sn of wb.SheetNames) {
      const json = XLSX.utils.sheet_to_json(wb.Sheets[sn], { defval: "" });
      json.forEach((r, i) => rows.push({ file: f.name, sheet: sn, row: i + 2, provider: r.provider || r.Provider || "", batch: r.batch || "", currency: r.currency || "USD", date: r.date || "", label: r.label || r.fee || "", quantity: r.quantity === "" ? null : r.quantity, unit: r.unit === "" ? null : r.unit, total: r.total || 0 }));
    }
    setLedger(rows, hashes);
    document.getElementById("ledger-note").textContent = `Loaded ${f.name}: ${rows.length} rows. Build the workbook.`;
  });
  lRun.addEventListener("click", () => {
    ledgerOut = reconcileRows(ledgerRows);
    document.getElementById("ledger-summary").innerHTML = "<h4>Sheet 1 · fee rollup</h4>" + table(["provider", "currency", "month", "label", "rows", "qty", "unit", "total"], ledgerOut.summary.map((g) => [g.provider, g.currency, g.month, g.label, g.count, g.quantity ?? "", g.unit ?? "", g.total]));
    document.getElementById("ledger-sources").innerHTML = "<h4>Sheet 2 · source references</h4>" + table(["file", "sheet", "row", "label", "total", "sha256"], ledgerOut.sources.map((s) => [s.file, s.sheet, s.row, s.label, s.total, (ledgerHashes[s.file] || "").slice(0, 12) + "…"]));
    lDl.disabled = false;
  });
  lDl.addEventListener("click", () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(ledgerOut.summary), "Fee rollup");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(ledgerOut.sources.map((s) => ({ ...s, sha256: ledgerHashes[s.file] || "" }))), "Source references");
    XLSX.writeFile(wb, "fulfillment_ledger.xlsx");
  });

  /* ---- Moodle Release Pack demo ---- */
  let moodleQuestions = null, moodleOut = null;
  const mRun = document.getElementById("moodle-run"), mDl = document.getElementById("moodle-download");
  const parseMoodle = (text) => {
    const doc = new DOMParser().parseFromString(text, "text/xml");
    if (doc.querySelector("parsererror")) throw new Error("Not well-formed XML");
    const qs = []; let category = "default"; let line = 1;
    const serial = new XMLSerializer();
    doc.querySelectorAll("quiz > question").forEach((node) => {
      const type = node.getAttribute("type");
      if (type === "category") { category = node.querySelector("category text")?.textContent?.split("/").pop() || category; return; }
      const id = node.querySelector("name text")?.textContent || `q-${line}`;
      qs.push({ category, id, type, line, xml: "  " + serial.serializeToString(node) });
      line++;
    });
    return qs;
  };
  document.querySelector('[data-sample="moodle"]').addEventListener("click", () => {
    moodleQuestions = MOODLE_SAMPLE; mRun.disabled = false;
    document.getElementById("moodle-note").textContent = "Synthetic sample loaded (3 questions, 2 categories). Build the release.";
  });
  document.getElementById("moodle-file").addEventListener("change", async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try { moodleQuestions = parseMoodle(await f.text()); mRun.disabled = false; document.getElementById("moodle-note").textContent = `Loaded ${f.name}: ${moodleQuestions.length} questions.`; }
    catch (err) { document.getElementById("moodle-note").textContent = `Could not read ${f.name}: ${err.message}`; }
  });
  mRun.addEventListener("click", async () => {
    try {
      moodleOut = await buildMoodleRelease(moodleQuestions);
      document.getElementById("moodle-counts").innerHTML = "<h4>Counts per category</h4>" + table(["category", "questions"], Object.entries(moodleOut.counts));
      document.getElementById("moodle-receipt").innerHTML = "<h4>Source receipt</h4>" + table(["category", "id", "line", "checksum"], moodleOut.receipt.map((r) => [r.category, r.id, r.line, r.checksum.slice(0, 16) + "…"]));
      mDl.disabled = false;
    } catch (err) { document.getElementById("moodle-note").textContent = err.message; }
  });
  mDl.addEventListener("click", () => {
    const blob = new Blob([moodleOut.importXml], { type: "application/xml" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = "moodle_import.xml"; a.click();
    URL.revokeObjectURL(a.href);
  });
}
