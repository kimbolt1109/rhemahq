import { buildMoodleRelease } from "../../domain/learning/release.js";
import { moodleReceiptCsv, readMoodle } from "../../infrastructure/learning/question-bank.js";
import { wireWorkbench } from "../../workbench.js";
import { wireCampusReview } from "./campus-review.js";
import { MOODLE_SAMPLE } from "./sample.js";

function saveText(filename, contents, type) {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const moodle = {
  sample: () => MOODLE_SAMPLE,
  read: async (file) => readMoodle(await file.text(), file.name),
  build: buildMoodleRelease,
  download: (output) => saveText("moodle_import.xml", output.importXml, "application/xml"),
  receiptDownload: (output) => saveText("moodle_receipt.csv", moodleReceiptCsv(output.receipt), "text/csv;charset=utf-8"),
  inputName: "questions",
  describe: (output) => output.receipt.length + " questions across " + Object.keys(output.counts).length + " categories.",
  summary: (output) => ({ title: "Category counts", columns: ["Category", "Questions"], rows: Object.entries(output.counts) }),
  receipt: (output) => ({
    title: "Question receipt",
    columns: ["Source", "Category", "ID", "Type", "Line", "SHA-256"],
    rows: output.receipt.map((row) => [row.source, row.category, row.id, row.type, row.line, row.checksum.slice(0, 12) + "…"]),
  }),
};

document.querySelectorAll('[data-workbench="moodle"]').forEach((root) => wireWorkbench(root, moodle));
document.querySelectorAll("[data-campus-review]").forEach((root) => wireCampusReview(root, saveText));
