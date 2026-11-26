import { sha256Hex } from "../../lib/file-integrity.js";

const requiredFields = ["provider", "currency", "date", "label", "total"];
const optionalFields = ["quantity", "unit"];
const fields = [...requiredFields, ...optionalFields];
const fixedFields = ["provider", "currency"];
const normalizeHeader = (value) => String(value ?? "").trim().toLowerCase();

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

function invoiceColumns(header) {
  return Object.entries(header).map(([column, value]) => ({ column, label: String(value).trim() }))
    .filter(({ label }) => label !== "");
}

function hasStandardColumns(columns) {
  const names = columns.map(({ label }) => normalizeHeader(label));
  const known = [...fields, "fee"];
  if (known.some((field) => names.indexOf(field) !== names.lastIndexOf(field))) return false;
  return requiredFields.every((field) => names.includes(field) || (field === "label" && names.includes("fee")));
}

export function validateInvoiceMapping(columns, mapping) {
  const available = new Set(columns.map(({ column }) => column));
  const used = new Set();
  for (const field of fields) {
    const { column, value } = mapping[field] ?? {};
    if (column) {
      if (!available.has(column) || used.has(column)) throw new Error("Choose an available, separate column for each field.");
      used.add(column);
    } else if (fixedFields.includes(field)) {
      const text = String(value ?? "").trim();
      if (!text || (field === "currency" && !/^[A-Z]{3}$/i.test(text))) {
        throw new Error("Choose a provider and currency column or enter the provider and three-letter currency for this sheet.");
      }
    } else if (requiredFields.includes(field)) {
      throw new Error("Choose a date, fee label, and signed total column.");
    }
  }
}

async function sheetRows(file, sheet, worksheet, xlsx, chooseMapping) {
  if (!chooseMapping) {
    return xlsx.utils.sheet_to_json(worksheet, { defval: "" }).map((entry) => ({
      row: entry.__rowNum__ + 1,
      record: Object.fromEntries(Object.entries(entry).map(([key, value]) => [normalizeHeader(key), value])),
    }));
  }

  const [header, ...entries] = xlsx.utils.sheet_to_json(worksheet, { header: "A", defval: "", blankrows: false });
  if (!entries.length) return [];
  const columns = invoiceColumns(header);
  if (!columns.length) throw new Error(sheet + ": the first populated row must contain column headings.");
  let selected;
  if (hasStandardColumns(columns)) {
    selected = columns.map(({ column, label }) => [normalizeHeader(label), { column }]);
  } else {
    const mapping = await chooseMapping({ file, sheet, columns });
    if (!mapping) throw new Error("Column mapping cancelled for " + sheet + ".");
    validateInvoiceMapping(columns, mapping);
    selected = fields.map((field) => [field, mapping[field] ?? {}]);
  }
  return entries.map((entry) => ({
    row: entry.__rowNum__ + 1,
    record: Object.fromEntries(selected.map(([field, source]) => [field, source.column ? entry[source.column] : source.value])),
  }));
}

export async function readInvoice(file, xlsx, chooseMapping) {
  const bytes = await file.arrayBuffer();
  const digest = await sha256Hex(bytes);
  const workbook = /\.csv$/i.test(file.name)
    ? xlsx.read(new TextDecoder().decode(bytes), { type: "string", raw: true })
    : xlsx.read(bytes, { type: "array" });
  const date1904 = workbook.Workbook?.WBProps?.date1904;
  const rows = [];
  for (const sheet of workbook.SheetNames) {
    const entries = await sheetRows(file.name, sheet, workbook.Sheets[sheet], xlsx, chooseMapping);
    for (const { row, record } of entries) {
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
