import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import vm from "node:vm";
import { reconcileRows } from "../src/domain/fulfillment/ledger.js";
import { readInvoice } from "../src/infrastructure/fulfillment/invoices.js";

const vendor = new URL("../tools/ledger/vendor/xlsx.full.min.js", import.meta.url);
const module = { exports: {} };
vm.runInNewContext(await readFile(vendor, "utf8"), { module, exports: module.exports, ArrayBuffer, Uint8Array, DataView, TextDecoder, TextEncoder });
const xlsx = module.exports;

const csv = '\uFEFFDate,Order Number,SKU,Service Type,Quantity,Unit Cost,Total Amount\r\n'
  + '2026-11-04,101,SYN,"Pick\r\n& Pack",2,1.5,3\r\n\r\n'
  + "2026-11-05,102,SYN,Credit,1,-1,-1\r\n";
const columns = {
  provider: { value: "Trial provider" }, currency: { value: "usd" }, date: { column: "A" },
  label: { column: "D" }, quantity: { column: "E" }, unit: { column: "F" }, total: { column: "G" },
};

test("mapped CSV keeps the original BOM and line endings in its hash and reports logical records", async () => {
  const file = new File([csv], "untouched.csv");
  const rows = await readInvoice(file, xlsx, ({ file: original, sheet, columns: available }) => {
    assert.equal(original, "untouched.csv");
    assert.equal(sheet, "Sheet1");
    assert.equal(available.find(({ column }) => column === "G").label, "Total Amount");
    return columns;
  });
  assert.deepEqual(rows.map(({ row }) => row), [2, 4]);
  assert.equal(rows[0].label, "Pick\r\n& Pack");
  const digest = createHash("sha256").update(csv).digest("hex");
  assert.ok(rows.every((row) => row.file === file.name && row.sha256 === digest && row.currency === "USD"));
  assert.deepEqual(reconcileRows(rows).summary.map((group) => group.total), [3, -1]);
});

test("mapped XLSX keeps sheet names and absolute row addresses with Excel date serials", async () => {
  const book = xlsx.utils.book_new();
  book.Workbook = { WBProps: { date1904: true } };
  const serial = (Date.UTC(2026, 10, 4) - Date.UTC(1904, 0, 1)) / 86_400_000;
  const standard = xlsx.utils.aoa_to_sheet([
    ["provider", "currency", "date", "fee", "total"], ["Canonical", "EUR", serial, "Sample", 2],
  ]);
  const mapped = xlsx.utils.aoa_to_sheet([]);
  xlsx.utils.sheet_add_aoa(mapped, [["Bill Date", "Fee Type", "Billed", "ISO"], [serial, "Adjustment", -1, "GBP"]], { origin: "B5" });
  xlsx.utils.book_append_sheet(book, standard, "Unchanged");
  xlsx.utils.book_append_sheet(book, mapped, "Vendor export");
  const bytes = xlsx.write(book, { type: "array", bookType: "xlsx" });
  const rows = await readInvoice(new File([bytes], "untouched.xlsx"), xlsx, ({ sheet, columns: available }) => {
    assert.equal(sheet, "Vendor export");
    assert.equal(available[0].column, "B");
    return {
      provider: { value: "Mapped" }, currency: { column: "E" }, date: { column: "B" },
      label: { column: "C" }, total: { column: "D" },
    };
  });
  assert.deepEqual(rows.map(({ sheet, row, date, currency, total }) => [sheet, row, date, currency, total]), [
    ["Unchanged", 2, "2026-11-04", "EUR", 2], ["Vendor export", 6, "2026-11-04", "GBP", -1],
  ]);
  assert.ok(rows.every(({ sha256 }) => sha256 === createHash("sha256").update(new Uint8Array(bytes)).digest("hex")));
});

test("mapping rejects ambiguous choices, invalid rows and cancellation", async () => {
  const file = new File([csv], "untouched.csv");
  await assert.rejects(readInvoice(file, xlsx, () => ({ ...columns, total: { column: "D" } })), /separate column/);
  await assert.rejects(readInvoice(file, xlsx, () => ({ ...columns, currency: { value: "US" } })), /three-letter currency/);
  await assert.rejects(readInvoice(file, xlsx, () => undefined), /Column mapping cancelled/);
  const invalid = new File([csv.replace("1.5,3", "1.5,text")], "invalid.csv");
  await assert.rejects(readInvoice(invalid, xlsx, () => columns), /Sheet1, row 2: total must be a number/);
  const duplicate = new File(["provider,currency,date,label,total,total\nA,USD,2026-11-04,B,1,2\n"], "duplicate.csv");
  await assert.rejects(readInvoice(duplicate, xlsx, ({ columns: available }) => {
    assert.equal(available.filter(({ label }) => label === "total").length, 2);
    return undefined;
  }), /Column mapping cancelled/);
});
