import assert from "node:assert/strict";
import { test } from "node:test";
import { agencyStorageKey, agencyStore, closeReview, invoiceLayoutKey } from "../src/domain/fulfillment/agency.js";

function localSettings() {
  const data = new Map();
  return { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
}

test("four local workflows keep presets scoped and save only labels and mapping configuration", async () => {
  const storage = localSettings();
  const store = agencyStore(storage);
  for (const name of ["North", "South", "East", "West"]) store.add(name);
  assert.throws(() => store.add("Fifth"), /four client workflows/);
  const [north, south] = store.list();
  const signature = await invoiceLayoutKey([{ column: "A", label: "Posting Date" }, { column: "B", label: "Signed Amount" }]);
  store.savePresets(north.id, [[signature, {
    provider: { value: " Pacific Logistics " },
    date: { column: "A", sampleRow: "invoice-secret" },
    total: { column: "B" },
    sourceHash: { value: "not-a-preset-field" },
  }]]);
  assert.deepEqual(store.preset(north.id, signature), {
    provider: { value: "Pacific Logistics" }, date: { column: "A" }, total: { column: "B" },
  });
  assert.equal(store.preset(south.id, signature), undefined);
  const serialized = storage.getItem(agencyStorageKey);
  assert.doesNotMatch(serialized, /Posting Date|Signed Amount|invoice-secret|sourceHash|not-a-preset-field/);
  assert.deepEqual(agencyStore(storage).list().map(({ label }) => label), ["North", "South", "East", "West"]);
  store.remove(north.id);
  assert.equal(store.preset(north.id, signature), undefined);
  store.add("New North");
  const replacement = store.list().at(-1);
  assert.notEqual(replacement.id, north.id);
  assert.equal(store.preset(replacement.id, signature), undefined);
});

test("a preset signature matches identical ordered headers and rejects moved or edited source columns", async () => {
  const columns = [
    { column: "A", label: "Posting Date" },
    { column: "B", label: "Service" },
    { column: "D", label: "Bill Currency" },
  ];
  const signature = await invoiceLayoutKey(columns);
  assert.match(signature, /^[0-9a-f]{64}$/);
  assert.equal(signature, await invoiceLayoutKey(columns.map((column) => ({ ...column }))));
  assert.notEqual(signature, await invoiceLayoutKey([...columns].reverse()));
  assert.notEqual(signature, await invoiceLayoutKey(columns.map((column) => column.column === "D" ? { ...column, column: "C" } : column)));
  assert.notEqual(signature, await invoiceLayoutKey(columns.map((column) => column.column === "A" ? { ...column, label: "Date" } : column)));
});

test("close review keeps currency and month separate with exact signed totals and raw source hashes", () => {
  const records = [
    ["2026-10-02", "USD", "Pick and pack", 9.75],
    ["2026-10-18", "USD", "Credit", -0.75],
    ["2026-10-19", "USD", "Receiving", 0.2],
    ["2026-11-02", "USD", "Pick and pack", 10],
    ["2026-11-12", "USD", "Credit", -2],
    ["2026-11-12", "EUR", "Storage", 11.11],
    ["2026-11-15", "KWD", "Handling", 0.1],
    ["2026-11-15", "KWD", "Handling", 0.2],
    ["2026-11-15", "KWD", "Credit", -0.3],
    ["2026-11-15", "KWD", "Receiving", 1e-7],
  ];
  const hash = "a".repeat(64);
  const rows = records.map(([date, currency, label, total], index) => ({
    file: "original.csv", sheet: "Sheet1", row: index + 2, sha256: hash,
    provider: "Demo Logistics", date, currency, label, total,
  }));
  const { totals, trace } = closeReview(rows, "North");
  assert.deepEqual(totals.map((r) => [r.workflow, r.currency, r.month, r.rows, r.charges, r.credits, r.net]), [
    ["North", "USD", "2026-10", 3, 9.95, -0.75, 9.2],
    ["North", "USD", "2026-11", 2, 10, -2, 8],
    ["North", "EUR", "2026-11", 1, 11.11, 0, 11.11],
    ["North", "KWD", "2026-11", 4, 0.3000001, -0.3, 1e-7],
  ]);
  assert.deepEqual(trace[4], { workflow: "North", ...rows[4] });
  assert.ok(trace.every((row) => row.sha256 === hash));
});

test("close rejects a repeated original source position even when the filename changes", () => {
  const original = {
    file: "original.xlsx", sheet: "First", row: 2, sha256: "a".repeat(64),
    provider: "Demo Logistics", date: "2026-10-02", currency: "USD", label: "Pick and pack", total: 0.1,
  };
  const distinct = [original, { ...original, row: 3 }, { ...original, sheet: "Second" }, { ...original, sha256: "b".repeat(64) }];
  assert.equal(closeReview(distinct, "North").totals[0].net, 0.4);
  assert.throws(() => closeReview([...distinct, { ...original, file: "renamed.xlsx" }], "North"), /source position is repeated in renamed\.xlsx/);
});
