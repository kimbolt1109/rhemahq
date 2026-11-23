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

test("the hub and dedicated product sites share each offer and canonical route", async () => {
  const hub = await read("index.html");
  for (const context of contexts) {
    const offer = JSON.parse(await read(`src/domain/${context}/offer.json`));
    const page = await read(`${offer.slug}/index.html`);
    const escapedCheckout = offer.checkout.replaceAll("&", "&amp;");
    assert.ok(hub.includes(`href="./${offer.slug}/"`));
    assert.ok(page.includes(`rel="canonical" href="https://rhemahq.com/${offer.slug}/"`));
    for (const document of [hub, page]) assert.ok(document.includes(`href="${escapedCheckout}"`));
  }
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
