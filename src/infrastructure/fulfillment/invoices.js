import { sha256Hex } from "../../lib/file-integrity.js";

function invoiceDate(value, xlsx, date1904) {
  if (typeof value === "number") {
    const date = xlsx.SSF.parse_date_code(value, { date1904 });
    if (date) value = [date.y, String(date.m).padStart(2, "0"), String(date.d).padStart(2, "0")].join("-");
  }
  const text = String(value ?? "").trim();
  const date = new Date(text);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(+date) || date.toISOString().slice(0, 10) !== text) {
    throw new Error("use a date in YYYY-MM-DD format or an Excel date");
  }
  return text;
}

function invoiceNumber(value, name, optional = false) {
  if (optional && (value == null || String(value).trim() === "")) return null;
  if (typeof value !== "number" && !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(String(value ?? "").trim())) {
    throw new Error(name + " must be a number");
  }
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(name + " must be a finite number");
  return number;
}

export async function readInvoice(file, xlsx) {
  const bytes = await file.arrayBuffer();
  const digest = await sha256Hex(bytes);
  const workbook = /\.csv$/i.test(file.name)
    ? xlsx.read(new TextDecoder().decode(bytes), { type: "string", raw: true })
    : xlsx.read(bytes, { type: "array" });
  const date1904 = workbook.Workbook?.WBProps?.date1904;
  const rows = [];
  for (const sheet of workbook.SheetNames) {
    const entries = xlsx.utils.sheet_to_json(workbook.Sheets[sheet], { defval: "" });
    for (const entry of entries) {
      const row = entry.__rowNum__ + 1;
      const record = Object.fromEntries(Object.entries(entry).map(([key, value]) => [key.trim().toLowerCase(), value]));
      const provider = String(record.provider ?? "").trim();
      const currency = String(record.currency ?? "").trim().toUpperCase();
      const label = String(record.label || record.fee || "").trim();
      try {
        if (!provider || !/^[A-Z]{3}$/.test(currency) || !label) {
          throw new Error("provide a provider, three-letter currency, and label");
        }
        rows.push({
          file: file.name, sheet, row, provider, currency, label,
          date: invoiceDate(record.date, xlsx, date1904),
          quantity: invoiceNumber(record.quantity, "quantity", true),
          unit: invoiceNumber(record.unit, "unit", true),
          total: invoiceNumber(record.total, "total"),
          sha256: digest,
        });
      } catch (error) {
        throw new Error(sheet + ", row " + row + ": " + error.message);
      }
    }
  }
  if (!rows.length) throw new Error("no invoice rows found");
  return rows;
}
