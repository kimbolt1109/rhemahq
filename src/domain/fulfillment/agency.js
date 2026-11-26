import { sha256Hex } from "../../lib/file-integrity.js";

export const maxWorkflows = 4;
export const agencyStorageKey = "rhema-ledger-agency-v1";

const invoiceFields = ["provider", "currency", "date", "label", "total", "quantity", "unit"];

function presetFields(mapping) {
  const result = {};
  for (const field of invoiceFields) {
    const { column, value } = mapping?.[field] ?? {};
    if (typeof column === "string" && /^[A-Z]+$/.test(column)) {
      result[field] = { column };
    } else if ((field === "provider" || field === "currency") && typeof value === "string") {
      result[field] = { value: value.trim() };
    }
  }
  return result;
}

export function invoiceLayoutKey(columns) {
  return sha256Hex(JSON.stringify(columns.map(({ column, label }) => [column, label])));
}

export function agencyStore(storage) {
  function list() {
    const saved = storage.getItem(agencyStorageKey);
    if (saved === null) return [];
    const workflows = JSON.parse(saved);
    if (!Array.isArray(workflows) || workflows.length > maxWorkflows
        || workflows.some((item) => typeof item?.id !== "string" || typeof item.label !== "string"
          || !item.presets || typeof item.presets !== "object" || Array.isArray(item.presets))) {
      throw new Error("Saved workflow settings are invalid.");
    }
    return workflows.map(({ id, label, presets }) => ({
      id, label,
      presets: Object.fromEntries(Object.entries(presets).filter(([signature]) => /^[0-9a-f]{64}$/.test(signature))
        .map(([signature, mapping]) => [signature, presetFields(mapping)])),
    }));
  }

  function write(workflows) {
    storage.setItem(agencyStorageKey, JSON.stringify(workflows));
  }

  return {
    list,
    add(name) {
      const label = name.trim();
      const workflows = list();
      if (!label) throw new Error("Enter a client workflow label.");
      if (workflows.length >= maxWorkflows) throw new Error("This tool supports four client workflows.");
      if (workflows.some((item) => item.label.toLowerCase() === label.toLowerCase())) {
        throw new Error("Choose a label distinct from your other workflows.");
      }
      write([...workflows, { id: crypto.randomUUID(), label, presets: {} }]);
    },
    remove(id) {
      write(list().filter((workflow) => workflow.id !== id));
    },
    preset(id, signature) {
      return list().find((workflow) => workflow.id === id)?.presets[signature];
    },
    savePresets(id, additions) {
      const workflows = list();
      const workflow = workflows.find((item) => item.id === id);
      if (!workflow) return;
      for (const [signature, mapping] of additions) {
        if (!/^[0-9a-f]{64}$/.test(signature)) throw new Error("The column layout could not be identified.");
        workflow.presets[signature] = presetFields(mapping);
      }
      write(workflows);
    },
  };
}

function decimal(number) {
  // Align the parsed decimal values before converting totals back to spreadsheet numbers.
  const [mantissa, exponent = "0"] = String(number).split("e");
  const [whole, fraction = ""] = mantissa.split(".");
  return [BigInt(whole + fraction), Number(exponent) - fraction.length];
}

function addDecimal([left, leftPower], [right, rightPower]) {
  const power = Math.min(leftPower, rightPower);
  return [left * 10n ** BigInt(leftPower - power) + right * 10n ** BigInt(rightPower - power), power];
}

function spreadsheetNumber([coefficient, power]) {
  const number = Number(String(coefficient) + "e" + power);
  if (!Number.isFinite(number)) throw new Error("Close totals exceed the workbook's numeric range.");
  return number;
}

export function closeReview(rows, workflow) {
  const totals = new Map();
  const positions = new Set();
  const zero = [0n, 0];
  const trace = rows.map(({ file, sheet, row, sha256, provider, currency, date, label, total }) => {
    const position = JSON.stringify([sha256, sheet, row]);
    if (positions.has(position)) {
      throw new Error("An invoice source position is repeated in " + file + " (" + sheet + ", " + row + "). Clear inputs and add each original file once.");
    }
    positions.add(position);
    const month = date.slice(0, 7);
    const key = JSON.stringify([currency, month]);
    if (!totals.has(key)) totals.set(key, { workflow, currency, month, rows: 0, charges: zero, credits: zero });
    const group = totals.get(key);
    group.rows += 1;
    const type = total < 0 ? "credits" : "charges";
    group[type] = addDecimal(group[type], decimal(total));
    return { workflow, file, sheet, row, sha256, provider, currency, date, label, total };
  });
  return {
    totals: Array.from(totals.values(), (group) => ({
      ...group,
      charges: spreadsheetNumber(group.charges),
      credits: spreadsheetNumber(group.credits),
      net: spreadsheetNumber(addDecimal(group.charges, group.credits)),
    })),
    trace,
  };
}
