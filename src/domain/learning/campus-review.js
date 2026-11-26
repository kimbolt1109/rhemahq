// Compare only independently identifiable questions. Keep the XML and answer text out of the receipt.
const matches = (expected, actual) => JSON.stringify(expected) === JSON.stringify(actual);

function reference(row) {
  return row ? { type: row.type, line: row.line } : null;
}

function issue(expected, actual, details) {
  const { categoryPath, id } = expected ?? actual;
  return { categoryPath, id, expected: reference(expected), actual: reference(actual), details };
}

function indexRelease(rows, side, categories, unsupported) {
  const byId = new Map();
  for (const row of rows) {
    const counts = categories.get(row.categoryPath) ?? { categoryPath: row.categoryPath, expected: 0, actual: 0 };
    counts[side] += 1;
    categories.set(row.categoryPath, counts);
    if (!row.categoryPath || !row.id) {
      const details = [!row.categoryPath && "Category path missing from export", !row.id && "Unique explicit ID missing from question"].filter(Boolean);
      unsupported.push(issue(side === "expected" ? row : null, side === "actual" ? row : null, details));
      continue;
    }
    const key = JSON.stringify([row.categoryPath, row.id]);
    const group = byId.get(key) ?? [];
    group.push(row);
    byId.set(key, group);
  }
  return byId;
}

export function buildCampusReview(expected, actual, { runLabel, stagingVersion }) {
  const label = runLabel.trim();
  const version = stagingVersion.trim();
  if (!label || !version) throw new Error("Enter a run label and the staging Moodle version.");
  if (!expected.rows.length) throw new Error("The expected release must contain at least one question.");

  const categories = new Map();
  const missing = [];
  const extra = [];
  const changed = [];
  const unsupported = [];
  const matched = [];
  const left = indexRelease(expected.rows, "expected", categories, unsupported);
  const right = indexRelease(actual.rows, "actual", categories, unsupported);
  const keys = new Set([...left.keys(), ...right.keys()]);
  for (const key of [...keys].sort()) {
    const before = left.get(key) ?? [];
    const after = right.get(key) ?? [];
    const [source] = before;
    const [destination] = after;
    if (before.length > 1 || after.length > 1) {
      const details = ["Duplicate ID in category: " + before.length + " expected, " + after.length + " destination"];
      for (const row of before) unsupported.push(issue(row, null, details));
      for (const row of after) unsupported.push(issue(null, row, details));
    } else if (!destination) {
      missing.push(issue(source, null, ["ID absent from destination category"]));
    } else if (!source) {
      extra.push(issue(null, destination, ["ID absent from expected category"]));
    } else if (source.type && destination.type && source.type !== destination.type) {
      changed.push(issue(source, destination, ["Question type"]));
    } else if (source.unsupported || destination.unsupported) {
      const details = [source.unsupported && "Expected: " + source.unsupported,
        destination.unsupported && "Destination: " + destination.unsupported].filter(Boolean);
      unsupported.push(issue(source, destination, details));
    } else {
      const fields = new Set([...Object.keys(source.content), ...Object.keys(destination.content)]);
      const differences = [...fields].filter((field) => !matches(source.content[field], destination.content[field]));
      if (differences.length) changed.push(issue(source, destination, differences));
      else matched.push(issue(source, destination, []));
    }
  }

  const counts = { expected: expected.rows.length, actual: actual.rows.length, matched: matched.length,
    missing: missing.length, extra: extra.length, changed: changed.length, unsupported: unsupported.length };
  return {
    schema: "rhema.campus-review.v1",
    runLabel: label,
    stagingVersion: version,
    sources: {
      expected: { name: expected.name, sha256: expected.sha256 },
      actual: { name: actual.name, sha256: actual.sha256 },
    },
    outcome: counts.matched === counts.expected && counts.matched === counts.actual ? "matched" : "review_required",
    scope: "Compares exact category paths and explicit IDs. Checks selected text and grading fields for multiple choice, true/false and short answer. Review tags, media rendering and LMS behavior manually.",
    counts,
    categories: [...categories.keys()].sort().map((path) => categories.get(path)),
    matched,
    missing,
    extra,
    changed,
    unsupported,
  };
}
