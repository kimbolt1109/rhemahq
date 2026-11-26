import { buildCampusReview } from "../../domain/learning/campus-review.js";
import { readCampusReviewFile } from "../../infrastructure/learning/question-bank.js";

const sections = [
  ["missing", "Missing IDs"], ["extra", "Extra IDs"],
  ["changed", "Changed questions"], ["unsupported", "Manual review"],
];

function reviewTable(title, columns, rows) {
  const section = document.createElement("section");
  const heading = document.createElement("h5");
  heading.textContent = title;
  section.append(heading);
  const note = document.createElement("p");
  note.className = "bench-hint";
  if (!rows.length) {
    note.textContent = "None.";
    section.append(note);
    return section;
  }

  const wrap = document.createElement("div");
  wrap.className = "bench-table-wrap";
  wrap.tabIndex = 0;
  wrap.setAttribute("role", "region");
  wrap.setAttribute("aria-label", title);
  const table = document.createElement("table");
  table.className = "bench-table";
  table.setAttribute("aria-label", title);
  const header = table.createTHead().insertRow();
  for (const label of columns) {
    const cell = document.createElement("th");
    cell.scope = "col";
    cell.textContent = label;
    header.append(cell);
  }
  const previewLimit = 100;
  const body = table.createTBody();
  for (const row of rows.slice(0, previewLimit)) {
    const record = body.insertRow();
    for (const value of row) {
      const cell = record.insertCell();
      if (typeof value === "number") cell.className = "num";
      cell.textContent = value;
    }
  }
  wrap.append(table);
  section.append(wrap);
  if (rows.length > previewLimit) {
    note.textContent = "Showing " + previewLimit + " of " + rows.length + " rows. The receipt contains every row.";
    section.append(note);
  }
  return section;
}

const categoryLabel = (path) => path ?? "Category path unavailable";
const lineReference = (row) => row ? (row.type ?? "Type unavailable") + ", line " + row.line : "—";

function showReview(results, receipt) {
  const scope = document.createElement("p");
  scope.className = "bench-hint";
  scope.textContent = receipt.scope;
  results.append(scope);
  const rows = receipt.categories.map((category) => [categoryLabel(category.categoryPath), category.expected, category.actual]);
  results.append(reviewTable("Category counts", ["Category path", "Expected", "Destination"], rows));
  for (const [key, title] of sections) {
    const issues = receipt[key].map((row) => [categoryLabel(row.categoryPath), row.id ?? "Unidentified",
      lineReference(row.expected), lineReference(row.actual), row.details.join(" · ")]);
    results.append(reviewTable(title + " (" + issues.length + ")", ["Category path", "ID", "Expected", "Destination", "Detail"], issues));
  }
}

async function readReviewInput(file, label) {
  try {
    return await readCampusReviewFile(file);
  } catch (error) {
    throw new Error(label + " (" + file.name + "): " + error.message);
  }
}

export function wireCampusReview(root, saveText) {
  const form = root.querySelector("form");
  const { expected, actual, runLabel, stagingVersion } = form.elements;
  const compare = root.querySelector("[data-campus-compare]");
  const download = root.querySelector("[data-campus-download]");
  const status = root.querySelector("[data-campus-status]");
  const output = root.querySelector("[data-campus-output]");
  const empty = root.querySelector("[data-campus-empty]");
  const results = root.querySelector("[data-campus-results]");
  const ready = Boolean(globalThis.crypto?.subtle);
  let revision = 0;
  let receipt;

  function report(message = "", kind = "") {
    status.textContent = message;
    status.dataset.kind = kind;
  }

  function resetResult() {
    receipt = undefined;
    download.disabled = true;
    results.hidden = true;
    results.replaceChildren();
    empty.hidden = false;
  }

  function pending(active) {
    compare.disabled = active || !ready;
    output.setAttribute("aria-busy", String(active));
  }

  form.addEventListener("input", () => {
    for (const [name, input] of [["expected", expected], ["actual", actual]]) {
      root.querySelector("[data-campus-" + name + "-file]").textContent = input.files[0]?.name ?? "No file selected.";
    }
    revision += 1;
    pending(false);
    resetResult();
    if (ready) report();
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!ready || compare.disabled) return;
    const expectedFile = expected.files[0];
    const actualFile = actual.files[0];
    if (!expectedFile || !actualFile) {
      report("Choose the expected release and the destination export.", "error");
      return;
    }
    const current = ++revision;
    resetResult();
    pending(true);
    report("Comparing the two exports…");
    const labels = { runLabel: runLabel.value, stagingVersion: stagingVersion.value };
    try {
      const [left, right] = await Promise.all([
        readReviewInput(expectedFile, "Expected release"),
        readReviewInput(actualFile, "Destination export"),
      ]);
      if (current !== revision) return;
      const compared = buildCampusReview(left, right, labels);
      showReview(results, compared);
      receipt = compared;
      results.hidden = false;
      empty.hidden = true;
      download.disabled = false;
      const prefix = compared.counts.matched + " matched. ";
      if (compared.outcome === "matched") report(prefix + "The checked fields match in both exports.", "success");
      else report(prefix + "Review the category counts and rows below.");
    } catch (error) {
      if (current === revision) report(error.message, "error");
    } finally {
      if (current === revision) pending(false);
    }
  });

  download.addEventListener("click", () => {
    if (receipt) saveText("campus_review_receipt.json", JSON.stringify(receipt, null, 2) + "\n", "application/json");
  });
  if (!ready) {
    pending(false);
    report("Open this tool in a current browser over HTTPS or from the offline download.", "error");
  }
}
