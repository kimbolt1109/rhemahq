import { reconcileRows } from "../../domain/fulfillment/ledger.js";
import { readInvoice } from "../../infrastructure/fulfillment/invoices.js";
import { wireWorkbench } from "../../workbench.js";
import { LEDGER_SAMPLE } from "./sample.js";
import { invoiceMappingDialog } from "./column-mapping.js";

async function ledgerSample() {
  const xlsx = globalThis.XLSX;
  const columns = ["provider", "currency", "date", "label", "quantity", "unit", "total"];
  const files = new Map();
  for (const row of LEDGER_SAMPLE) {
    if (!files.has(row.file)) files.set(row.file, { name: row.sheet, sheet: xlsx.utils.aoa_to_sheet([columns]) });
    xlsx.utils.sheet_add_aoa(files.get(row.file).sheet, [columns.map((column) => row[column])], {
      origin: { r: row.row - 1, c: 0 },
    });
  }
  const inputs = await Promise.all(Array.from(files, ([name, { sheet, name: sheetName }]) => {
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, sheet, sheetName);
    const bytes = xlsx.write(workbook, { type: "array", bookType: "xlsx" });
    return readInvoice(new File([bytes], name), xlsx);
  }));
  return inputs.flat();
}

function saveWorkbook(output) {
  const xlsx = globalThis.XLSX;
  const workbook = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(workbook, xlsx.utils.json_to_sheet(output.summary), "Fee rollup");
  const sources = output.sources.map((row) => ({ ...row, positionType: positionType(row.file) }));
  xlsx.utils.book_append_sheet(workbook, xlsx.utils.json_to_sheet(sources), "Source references");
  xlsx.writeFile(workbook, "fulfillment_ledger.xlsx");
}

const positionType = (file) => /\.csv$/i.test(file) ? "CSV record" : "Excel row";

const ledger = {
  available: () => Boolean(globalThis.XLSX),
  sample: ledgerSample,
  build: reconcileRows,
  download: saveWorkbook,
  inputName: "invoice rows",
  describe: (output) => output.summary.length + " rollup groups and " + output.sources.length + " source references.",
  summary: (output) => ({
    title: "Fee rollup",
    columns: ["Provider", "Currency", "Month", "Label", "Rows", "Qty", "Unit", "Total"],
    rows: output.summary.map((row) => [row.provider, row.currency, row.month, row.label, row.count, row.quantity, row.unit, row.total]),
  }),
  receipt: (output) => ({
    title: "Source references",
    columns: ["File", "Sheet", "Position", "Position type", "Label", "Total", "SHA-256"],
    rows: output.sources.map((row) => [row.file, row.sheet, row.row, positionType(row.file), row.label, row.total, row.sha256.slice(0, 12) + "…"]),
  }),
};

document.querySelectorAll('[data-workbench="ledger"]').forEach((root) => {
  const chooseMapping = invoiceMappingDialog(root);
  wireWorkbench(root, {
    ...ledger,
    read: (file, isCurrent) => readInvoice(file, globalThis.XLSX, (source) => isCurrent() ? chooseMapping(source) : undefined),
  });
});
