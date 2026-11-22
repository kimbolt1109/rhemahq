import { test } from "node:test";
import assert from "node:assert/strict";
import { reconcileRows, sha256Hex, buildMoodleRelease, LEDGER_SAMPLE, MOODLE_SAMPLE } from "../src/site.js";
import { buildUtm, createQueue } from "../src/track.js";
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
test("buildUtm adds, preserves and overwrites params on absolute URLs", () => {
  const out = buildUtm("https://buy.polar.sh/polar_cl_x?keep=1&utm_source=old", {
    utm_source: "rhemahq", utm_medium: "site", utm_campaign: "n27 ledger",
  });
  const u = new URL(out);
  assert.equal(u.searchParams.get("keep"), "1");
  assert.equal(u.searchParams.get("utm_source"), "rhemahq");
  assert.equal(u.searchParams.get("utm_medium"), "site");
  assert.equal(u.searchParams.get("utm_campaign"), "n27 ledger");
  assert.equal(out, buildUtm(out, { utm_source: "rhemahq" }));
});
test("buildUtm keeps relative hrefs relative", () => {
  const out = buildUtm("./guides/index.html#top", { utm_source: "rhemahq" });
  assert.equal(out, "/guides/index.html?utm_source=rhemahq#top");
});
test("event queue buffers without a sink and forwards with one", () => {
  const buffered = createQueue(null);
  buffered.push({ event: "demo_start" });
  buffered.push({ event: "checkout_click" });
  assert.equal(buffered.pending, 2);
  assert.equal(buffered.flush(), 2);
  const sent = [];
  const live = createQueue((events) => sent.push(...events));
  live.push({ event: "page_view" });
  assert.equal(live.pending, 0);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].event, "page_view");
  assert.equal(typeof sent[0].ts, "number");
});
