import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { test } from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
const offer = async (context) => JSON.parse(await read(`src/domain/${context}/offer.json`));
const plans = (html) => [...html.matchAll(/<article class="plan"[^>]*>[\s\S]*?<\/article>/g)].map(([block]) => block);
const terms = (block) => [...block.matchAll(/<dt>([^<]+)<\/dt>/g)].map(([, term]) => term);

test("each paid product compares its seat and quote plans with the same fact rows", async () => {
  for (const context of ["fulfillment", "learning"]) {
    const product = await offer(context);
    const page = await read(`${product.slug}/index.html`);
    const [seat, quote, ...rest] = plans(page);
    assert.equal(rest.length, 0, context);
    assert.ok(seat && quote, context);
    assert.ok(terms(seat).length >= 3, context);
    assert.deepEqual(terms(quote), terms(seat), context);
    assert.ok(seat.includes(`href="${product.checkout.replaceAll("&", "&amp;")}"`), context);
    assert.ok(seat.includes(`${product.price}</strong><span> USD / ${product.period}`), context);
    assert.match(quote, new RegExp(`id="${product.quote_anchor}"`));
    assert.ok(quote.includes(`${product.quote_price}</strong><span> USD / ${product.quote_period}`), context);
    assert.ok(quote.includes(`href="${product.quote_inquiry}"`), context);
  }
});

test("the hub shows each quote tier's price beside its link", async () => {
  const hub = await read("index.html");
  for (const context of ["fulfillment", "learning"]) {
    const product = await offer(context);
    assert.ok(hub.includes(`href="./${product.slug}/#${product.quote_anchor}">Explore ${product.quote_name}</a>`), context);
    assert.ok(hub.includes(`${product.quote_price} USD / ${product.quote_period}`), context);
    assert.ok(hub.includes(`${product.price} <span>USD / ${product.period}</span>`), context);
  }
});

test("the privacy page opens with a summary that marks what is not collected", async () => {
  const privacy = await read("privacy.html");
  const summary = privacy.indexOf('id="at-a-glance"');
  assert.ok(summary > 0 && summary < privacy.indexOf("<h2>The tools</h2>"));
  assert.match(privacy, /<td>Files you open in the tools<\/td><td class="state none">Not collected<\/td>/);
  assert.ok(privacy.match(/class="state none">Not collected</g).length >= 4);
});

test("every published page declares a favicon", async () => {
  const skip = new Set(["node_modules", "src", "docs", ".git"]);
  const pages = [];
  const walk = async (dir) => {
    for (const entry of await readdir(new URL(dir, root), { withFileTypes: true })) {
      if (entry.isDirectory() && !skip.has(entry.name)) await walk(`${dir}${entry.name}/`);
      else if (entry.isFile() && entry.name.endsWith(".html")) pages.push(dir + entry.name);
    }
  };
  await walk("");
  assert.ok(pages.length >= 15, String(pages.length));
  for (const page of pages) assert.match(await read(page), /<link rel="icon" href="data:image\/svg\+xml,/, page);
});
