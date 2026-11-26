import { reconcileRows } from "../../domain/fulfillment/ledger.js";
import { closeReview, invoiceLayoutKey } from "../../domain/fulfillment/agency.js";
import { readInvoice } from "../../infrastructure/fulfillment/invoices.js";
import { wireWorkbench } from "../../workbench.js";
import { LEDGER_SAMPLE } from "./sample.js";
import { invoiceMappingDialog } from "./column-mapping.js";
import { wireAgencyWorkflows } from "./agency-workflows.js";

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
  if (output.close) {
    xlsx.utils.book_append_sheet(workbook, xlsx.utils.json_to_sheet(output.close.totals), "Close review");
    const trace = output.close.trace.map((row) => ({ ...row, positionType: positionType(row.file) }));
    xlsx.utils.book_append_sheet(workbook, xlsx.utils.json_to_sheet(trace), "Close source trace");
  }
  xlsx.writeFile(workbook, "fulfillment_ledger.xlsx");
}

const positionType = (file) => /\.csv$/i.test(file) ? "CSV record" : "Excel row";
const shortenedHash = (hash) => hash.slice(0, 12) + "…";

const ledger = {
  available: () => Boolean(globalThis.XLSX),
  sample: ledgerSample,
  download: saveWorkbook,
  inputName: "invoice rows",
  describe: (output) => output.summary.length + " rollup groups and " + output.sources.length + " source references.",
  summary: (output) => output.close ? {
    title: "Close review by month and currency",
    columns: ["Workflow", "Month", "Currency", "Rows", "Charges", "Credits", "Net"],
    rows: output.close.totals.map((row) => [row.workflow, row.month, row.currency, row.rows, row.charges, row.credits, row.net]),
  } : ({
    title: "Fee rollup",
    columns: ["Provider", "Currency", "Month", "Label", "Rows", "Qty", "Unit", "Total"],
    rows: output.summary.map((row) => [row.provider, row.currency, row.month, row.label, row.count, row.quantity, row.unit, row.total]),
  }),
  receipt: (output) => output.close ? {
    title: "Close source trace",
    columns: ["File", "Sheet", "Position", "Position type", "Provider", "Date", "Label", "Currency", "Total", "SHA-256"],
    rows: output.close.trace.map((row) => [row.file, row.sheet, row.row, positionType(row.file), row.provider, row.date, row.label, row.currency, row.total, shortenedHash(row.sha256)]),
  } : ({
    title: "Source references",
    columns: ["File", "Sheet", "Position", "Position type", "Label", "Total", "SHA-256"],
    rows: output.sources.map((row) => [row.file, row.sheet, row.row, positionType(row.file), row.label, row.total, shortenedHash(row.sha256)]),
  }),
};

document.querySelectorAll('[data-workbench="ledger"]').forEach((root) => {
  const mappingDialog = invoiceMappingDialog(root);
  const agency = wireAgencyWorkflows(root, () => {
    mappingDialog.cancel();
    root.querySelector("[data-clear]").click();
  });
  wireWorkbench(root, {
    ...ledger,
    build(rows) {
      const output = reconcileRows(rows);
      const workflow = agency?.active();
      if (workflow) output.close = closeReview(rows, workflow.label);
      return output;
    },
    async read(file, isCurrent) {
      const workflow = agency?.active();
      const additions = [];
      const rows = await readInvoice(file, globalThis.XLSX, async (source) => {
        if (!isCurrent()) return;
        const signature = workflow ? await invoiceLayoutKey(source.columns) : undefined;
        if (!isCurrent()) return;
        const preset = workflow ? agency.preset(workflow.id, signature) : undefined;
        const selection = await mappingDialog.open(source, workflow, preset);
        if (selection?.remember) additions.push([signature, selection.mapping]);
        return selection?.mapping;
      });
      if (isCurrent() && additions.length) agency.save(workflow.id, additions);
      return rows;
    },
  });
});
