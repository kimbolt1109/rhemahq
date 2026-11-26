"""Emit the static trust, guide, procurement, service and post-checkout pages for rhemahq.com.

Run:  python -X utf8 scripts/build_site_pages.py
Writes pages and search metadata into the site root. The sitemap also includes
product routes from the catalog. Guide prices were verified 2026-11-23.
"""
import json
from html import escape
from pathlib import Path
from string import Template

SITE = Path(__file__).resolve().parents[1]
BASE = "https://rhemahq.com"
TODAY = "2026-11-26"
SUPPORT = "support@rhemahq.com"
LEARNING_OFFER = json.loads((SITE / "src/domain/learning/offer.json").read_text(encoding="utf-8"))
LEARNING_NAME = escape(LEARNING_OFFER["name"])

TPL = Template("""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>$title</title>
<meta name="description" content="$desc">
<link rel="canonical" href="$canonical">
<meta property="og:title" content="$title">
<meta property="og:description" content="$desc">
<meta property="og:url" content="$canonical">
<meta property="og:type" content="website">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='8' fill='%23214337'/><path d='M9,17l5,5l9,-11' stroke='%23DDE9CF' stroke-width='2.5' fill='none' stroke-linecap='round' stroke-linejoin='round'/></svg>">
<link rel="stylesheet" href="${root_href}assets/base.css">
<link rel="stylesheet" href="${root_href}assets/page.css">
$extra_head
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="site-header">
  <div class="container header-inner">
    <a class="brand" href="$root_href"><span class="brand-mark" aria-hidden="true"></span>Sync Sanctuary</a>
    <nav class="main-nav" aria-label="Primary">
      <a href="$root_href#tools">Tools</a>
      <a href="$root_href#demos">Demos</a>
      <a href="$guides_href"$guide_current>Guides</a>
    </nav>
    <a class="button header-action" href="$root_href#get">Get the tools <span aria-hidden="true">↗</span></a>
  </div>
</header>
<main class="container page-content" id="main">
$breadcrumb$body
</main>
<footer class="site-footer">
  <div class="container footer-inner">
    <a class="brand" href="$root_href"><span class="brand-mark" aria-hidden="true"></span>Sync Sanctuary</a>
    <nav aria-label="Footer">
      <a href="$guides_href">Guides</a><a href="${root_href}refund.html">Refunds</a><a href="${root_href}privacy.html">Privacy</a><a href="${root_href}terms.html">Terms</a>
    </nav>
    <p>© 2026 Sync Sanctuary</p>
  </div>
</footer>
</body>
</html>
""")

EMITTED = []


def emit(rel: str, title: str, desc: str, body: str, *, indexable: bool = True):
    path = SITE / rel
    depth = rel.count("/")
    root_href = "../" * depth if depth else "./"
    guides_href = root_href + "guides/"
    canonical_path = "guides/" if rel == "guides/index.html" else rel
    breadcrumb = ""
    if depth and rel != "guides/index.html":
        breadcrumb = '<nav class="breadcrumb" aria-label="Breadcrumb"><a href="./">← All guides</a></nav>\n'
    html = TPL.substitute(
        title=escape(title), desc=escape(desc), canonical=BASE + "/" + canonical_path,
        root_href=root_href, guides_href=guides_href,
        guide_current=' aria-current="page"' if rel == "guides/index.html" else "",
        extra_head="" if indexable else '<meta name="robots" content="noindex, follow">',
        breadcrumb=breadcrumb, body=body.strip(),
    )
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(html, encoding="utf-8", newline="\n")
    EMITTED.append((rel, canonical_path, indexable))


def cta_row(root="./"):
    return (
        f'<p class="page-actions"><a class="cta solid" href="{root}#get">Get the tools</a>'
        f'<a class="cta" href="{root}#demos">Run the free demos</a>'
        f'<a class="cta" href="mailto:{SUPPORT}">Ask a question</a></p>'
    )


# ---------------------------------------------------------------- legal / trust
emit("refund.html", "Refunds — Sync Sanctuary", "How refunds work for Sync Sanctuary tools purchased through Polar as merchant of record.", f"""
<p class="kicker">Policies</p>
<h1>Refunds</h1>
<p class="lede">For browser-tool licenses purchased through <strong>Polar</strong>, Polar handles payments, tax and refunds as merchant of record. We handle the product and your license.</p>
<h2>How to request a refund</h2>
<ol>
<li>Reply to your Polar receipt email, or use the customer portal link in that email, and request a refund from Polar.</li>
<li>You can also write to <a href="mailto:{SUPPORT}">{SUPPORT}</a> and we will route the request to Polar with your order reference.</li>
</ol>
<p>Polar's buyer terms govern the transaction. Polar may grant discretionary refunds up to 60 days after purchase; statutory consumer rights in your country are unaffected.</p>
<h2>What happens to your license</h2>
<ul>
<li>On a refunded order, the associated <strong>license key is revoked</strong> and commercial use of the tool must stop.</li>
<li>For subscriptions, cancellation stops future billing at the end of the paid period unless Polar refunds the current period.</li>
<li>Files you already produced with a self-serve tool remain yours. The software processes those files on your device.</li>
</ul>
<h2>Before you buy</h2>
<p>Try Fulfillment Ledger and {LEARNING_NAME} with a sample or your own files in the <a href="./#demos">browser demos</a>. Galley Studio is available under the license in its download.</p>
<div class="note">Refund processing fees charged by the payment network are not returned to us by Polar; this does not change the amount Polar refunds you under its terms.</div>
{cta_row()}
""")

emit("privacy.html", "Privacy — Sync Sanctuary", "What rhemahq.com and the Sync Sanctuary tools collect: local file processing, no uploads, and checkout data.", f"""
<p class="kicker">Policies</p>
<h1>Privacy</h1>
<p class="lede">The browser tools process files on your device. This page covers how the site, Polar checkout and service engagements handle data.</p>
<h2>The tools</h2>
<ul>
<li><strong>File processing is local.</strong> Invoices, manuscripts and question banks are read in your browser (or by the local scripts) and are not uploaded to us or to Polar.</li>
<li><strong>No accounts</strong> are required on this site, and we set no advertising or tracking cookies.</li>
</ul>
<h2>This website</h2>
<ul>
<li>Static pages served by GitHub Pages. GitHub logs standard request metadata (IP, user agent) under its own privacy statement.</li>
<li>Fonts and the spreadsheet library are served with this site. The homepage can load its optional 3D renderer from jsDelivr, which receives standard request metadata.</li>
<li>The homepage keeps interaction events in memory. It sends them to an analytics service only when one is configured. The site currently ships without an analytics provider or advertising scripts.</li>
</ul>
<h2>Checkout</h2>
<p>For purchases using <strong>Polar</strong> checkout, Polar collects billing and payment data to process the order, calculate tax and issue receipts and invoices under its privacy policy. We receive order details and the contact email you provide for support and license delivery.</p>
<h2>Support email</h2>
<p>If you write to <a href="mailto:{SUPPORT}">{SUPPORT}</a>, we keep the correspondence to answer you and to improve the product. We do not sell or share it. Ask us to delete it at any time.</p>
<h2>Files you send us</h2>
<p>For an agreed service engagement, we confirm file handling before you send source material. You can request deletion by emailing support.</p>
<h2>Retention and rights</h2>
<p>Records of purchases through Polar are retained as required for tax and accounting. You may request access, correction or deletion of correspondence we hold by emailing support.</p>
<div class="note">Last updated {TODAY}. Questions: <a href="mailto:{SUPPORT}">{SUPPORT}</a>.</div>
""")

emit("terms.html", "Terms — Sync Sanctuary", "Browser-tool licenses, Galley Studio's GNU GPL release, and the terms for purchases through Polar.", f"""
<p class="kicker">Policies</p>
<h1>Terms</h1>
<p class="lede">These terms cover use of rhemahq.com. Purchases made through Polar are governed by <strong>Polar's buyer terms</strong>.</p>
<h2>Software licenses</h2>
<ul>
<li><strong>Fulfillment Ledger and {LEARNING_NAME}.</strong> Internal, non-commercial evaluation is free. Commercial use requires a valid license key for one non-transferable seat.</li>
<li><strong>OJS Galley Studio.</strong> The included <code>LICENSE.txt</code> sets out the GNU GPL version 3 terms for the covered files. Any production or support engagement has its own written scope.</li>
</ul>
<h2>What the tools do and do not do</h2>
<ul>
<li>They serialize, consolidate and compare <strong>what you supplied</strong>, and attach source addresses and checksums so a reviewer can verify the output.</li>
<li>They do <strong>not</strong> make accounting postings, tax decisions, grading decisions, typesetting judgments or legal determinations. A qualified person at your organization approves the result.</li>
<li>Capabilities are verified on synthetic and public fixtures; the version ranges stated on each product page are the versions actually tested. Your real inputs may differ — evaluate first.</li>
</ul>
<h2>Availability, support and changes</h2>
<ul>
<li>Browser-tool license customers can request best-effort email support at <a href="mailto:{SUPPORT}">{SUPPORT}</a>.</li>
<li>Manage subscriptions bought through Polar in its customer portal. Prices and billing terms are shown at checkout.</li>
<li>We may update the tools and these terms; material changes to licensed functionality will be noted in the product README.</li>
</ul>
<h2>Warranty and liability</h2>
<p>The tools are provided "as is" without warranty of any kind, to the maximum extent permitted by law. Our aggregate liability arising from the tools is limited to the amount you paid for the license in the twelve months preceding the claim. Nothing here limits rights you have under mandatory consumer law or Polar's buyer terms.</p>
<div class="note">Last updated {TODAY}. The license file inside each download controls over this summary where they differ.</div>
{cta_row()}
""")

# ---------------------------------------------------------------- post-checkout
emit("thanks.html", "After checkout — Sync Sanctuary", "Find your Polar receipt and license and download the Sync Sanctuary tools.", f"""
<p class="kicker">After checkout</p>
<h1>Your receipt and license</h1>
<p class="lede">After paying for a browser-tool license through Polar, check your order email for the receipt and license details.</p>
<div class="card">
<h2>Find your order</h2>
<ol>
<li>Look for the receipt email from Polar. Check your spam folder if it hasn't arrived.</li>
<li>Use the customer portal link in your receipt to manage billing, invoices or subscriptions.</li>
<li>For help finding an order, email <a href="mailto:{SUPPORT}">{SUPPORT}</a> with your checkout reference.</li>
</ol>
<p class="note" id="ref-note" hidden>Checkout reference <code id="ref"></code></p>
</div>
<h2>Downloads</h2>
<p class="page-actions">
<a class="cta" href="./tools/ojs-galley-studio.zip" download>OJS Galley Studio</a>
<a class="cta" href="./tools/fulfillment-ledger.zip" download>Fulfillment Ledger</a>
<a class="cta" href="./tools/moodle-release-pack.zip" download>{LEARNING_NAME}</a>
</p>
<p class="note">Extract the ZIP and follow the included instructions. Each download contains its software license.</p>
<script>
const reference = new URLSearchParams(location.search).get("checkout_id");
if (reference) {{
  document.getElementById("ref").textContent = reference.slice(0, 128);
  document.getElementById("ref-note").hidden = false;
}}
</script>
""", indexable=False)

# ---------------------------------------------------------------- procurement
emit("procurement.html", f"Institutional procurement — {LEARNING_OFFER['name']}", "Annual seat licensing, tested Moodle versions and institutional purchase requirements.", f"""
<p class="kicker">For institutions · print-friendly</p>
<h1>{LEARNING_NAME}</h1>
<p class="lede">A verified question-bank handoff for Moodle: merges previously exported Moodle XML banks into one import file plus a per-question receipt — category, stable id, source line and SHA-256 — so a reviewer can spot-check before importing.</p>
<div class="card">
<h3>At a glance</h3>
<div class="scroll" tabindex="0" role="region" aria-label="License and compatibility details"><table>
<tr><th>Item</th><th>Detail</th></tr>
<tr><td>Price per commercial seat</td><td class="num">{escape(LEARNING_OFFER["price"])} / {escape(LEARNING_OFFER["period"])} (USD)</td></tr>
<tr><td>License</td><td>One non-transferable commercial seat per key; evaluation free</td></tr>
<tr><td>Verified Moodle versions</td><td>4.5.16 LTS, 5.2.5, 5.3.1 (native import + round-trip, teacher/student permissions)</td></tr>
<tr><td>Question types</td><td>multichoice, truefalse, shortanswer, numerical, essay, cloze; embedded files preserved</td></tr>
<tr><td>Data handling</td><td>Runs locally in the browser; question banks are never uploaded</td></tr>
<tr><td>Merchant of record</td><td>Polar — handles tax, receipts and invoices</td></tr>
<tr><td>Support</td><td>Email <a href="mailto:{SUPPORT}">{SUPPORT}</a> (best-effort, licensed customers)</td></tr>
<tr><td>Billing</td><td>Annual</td></tr>
</table></div>
</div>
<h2>Buying for an institution</h2>
<ol>
<li><strong>Quote:</strong> email <a href="mailto:{SUPPORT}?subject=Institutional%20license%20quote">{SUPPORT}</a> with your institution name, billing contact and number of seats.</li>
<li><strong>Requirements:</strong> tell us before ordering if your institution needs purchase-order payment or specific vendor, tax or security documents. We can confirm what is available for your purchase.</li>
<li><strong>Online purchase:</strong> the current checkout accepts card payment through Polar. Review the billing details and price before paying. For invoices and license details after payment, use your Polar receipt and customer portal.</li>
</ol>
<h2>What it does not do</h2>
<p>It does not author questions, assign grades, or decide import approval. Grading, content and pedagogical decisions remain the institution's. Duplicate question ids within a category are rejected rather than silently merged.</p>
<h2>Evaluation before purchase</h2>
<p>Open the <a href="./moodle-release-pack/#release">browser demo</a> with a representative exported bank to check the merge and receipt before purchasing.</p>
<div class="note">Sync Sanctuary · rhemahq.com · {TODAY}. Purchases governed by Polar buyer terms; product license in the download's LICENSE.txt.</div>
""")

# ---------------------------------------------------------------- services
emit("services.html", "Production services — Sync Sanctuary", "Discuss a scoped invoice handoff, journal galley pack or assessment bank release.", f"""
<p class="kicker">Services</p>
<h1>Production services</h1>
<p class="lede">Tell us about the handoff you need. We’ll confirm availability, deliverables, timing and payment arrangements before work begins.</p>
<div class="card">
<h3>Fulfillment close pack</h3>
<p>A fee rollup and source-reference workbook from compatible CSV or Excel invoice exports. Tell us the provider, export format and number of files.</p>
</div>
<div class="card">
<h3>Journal galley pack</h3>
<p>A PDF, standalone HTML and JATS XML handoff for your editor, starting from an accepted Word manuscript. Tell us your publication date, house style and validation requirements.</p>
</div>
<div class="card">
<h3>Assessment bank release</h3>
<p>One merged assessment XML import file, category counts and a per-question receipt. Tell us the number of exports and questions you need to release.</p>
</div>
<h2>Discuss your project</h2>
<ol>
<li>Email <a href="mailto:{SUPPORT}?subject=Service%20inquiry">{SUPPORT}</a> with the file formats, counts and deadline. Start with a description of the files.</li>
<li>If we can take on the project, we’ll confirm price, payment, delivery, and file handling in writing.</li>
</ol>
<p>Your team reviews and approves the result.</p>
{cta_row()}
""")

# ---------------------------------------------------------------- guides
GUIDES = [
    ("moodle-merge-multiple-xml.html", "Import multiple XML files into a Moodle question bank",
     "Step-by-step: merge several exported Moodle XML question banks into one import without losing categories, ids or embedded files.",
     "How to import multiple Moodle XML question banks into one bank — categories, duplicate ids, embedded files, and a verification receipt.", f"""
<p class="kicker">Guide · Moodle</p>
<h1>Import multiple XML files into a Moodle question bank</h1>
<p class="lede">Moodle's import screen takes <strong>one file at a time</strong>. When a course arrives as several exported banks — per topic, per author, per legacy course — the naive loop loses categories, collides ids and silently drops embedded files. Here is the reliable path, and how to prove the result.</p>
<h2>What Moodle XML actually carries</h2>
<p>A Moodle XML export is a <code>&lt;quiz&gt;</code> element containing <code>&lt;question&gt;</code> elements. Two details matter when merging:</p>
<ul>
<li><strong>Categories are questions too.</strong> A <code>&lt;question type="category"&gt;</code> element sets the category for the questions that follow it, via a path like <code>$course$/top/Topic 1</code>. If you concatenate files without re-emitting category markers, later questions land in the wrong category — or the default one.</li>
<li><strong>Embedded files are references.</strong> Images and media appear as <code>@@PLUGINFILE@@</code> URLs with base64 <code>&lt;file&gt;</code> elements. A merge that strips or re-encodes them breaks the question on import.</li>
</ul>
<h2>The manual path (and where it fails)</h2>
<ol>
<li>In the source course, export each bank: <em>Question bank → Export → Moodle XML format</em>, one category at a time.</li>
<li>In the target course, import each file: <em>Question bank → Import → Moodle XML format</em>. Tick <strong>"Get category from file"</strong> if you want the export's category path honored; otherwise pick the category explicitly.</li>
<li>Repeat per file. After each import, check the count shown against the source.</li>
</ol>
<p>Failure modes we see in practice: two files use the same question name (Moodle treats names as identifiers within a category, so the second can overwrite or duplicate); a file exported from an older Moodle carries category paths that no longer exist in the target; cloze subquestions are miscounted because they share the parent's name in some queries; embedded files import but render broken because the reference was rewritten.</p>
<h2>The merged-file path</h2>
<p>Instead of N imports, build <strong>one</strong> import file that re-emits a category marker whenever the category changes, preserves each question element byte-for-byte, and rejects duplicate <code>(category, id)</code> pairs before you ever touch Moodle:</p>
<pre><code>&lt;?xml version="1.0" encoding="UTF-8"?&gt;
&lt;quiz&gt;
  &lt;question type="category"&gt;&lt;category&gt;&lt;text&gt;$course$/top/Topic 1&lt;/text&gt;&lt;/category&gt;&lt;/question&gt;
  ...questions from bank A, unchanged...
  &lt;question type="category"&gt;&lt;category&gt;&lt;text&gt;$course$/top/Topic 2&lt;/text&gt;&lt;/category&gt;&lt;/question&gt;
  ...questions from bank B, unchanged...
&lt;/quiz&gt;</code></pre>
<p>Then import once, with "Get category from file" enabled. One import, one count to check, categories intact.</p>
<h2>Prove it with a receipt</h2>
<p>Before importing, produce a row per question: <strong>source file, category, id, source line, SHA-256 of the question element</strong>. After importing, export the target bank and compare counts per category and a sample of checksums. If a row is missing or changed, you know exactly which source line to re-open — not "something went wrong with 300 questions".</p>
<div class="card">
<h3>Do it with the tool</h3>
<p>The <strong>{LEARNING_NAME}</strong> does the merge, the duplicate rejection and the receipt in your browser — nothing uploaded. Free evaluation; commercial use via a Polar license key. Verified by native import and round-trip on Moodle 4.5.16 LTS, 5.2.5 and 5.3.1, including cloze subquestions, embedded files and teacher/student import permissions.</p>
<p class="page-actions"><a class="cta solid" href="../#demos">Run the free demo</a><a class="cta" href="../tools/moodle/index.html">Open the tool</a><a class="cta" href="../procurement.html">Procurement one-pager</a></p>
</div>
<h2>Limits</h2>
<p>The merge preserves what you supplied; it does not author, regrade or approve questions. Import capability still depends on your role (editing teacher or above). The free WordTable plugin covers Word-table input but its published support stops at Moodle 5.0; native XML merge is a different job.</p>
<p class="note">Sources: Moodle docs <a href="https://docs.moodle.org/en/Import_questions">Import questions</a> and <a href="https://docs.moodle.org/en/Moodle_XML_format">Moodle XML format</a>; version verification performed 2026-11-21 on disposable native installations. </p>
"""),
    ("moodle-import-verification.html", "Verify a Moodle question import: counts, categories, checksums",
     "A repeatable spot-check procedure for Moodle question-bank imports: per-category counts, duplicate ids, cloze subquestions, embedded files and a SHA-256 receipt.",
     "How to verify a Moodle question bank import actually preserved every question, category, cloze field and embedded file — with a checksum receipt.", f"""
<p class="kicker">Guide · Moodle</p>
<h1>Verify a Moodle question import, line by line</h1>
<p class="lede">"Import successful" is not evidence. Moodle can report success while a category collapsed, a duplicate name overwrote a question, or an embedded file broke. This is a spot-check procedure you can run in ten minutes, and the receipt that makes it mechanical.</p>
<h2>What silently goes wrong</h2>
<ul>
<li><strong>Category drift.</strong> Without "Get category from file", everything lands in the chosen category; with it, a stale path can create an unexpected one.</li>
<li><strong>Name collisions.</strong> Question names act as identifiers within a category. Two banks using "Q1" collide.</li>
<li><strong>Cloze undercount.</strong> Cloze subquestions can share the parent name in indexed queries; a naive count reports <code>shortanswer</code> children as separate questions or misses them.</li>
<li><strong>Embedded files.</strong> Base64 <code>&lt;file&gt;</code> payloads must survive byte-for-byte; a rewritten <code>@@PLUGINFILE@@</code> reference renders broken.</li>
<li><strong>Settings loss.</strong> Default marks, penalties, shuffle flags and answer fractions are easy to drop in a hand-rolled conversion.</li>
</ul>
<h2>The ten-minute spot-check</h2>
<ol>
<li><strong>Count per category, not total.</strong> Export the target bank (Moodle XML) and count top-level questions per category. Compare against the source counts. Totals can match while two categories swapped contents.</li>
<li><strong>Check top-level vs children.</strong> Count cloze parents separately from their subquestions; verify each parent's child count and answer settings.</li>
<li><strong>Sample five questions across types</strong> (multichoice with multiple correct, truefalse, shortanswer case sensitivity, numerical tolerance, essay attachment config). Open each in the preview and confirm grading settings.</li>
<li><strong>Hash the embedded files.</strong> Extract each <code>&lt;file&gt;</code> payload from source and target exports and compare SHA-256. Equal hashes mean the bytes survived.</li>
<li><strong>Test permissions.</strong> Confirm an editing teacher can import and re-export, and a student cannot import — the capability check, not just the happy path.</li>
</ol>
<h2>Make it a receipt instead of a ritual</h2>
<p>A receipt row per question — <strong>source file, category, id, type, source line, SHA-256 of the question element</strong> — turns the spot-check into a diff. Re-run the export after import, recompute hashes, and any mismatch points at an exact source line. Keep the receipt with the release record so an auditor can re-open what was read.</p>
<div class="card">
<h3>Do it with the tool</h3>
<p>The <strong>{LEARNING_NAME}</strong> emits the merged import file and this receipt together, rejects duplicate <code>(category, id)</code> pairs, and preserves embedded files. The identical contract was verified natively on Moodle 4.5.16 LTS, 5.2.5 and 5.3.1: seven questions, six types, category split, cloze fields, four embedded attachments, teacher import and student denial.</p>
<p class="page-actions"><a class="cta solid" href="../#demos">Run the free demo</a><a class="cta" href="../tools/moodle/index.html">Open the tool</a></p>
</div>
<h2>Limits</h2>
<p>Verification proves the bytes and settings you supplied survived. It does not prove the questions are pedagogically sound, correctly keyed, or approved for release — those remain the institution's decisions.</p>
<p class="note">Sources: Moodle docs <a href="https://docs.moodle.org/en/Import_questions">Import questions</a>, <a href="https://docs.moodle.org/en/Export_questions">Export questions</a>; native contract checks 2026-11-21. </p>
"""),
    ("fulfyld-bdr-reconciliation.html", "Reconcile Fulfyld Billing Detail Reports (BDR) in a workbook",
     "The Fulfyld BDR CSV export, field by field, and how to cite each original Excel row or CSV record in a reconciliation workbook.",
     "Fulfyld Billing Detail Report (BDR) CSV fields, download path, and a source-row reconciliation workflow for 3PL finance ops.", """
<p class="kicker">Guide · 3PL finance ops</p>
<h1>Reconcile Fulfyld Billing Detail Reports without losing the source row</h1>
<p class="lede">Fulfyld publishes an itemized <strong>Billing Detail Report (BDR)</strong> per invoice. It is the right input for a tie-out — but only if every billed row keeps its original address, so a disputed line can be re-opened in the exact file it came from.</p>
<h2>Getting the export</h2>
<p>Download the <strong>CSV attached to an Invoiced invoice</strong> or export the detailed Excel report from the Billing section of the Fulfyld dashboard. Check the header names in your own file before mapping the fee fields.</p>
<h2>Fields that matter for a tie-out</h2>
<div class="scroll" tabindex="0" role="region" aria-label="Fields to review"><table>
<tr><th>Field</th><th>Use in reconciliation</th></tr>
<tr><td>Date</td><td>Month bucket (normalize Excel serials to ISO dates first)</td></tr>
<tr><td>Order number</td><td>Join key back to your order system</td></tr>
<tr><td>SKU</td><td>Line-level identity</td></tr>
<tr><td>Service type / fee label</td><td>Rollup label — keep the provider's exact wording</td></tr>
<tr><td>Quantity</td><td>Sum only where supplied; blank stays blank</td></tr>
<tr><td>Unit cost</td><td>Blank stays blank; do not infer</td></tr>
<tr><td>Total</td><td>Signed amount — credits stay negative</td></tr>
</table></div>
<h2>The workflow</h2>
<ol>
<li><strong>Collect</strong> the BDR CSVs for the period, one per invoice. Keep the original filenames.</li>
<li><strong>Normalize dates.</strong> Spreadsheet exports often carry Excel serial numbers; convert to <code>YYYY-MM-DD</code> before bucketing by month, or your rollup grows a "46114.3" month.</li>
<li><strong>Roll up</strong> by provider × currency × month × exact fee label. Count rows, sum quantities only where present, sum signed totals.</li>
<li><strong>Keep a source-reference sheet:</strong> retain the original file name and SHA-256, together with the worksheet row or CSV record, label and total. CSV records include the header and can span more than one text line if a field contains a quoted line break.</li>
<li><strong>Review exceptions</strong> — labels that changed wording mid-period, currencies mixed in one invoice, credits without a matching charge. The workbook surfaces them; a human decides.</li>
</ol>
<h2>What this is not</h2>
<p>A consolidation and evidence workbook is <strong>not</strong> an error detector and not a ledger posting. It does not decide that a charge is wrong; it makes every charge re-openable. Published "3–15% billing leakage" figures in this market are vendor-reported — WareAudit's own site notes no independent study exists — so treat any error-rate claim, including ours if we ever made one, as marketing until measured on your own bills.</p>
<div class="card">
<h3>Do it with the tool</h3>
<p>Open the original export in <strong>Fulfillment Ledger</strong>. If the headers differ from its standard columns, use the column-matching dialog. Check which source columns represent the date, service type and signed total. Set a provider or currency for the sheet only after checking the invoice. The workbook records the selected file's original checksum and source positions.</p>
<p class="page-actions"><a class="cta solid" href="../#demos">Run the free demo</a><a class="cta" href="../tools/ledger/index.html">Open the tool</a><a class="cta" href="./3pl-reconciliation-comparison.html">Compare the options</a></p>
</div>
<p class="note">Source: <a href="https://www.fulfyld.com/docs/download-review-excel-billing-detail-reports/">Fulfyld — download &amp; review Excel billing detail reports</a> (opened 2026-11-22). Exact fee-label column to be confirmed against a customer-authorized export. </p>
"""),
    ("ojs-35-galley-production.html", "OJS 3.5 galley production: Word to PDF, HTML and JATS",
     "End-to-end galley production on OJS 3.5: the native add-galley workflow, JATS Publishing 1.2 DTD validation, and where a local pipeline fits.",
     "OJS 3.5 production workflow guide: DOCX to PDF + HTML + JATS Publishing 1.2 galleys, DTD validation, and native galley registration.", """
<p class="kicker">Guide · Scholarly publishing</p>
<h1>OJS 3.5 galley production: Word → PDF + HTML + JATS</h1>
<p class="lede">OJS 3.5 is the current LTS line (3.5.0-6, released 2026-11-01). Its production stage expects you to <strong>supply galleys</strong>; it does not typeset your Word manuscript. This guide walks the native workflow and where a local conversion pipeline fits — including the parts that still need a human.</p>
<h2>The native workflow</h2>
<ol>
<li>Submission reaches <strong>Production</strong> after copyediting. The production editor works from the final draft files.</li>
<li><em>Publication → Galleys → Add galley</em>: give it a label (PDF, HTML, XML), upload the file, set language and rights.</li>
<li>For HTML galleys, dependent files (images, CSS) are uploaded as <strong>dependent files</strong> of the galley.</li>
<li>For JATS XML, OJS stores the file; rendering depends on your viewer (the Lens/eLens family has known maintenance problems — PKP staff say so plainly in the community forum).</li>
<li>Assign galleys to the issue, set volume/issue metadata, and publish.</li>
</ol>
<h2>Producing the three formats from one Word source</h2>
<p>A reproducible local pipeline:</p>
<ol>
<li><strong>DOCX → HTML</strong> with pandoc (<code>--to=html5</code>), preserving structure: abstract, headings, tables, figures, references.</li>
<li><strong>DOCX → JATS</strong> with pandoc's <code>jats_publishing</code> writer, then insert the journal's volume/issue metadata into the XML.</li>
<li><strong>Validate JATS</strong> against the official Publishing 1.2 MathML2 DTD. Check the receiving indexer’s requirements as part of submission review.</li>
<li><strong>HTML → PDF</strong> with a paged-media renderer (a headless browser print pipeline works; commercial engines like PrinceXML offer PDF/UA). Two-column layout, running heads, figure placement.</li>
<li><strong>Register</strong> the three files on the submission via OJS's galley repositories (or the UI), associate figures as dependent files, and verify stored checksums match the originals.</li>
</ol>
<div class="card">
<h3>Verified, not asserted</h3>
<p>This pipeline was executed end-to-end on a disposable <strong>OJS 3.5.0.4</strong> installation: a generated DOCX produced PDF, HTML and JATS; the JATS passed the official Publishing 1.2 MathML2 DTD; all three galleys registered natively on one draft with the PNG associated as a dependent file; MIME types matched and all four files matched their original SHA-256 in OJS private storage.</p>
<p class="page-actions"><a class="cta solid" href="../tools/ojs-galley-studio.zip">Download the GPLv3 release</a><a class="cta" href="../services.html">Ask about production help</a></p>
</div>
<h2>Honest limits</h2>
<ul>
<li><strong>Complex layouts need an editor.</strong> Free DOCX→JATS converters (including the OJS <code>docxConverter</code> plugin) handle simple articles; a journal editor in the PKP forum reports their journal was "too complex for it". Multi-column figures, custom floats and heavy math still need review.</li>
<li><strong>JATS display is a separate problem.</strong> Producing valid JATS does not give you a working in-OJS viewer; plan for the viewer maintenance risk.</li>
<li><strong>Native production is planned for OJS 3.6.</strong> PKP describes built-in HTML, PDF and JATS XML output. Review the release notes and test your house style when the features are available on your installation.</li>
<li><strong>Version drift.</strong> Our native verification ran on 3.5.0.4; 3.5.0-6 is current. Re-run the fixture on your exact version before relying on it.</li>
</ul>
<h2>Compare production options on one article</h2>
<p>Use the same accepted manuscript and house style for each option. Include setup, editor review and corrections in your estimate. If you need a handoff by a specific date, <a href="../services.html">ask about a scoped galley pack</a>.</p>
<p class="note">Sources: <a href="https://docs.pkp.sfu.ca/learning-ojs/en/production">PKP production guide</a>, <a href="https://public.nlm.nih.gov/projects/jats/publishing/1.2/">JATS Publishing 1.2 DTD</a>, <a href="https://pkp.sfu.ca/2026/05/26/ojs-3-6-bringing-manuscript-editing-and-production-under-one-roof/">PKP’s OJS 3.6 production plan</a>, and <a href="https://pkp.sfu.ca/software/ojs/download/">OJS download page</a>.</p>
"""),
    ("3pl-reconciliation-comparison.html", "3PL billing reconciliation options compared (2026)",
     "An honest comparison of Cartwright Labs ShipBob Billing Reconciler, WareAudit, SKU.io and the Fulfillment Ledger workbook: price, inputs, hosting, evidence.",
     "Compare 3PL invoice reconciliation tools in 2026: Cartwright Labs, WareAudit, SKU.io and an offline workbook — prices, inputs, hosting and source evidence.", """
<p class="kicker">Guide · 3PL finance ops</p>
<h1>3PL billing reconciliation: four options, honestly compared</h1>
<p class="lede">Prices and scopes below were read from vendor pages on 2026-11-22. They change; check before you buy. We sell one of these options, so read the "what it does not do" column first.</p>
<div class="scroll" tabindex="0" role="region" aria-label="3PL tool comparison"><table>
<tr><th>Option</th><th>Price (as read)</th><th>Inputs</th><th>Hosting</th><th>Evidence per finding</th></tr>
<tr><td><strong>Cartwright Labs — ShipBob Billing Reconciler</strong></td><td class="num">$49/mo from run 3; first two runs free; billed via Shopify</td><td>Shopify orders/fulfillments/refunds ↔ ShipBob shipments/billing, via API install + token</td><td>Hosted app</td><td>Findings list, 8 checks over 7/14/30-day windows; sample PDF</td></tr>
<tr><td><strong>WareAudit</strong></td><td class="num">$149/mo Starter (≤3,000 orders); $299 one-off (3 months of bills); ~10% annual discount</td><td>Any-3PL CSV upload</td><td>Hosted</td><td>Findings reports; evidence column labeled provider Line ID</td></tr>
<tr><td><strong>SKU.io</strong></td><td class="num">from $1,000/mo</td><td>Synced ShipBob bills (account connection)</td><td>Hosted</td><td>Groups by original fee name, count, total; export omits original file/worksheet/row</td></tr>
<tr><td><strong>Fulfillment Ledger (ours)</strong></td><td class="num">$49/mo</td><td>CSV or Excel with the tool's expected headers</td><td><strong>Local browser; nothing uploaded</strong></td><td>Per-row original file, worksheet/line, SHA-256 of source; rollup + source-reference sheets</td></tr>
</table></div>
<h2>How to choose</h2>
<ul>
<li><strong>You live in Shopify + ShipBob and want automated checks:</strong> Cartwright is built for exactly that, at the same $49 price. It connects accounts and runs eight discrepancy checks. If that is your whole stack, it is a strong fit.</li>
<li><strong>You want a findings-based audit across providers and will pay for it:</strong> WareAudit's $149/mo or $299 one-off covers any-3PL CSV with dispute-oriented reports.</li>
<li><strong>You are already paying for SKU.io sync:</strong> its bill grouping is included; you do not need another tool for rollups.</li>
<li><strong>You have multiple 3PLs, are not on Shopify, cannot connect APIs, or need the original row address for credit disputes:</strong> the offline workbook is the only option here that needs no account connection and keeps file/worksheet/line + hash per row.</li>
</ul>
<h2>What our tool does not do</h2>
<p>It does <strong>not</strong> detect overcharges automatically, connect to Shopify or ShipBob, or decide that a charge is wrong. It consolidates and preserves evidence so a human can dispute fast. If you want automated discrepancy detection, buy Cartwright or WareAudit — that is their job, and they do it.</p>
<h2>About those "3–15% leakage" numbers</h2>
<p>Every error-rate statistic in this market is vendor-reported. WareAudit's own site states no independent study exists. We therefore sell <strong>hours saved at close and faster credit disputes</strong>, not a recovery percentage. Measure your own baseline before believing anyone's number, including ours.</p>
<div class="card">
<h3>Try before you buy</h3>
<p>Free evaluation download and a live browser demo with a synthetic sample — run your own export through it, nothing uploaded.</p>
<p class="page-actions"><a class="cta solid" href="../#demos">Run the free demo</a><a class="cta" href="../tools/ledger/index.html">Open the tool</a><a class="cta" href="./fulfyld-bdr-reconciliation.html">Fulfyld BDR guide</a></p>
</div>
<p class="note">Sources opened 2026-11-22: <a href="https://www.cartwrightlabs.com/shipbob-billing-audit/">cartwrightlabs.com</a>, <a href="https://wareaudit.com/">wareaudit.com</a>, <a href="https://www.sku.io/pricing/">sku.io/pricing</a>. Cartwright was in private pilot at reading time. </p>
"""),
]

for rel, title, desc, meta, body in GUIDES:
    emit("guides/" + rel, title + " — Sync Sanctuary", meta, body)

emit("guides/index.html", "Guides — Sync Sanctuary",
     "Practical, source-cited guides for Moodle question-bank handoffs, OJS galley production and 3PL invoice reconciliation.", """
<p class="kicker">Guides</p>
<h1>Guides for the <em>handoff</em>.</h1>
<p class="lede">Step-by-step guides to journal galleys, invoice reconciliation, and Moodle question-bank releases.</p>
<ul class="guide-list">
<li><a href="./moodle-merge-multiple-xml.html">Import multiple XML files into a Moodle question bank</a><p>Categories, duplicate ids, embedded files, and the merged-file path with a receipt.</p></li>
<li><a href="./moodle-import-verification.html">Verify a Moodle question import, line by line</a><p>Per-category counts, cloze subquestions, embedded-file hashes, permission checks.</p></li>
<li><a href="./fulfyld-bdr-reconciliation.html">Reconcile Fulfyld Billing Detail Reports</a><p>The BDR CSV field by field, and a tie-out that keeps every row's original address.</p></li>
<li><a href="./ojs-35-galley-production.html">OJS 3.5 galley production: Word → PDF + HTML + JATS</a><p>The native add-galley workflow, DTD validation, and the 3.6 roadmap watch.</p></li>
<li><a href="./3pl-reconciliation-comparison.html">3PL billing reconciliation: four options compared</a><p>Cartwright, WareAudit, SKU.io and the offline workbook — prices, inputs, evidence, limits.</p></li>
</ul>
""" + cta_row("../"))

# ---------------------------------------------------------------- sitemap / robots
product_pages = [json.loads(offer.read_text(encoding="utf-8"))["slug"] + "/"
                 for offer in sorted((SITE / "src/domain").glob("*/offer.json"))]
pages = ["", *product_pages, *(canonical for _, canonical, indexable in EMITTED if indexable)]
urls = "\n".join(f"  <url><loc>{BASE}/{path}</loc></url>" for path in pages)
(SITE / "sitemap.xml").write_text(
    '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    + urls + "\n</urlset>\n", encoding="utf-8", newline="\n")
(SITE / "robots.txt").write_text(
    f"User-agent: *\nAllow: /\nSitemap: {BASE}/sitemap.xml\n", encoding="utf-8", newline="\n")

print(f"Emitted {len(EMITTED)} pages, sitemap.xml and robots.txt")
