import { test } from "node:test";
import assert from "node:assert/strict";
import { reconcileRows, sha256Hex, buildMoodleRelease, LEDGER_SAMPLE, MOODLE_SAMPLE } from "../src/site.js";
test("reconcile rolls up fees and keeps source addresses", () => {
  const { summary, sources } = reconcileRows(LEDGER_SAMPLE);
  const pick = summary.find((g) => g.label === "Pick & Pack");
  assert.equal(pick.count, 2);
  assert.equal(pick.total, 64.9);
  assert.equal(pick.quantity, 59);
  assert.equal(sources.length, 5);
  assert.equal(sources[0].row, 128);
});
test("credit stays signed", () => {
  const { summary } = reconcileRows(LEDGER_SAMPLE);
  assert.equal(summary.find((g) => g.label === "Credit").total, -6);
});
test("sha256 is 64 hex", async () => {
  const h = await sha256Hex("abc");
  assert.match(h, /^[0-9a-f]{64}$/);
});
test("moodle release counts + receipt + duplicate rejection", async () => {
  const out = await buildMoodleRelease(MOODLE_SAMPLE);
  assert.equal(out.receipt.length, 3);
  assert.equal(out.counts["Release pack / demo"], 2);
  assert.match(out.importXml, /<quiz>/);
  await assert.rejects(() => buildMoodleRelease([MOODLE_SAMPLE[0], MOODLE_SAMPLE[0]]), /Duplicate/);
});
