import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { buildCampusReview } from "../src/domain/learning/campus-review.js";
import { buildMoodleRelease } from "../src/domain/learning/release.js";
import { moodleReceiptCsv } from "../src/infrastructure/learning/question-bank.js";

const first = "$course$/top/First bank";
const next = "$course$/top/Next bank";
const labels = { runLabel: " Term 2 handoff ", stagingVersion: " 4.5.16 " };
const digest = (input) => createHash("sha256").update(input).digest("hex");

function question(categoryPath, id, line, type = "shortanswer", prompt = "Synthetic prompt") {
  return { categoryPath, id, type, line, content: { "Question text": ["html", prompt] } };
}

function exportFile(name, rows) {
  return { name, sha256: digest(name), rows };
}

test("counts full categories and reports missing, extra, type and content changes", () => {
  const expected = exportFile("expected.xml", [
    question(first, "shared", 3), question(next, "shared", 6),
    question(first, "move", 4), question(first, "type", 5), question(next, "wording", 7),
  ]);
  const actual = exportFile("actual.xml", [
    question(next, "wording", 3, "shortanswer", "Replacement prompt"), question(next, "move", 5),
    question(next, "shared", 7), question(first, "shared", 13), question(first, "type", 16, "truefalse"),
  ]);
  const receipt = buildCampusReview(expected, actual, labels);
  assert.deepEqual(receipt.categories, [
    { categoryPath: first, expected: 3, actual: 2 }, { categoryPath: next, expected: 2, actual: 3 },
  ]);
  assert.deepEqual(receipt.counts, { expected: 5, actual: 5, matched: 2, missing: 1, extra: 1, changed: 2, unsupported: 0 });
  assert.deepEqual(receipt.matched.map(({ categoryPath, id, expected: row, actual }) => [categoryPath, id, row.line, actual.line]),
    [[first, "shared", 3, 13], [next, "shared", 6, 7]]);
  assert.deepEqual(receipt.missing.map(({ categoryPath, id, expected: row }) => [categoryPath, id, row.line]), [[first, "move", 4]]);
  assert.deepEqual(receipt.extra.map(({ categoryPath, id, actual: row }) => [categoryPath, id, row.line]), [[next, "move", 5]]);
  assert.deepEqual(receipt.changed.map(({ id, details }) => [id, details]), [["type", ["Question type"]], ["wording", ["Question text"]]]);
  assert.equal(receipt.outcome, "review_required");
  assert.equal(receipt.runLabel, "Term 2 handoff");
  assert.equal(receipt.stagingVersion, "4.5.16");
  assert.deepEqual(receipt.sources, {
    expected: { name: "expected.xml", sha256: digest("expected.xml") },
    actual: { name: "actual.xml", sha256: digest("actual.xml") },
  });
  assert.doesNotMatch(JSON.stringify(receipt), /Synthetic prompt|Replacement prompt/);
  assert.equal(JSON.stringify(receipt), JSON.stringify(buildCampusReview(expected, actual, labels)));
});

test("routes missing identities, collisions, attachments and unsupported types to manual review", () => {
  const cloze = { ...question(first, "cloze", 11, "cloze"), unsupported: "Content comparison is unavailable for this question type" };
  const withMedia = { ...question(first, "media", 8), unsupported: "Embedded files and media require manual review" };
  const expected = exportFile("expected.xml", [question(first, "duplicate", 4), question(first, "media", 8), cloze]);
  const actual = exportFile("actual.xml", [
    question(first, "duplicate", 5), question(first, "duplicate", 6),
    withMedia, cloze, question(null, "no-category", 12), question(first, null, 15),
  ]);
  const receipt = buildCampusReview(expected, actual, labels);
  assert.deepEqual(receipt.counts, { expected: 3, actual: 6, matched: 0, missing: 0, extra: 0, changed: 0, unsupported: 7 });
  assert.equal(receipt.unsupported.filter(({ id }) => id === "duplicate").length, 3);
  assert.equal(receipt.unsupported.find(({ id }) => id === "media").details[0], "Destination: Embedded files and media require manual review");
  assert.equal(receipt.unsupported.find(({ id }) => id === "no-category").expected, null);
  assert.equal(receipt.unsupported.find(({ id }) => id === null).actual.line, 15);
  assert.deepEqual(receipt.categories.find(({ categoryPath }) => categoryPath === null), { categoryPath: null, expected: 0, actual: 1 });
});

test("handles an empty destination and requires a named run with a nonempty expectation", () => {
  const expected = exportFile("expected.xml", [question(first, "match", 3)]);
  const actual = exportFile("destination.xml", [question(first, "match", 12)]);
  const match = buildCampusReview(expected, actual, labels);
  assert.equal(match.outcome, "matched");
  assert.equal(match.counts.matched, 1);
  assert.equal(buildCampusReview(expected, exportFile("empty.xml", []), labels).counts.missing, 1);
  assert.throws(() => buildCampusReview(exportFile("empty.xml", []), actual, labels), /at least one question/);
  assert.throws(() => buildCampusReview(expected, actual, { ...labels, runLabel: " " }), /run label/);
});

test("the base question merge retains its XML, CSV receipt and duplicate rules", async () => {
  const xml = '  <question type="shortanswer"><idnumber>legacy</idnumber></question>';
  const question = { source: "base.xml", category: "Legacy", id: "legacy", type: "shortanswer", line: 4, xml };
  const release = await buildMoodleRelease([question]);
  assert.equal(release.importXml, '<?xml version="1.0" encoding="UTF-8"?>\n<quiz>\n'
    + '  <question type="category"><category><text>$course$/top/Legacy</text></category></question>\n' + xml + "\n</quiz>");
  assert.equal(moodleReceiptCsv(release.receipt), 'source,category,id,type,line,checksum\r\n"base.xml","Legacy","legacy","shortanswer","4","' + digest(xml) + '"');
  await assert.rejects(buildMoodleRelease([question, question]), /Duplicate question id legacy in category Legacy/);
});
