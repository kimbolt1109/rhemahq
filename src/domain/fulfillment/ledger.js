export function reconcileRows(rows) {
  const groups = new Map();
  for (const row of rows) {
    const month = String(row.date ?? "").slice(0, 7);
    const key = JSON.stringify([row.provider, row.currency, month, row.label]);
    const price = row.unit ?? null;
    if (!groups.has(key)) {
      groups.set(key, { provider: row.provider, currency: row.currency, month, label: row.label, count: 0, quantity: null, unit: price, total: 0 });
    }
    const group = groups.get(key);
    group.count += 1;
    group.total += Number(row.total);
    if (row.quantity != null && row.quantity !== "") {
      group.quantity = (group.quantity ?? 0) + Number(row.quantity);
    }
    if (group.unit !== price) group.unit = null;
  }
  // Match the precision of the exported spreadsheet while removing binary floating-point noise.
  const summary = Array.from(groups.values(), (group) => ({ ...group, total: Number(group.total.toPrecision(15)) }));
  const sources = rows.map(({ file, sheet, row, label, total, sha256 }) => ({ file, sheet, row, label, total: Number(total), sha256 }));
  return { summary, sources };
}
