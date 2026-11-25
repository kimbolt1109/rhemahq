import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
const contexts = ["fulfillment", "learning", "publishing"];

test("each workbench bundle depends only on its own product domain", async () => {
  for (const context of ["fulfillment", "learning"]) {
    const { metafile } = await build({
      absWorkingDir: fileURLToPath(root),
      entryPoints: [`src/features/${context}/workbench.js`],
      bundle: true,
      write: false,
      metafile: true,
    });
    const included = new Set(Object.keys(metafile.inputs)
      .filter((path) => path.startsWith("src/domain/"))
      .map((path) => path.split("/")[2]));
    assert.deepEqual([...included], [context]);
  }
});

test("the hub and dedicated product sites share each offer action and canonical route", async () => {
  const hub = await read("index.html");
  for (const context of contexts) {
    const offer = JSON.parse(await read(`src/domain/${context}/offer.json`));
    const page = await read(`${offer.slug}/index.html`);
    const escapedAction = (offer.checkout ?? offer.inquiry).replaceAll("&", "&amp;");
    assert.ok(hub.includes(`href="./${offer.slug}/"`));
    assert.ok(page.includes(`rel="canonical" href="https://rhemahq.com/${offer.slug}/"`));
    for (const document of [hub, page]) assert.ok(document.includes(`href="${escapedAction}"`));
  }
});

test("Galley Studio has a GPL release and inquiry without a purchase action", async () => {
  const [hub, product] = await Promise.all([read("index.html"), read("ojs-galley-studio/index.html")]);
  assert.match(product, /GNU GPL version 3/);
  assert.match(product, /href="\.\.\/tools\/ojs-galley-studio\.zip" download/);
  for (const document of [hub, product]) {
    assert.doesNotMatch(document, /data-track="checkout_click" data-product="n13"/);
    assert.match(document, /data-track="support_click" data-product="n13"/);
  }
});

test("manual services and institutional purchases describe their separate payment paths", async () => {
  const [services, procurement] = await Promise.all([read("services.html"), read("procurement.html")]);
  assert.match(services, /mailto:support@rhemahq\.com\?subject=Service%20inquiry/);
  assert.doesNotMatch(services, /Polar/);
  assert.match(procurement, /Assessment Release Pack/);
  assert.match(procurement, /card payment through Polar/);
  assert.match(procurement, /before ordering if your institution needs purchase-order payment/);
  assert.doesNotMatch(procurement, /W-9|Moodle Release Pack/);
});

test("the public galley proof files match the Galley Studio checksum manifest", async () => {
  const folder = "src/features/publishing/sample/";
  const manifest = JSON.parse(await read(folder + "artifact-hashes.json"));
  assert.deepEqual(Object.keys(manifest).sort(), ["production-note.html", "production-note.pdf", "production-note.xml"]);
  for (const [file, digest] of Object.entries(manifest)) {
    const bytes = await readFile(new URL(folder + file, root));
    assert.equal(createHash("sha256").update(bytes).digest("hex"), digest, file);
  }
});
