"""Emit the static trust, guide, procurement, service and post-checkout pages for rhemahq.com.

Run:  python -X utf8 scripts/build_site_pages.py
Writes into ../site relative to this script's project root. Idempotent: overwrites only the
files it owns (listed in EMITTED). No data files are read; prices are the public Polar prices
verified 2026-11-23 ($59/mo N13, $49/mo N27, $499/yr N31).
"""
from pathlib import Path
from string import Template

ROOT = Path(__file__).resolve().parent.parent
SITE = ROOT / "site" if (ROOT / "site").is_dir() else ROOT
BASE = "https://rhemahq.com"
TODAY = "2026-11-23"
SUPPORT = "support@trimprocure.com"  # swap to support@rhemahq.com once the domain mailbox exists

CSS = """
:root{--void:#060709;--panel:rgba(255,255,255,.025);--line:rgba(255,255,255,.09);
--ink:rgba(255,255,255,.92);--ink2:rgba(255,255,255,.66);--ink3:rgba(255,255,255,.42);
--paper:#E6E1D3;--verify:#00E38C;--serif:"Instrument Serif",serif;--sans:"Inter",system-ui,sans-serif;
--mono:"JetBrains Mono",monospace;--ease:cubic-bezier(0.16,1,0.3,1)}
*{box-sizing:border-box;margin:0}
body{background:var(--void);color:var(--ink);font:400 16px/1.7 var(--sans);-webkit-font-smoothing:antialiased}
a{color:var(--paper);text-decoration:none;border-bottom:1px solid var(--line)}
a:hover{border-color:var(--paper)}
::selection{background:var(--paper);color:var(--void)}
:focus-visible{outline:2px solid var(--paper);outline-offset:3px;border-radius:4px}
.wrap{max-width:820px;margin:0 auto;padding:0 24px}
header.top{border-bottom:1px solid var(--line);padding:18px 0;margin-bottom:48px}
header.top .wrap{display:flex;align-items:center;gap:18px;flex-wrap:wrap}
.brand{font:500 15px var(--mono);color:var(--ink);border:0}
.brand span{color:var(--paper)}
header.top nav{margin-left:auto;display:flex;gap:16px;font-size:14px}
header.top nav a{color:var(--ink2);border:0}
header.top nav a:hover{color:var(--ink)}
h1,h2,h3{font-family:var(--serif);font-weight:400;letter-spacing:-.02em;line-height:1.1}
h1{font-size:clamp(2.2rem,5vw,3.4rem);margin-bottom:14px}
h2{font-size:1.7rem;margin:44px 0 12px;color:var(--paper)}
h3{font-size:1.25rem;margin:28px 0 8px}
p{margin:12px 0;color:var(--ink2)}
strong{color:var(--ink);font-weight:600}
em{color:var(--paper)}
ul,ol{margin:12px 0 12px 22px;color:var(--ink2)}
li{margin:6px 0}
code{font:400 13.5px var(--mono);color:var(--verify);background:rgba(0,227,140,.07);border:1px solid rgba(0,227,140,.18);border-radius:5px;padding:1px 6px}
pre{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:16px;overflow-x:auto;margin:16px 0}
pre code{background:none;border:0;padding:0;color:var(--ink2);font-size:12.5px;line-height:1.8}
.kicker{font:500 11px var(--mono);letter-spacing:.14em;text-transform:uppercase;color:var(--ink3);margin-bottom:18px}
.lede{font-size:17px;color:var(--ink2);max-width:62ch}
.card{background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:22px;margin:22px 0}
.card h3{margin-top:0}
.cta{display:inline-flex;align-items:center;gap:8px;border:1px solid var(--line);border-radius:999px;padding:11px 20px;font:500 14px var(--sans);color:var(--ink);background:rgba(255,255,255,.03);margin:6px 8px 6px 0}
.cta:hover{background:rgba(255,255,255,.07);border-color:var(--paper)}
.cta.solid{background:var(--paper);color:var(--void);border-color:transparent}
.cta.solid:hover{background:#f2eee2}
table{width:100%;border-collapse:collapse;font:400 13px var(--mono);margin:16px 0}
.scroll{overflow-x:auto}
th{font:500 10px var(--mono);letter-spacing:.1em;text-transform:uppercase;color:var(--ink3);text-align:left;padding:8px 10px;border-bottom:1px solid var(--line)}
td{padding:8px 10px;border-bottom:1px solid rgba(255,255,255,.05);color:var(--ink2);vertical-align:top}
td.num{text-align:right;color:var(--ink)}
.note{font-size:13px;color:var(--ink3);border-left:2px solid var(--line);padding-left:14px;margin:18px 0}
.ok{color:var(--verify)}
footer{border-top:1px solid var(--line);margin-top:72px;padding:30px 0 48px;color:var(--ink3);font-size:13px}
footer .wrap{display:flex;gap:18px;flex-wrap:wrap;justify-content:space-between}
footer a{color:var(--ink2)}
.guide-list{list-style:none;margin:24px 0 0}
.guide-list li{border-top:1px solid var(--line);padding:18px 0;margin:0}
.guide-list a{font-family:var(--serif);font-size:1.3rem;color:var(--ink);border:0}
.guide-list a:hover{color:var(--paper)}
.guide-list p{margin:6px 0 0;font-size:14px}
@media (max-width:640px){header.top nav{margin-left:0;width:100%}.wrap{padding:0 18px}}
@media print{
  body{background:#fff;color:#111;font-size:12px}
  a{color:#111;border:0}
  header.top nav,.cta,footer .nav-links{display:none}
  h1,h2,h3,.brand span{color:#111}
  p,li,td{color:#222}
  .card{border:1px solid #ccc;background:#fff}
  code{color:#111;background:#f4f4f4;border-color:#ddd}
  .kicker,.note,th{color:#555}
  footer{color:#555;border-color:#ccc}
}
"""

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
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='7' fill='%23060709'/><path d='M9,17l5,5l9,-11' stroke='%2300E38C' stroke-width='3' fill='none' stroke-linecap='round' stroke-linejoin='round'/></svg>">
<link rel="stylesheet" href="$css_href">
$extra_head
</head>
<body>
<header class="top">
  <div class="wrap">
    <a class="brand" href="$root_href">sync<span>sanctuary</span></a>
    <nav aria-label="Primary">
      <a href="$root_href#tools">Tools</a>
      <a href="$root_href#demos">Demos</a>
      <a href="$guides_href">Guides</a>
      <a href="$root_href#get">Get the tools</a>
    </nav>
  </div>
</header>
<main class="wrap">
$body
</main>
<footer>
  <div class="wrap">
    <p>© 2026 Sync Sanctuary · rhemahq.com</p>
    <p class="nav-links"><a href="${root_href}refund.html">Refunds</a> · <a href="${root_href}privacy.html">Privacy</a> · <a href="${root_href}terms.html">Terms</a> · <a href="${root_href}procurement.html">Procurement</a> · <a href="mailto:$support">Support</a></p>
  </div>
</footer>
</body>
</html>
""")

EMITTED = []


def emit(rel: str, title: str, desc: str, body: str, extra_head: str = ""):
    path = SITE / rel
    depth = rel.count("/")
    root_href = "../" * depth if depth else "./"
    css_href = root_href + "assets/page.css"
    guides_href = root_href + "guides/"
    html = TPL.substitute(
        title=title, desc=desc, canonical=BASE + "/" + rel, css_href=css_href,
        root_href=root_href, guides_href=guides_href, support=SUPPORT,
        extra_head=extra_head, body=body,
    )
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(html, encoding="utf-8")
    EMITTED.append(rel)


def cta_row(root="./"):
    return (
        f'<p><a class="cta solid" href="{root}#get">Get the tools</a>'
        f'<a class="cta" href="{root}#demos">Run the free demos</a>'
        f'<a class="cta" href="mailto:{SUPPORT}">Ask a question</a></p>'
    )


# ---------------------------------------------------------------- legal / trust
emit("refund.html", "Refunds — Sync Sanctuary", "How refunds work for Sync Sanctuary tools purchased through Polar as merchant of record.", f"""
<p class="kicker">Policies</p>
<h1>Refunds</h1>
<p class="lede">Purchases are processed by <strong>Polar</strong> as merchant of record. Polar handles payment, tax and the refund transaction; we handle the product and your license.</p>
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
<li>Files you already produced with the tool remain yours. The tools run locally; we never hold your invoices, manuscripts or question banks, so there is nothing for us to delete on your behalf.</li>
</ul>
<h2>Before you buy</h2>
<p>Every tool has a <strong>free evaluation download and a live browser demo</strong> at <a href="https://rhemahq.com">rhemahq.com</a>. Run your own representative file through the evaluation first — it is the same code path as the licensed tool. If it does not fit your workflow, you have lost nothing.</p>
<div class="note">Refund processing fees charged by the payment network are not returned to us by Polar; this does not change the amount Polar refunds you under its terms.</div>
{cta_row()}
""")

emit("privacy.html", "Privacy — Sync Sanctuary", "What rhemahq.com and the Sync Sanctuary tools collect: local file processing, no uploads, minimal license and checkout data.", f"""
<p class="kicker">Policies</p>
<h1>Privacy</h1>
<p class="lede">The short version: <strong>your files never leave your device.</strong> The tools read and write locally in your browser or on your machine. This page lists everything that does touch a network.</p>
<h2>The tools</h2>
<ul>
<li><strong>File processing is local.</strong> Invoices, manuscripts and question banks are read in your browser (or by the local scripts) and are not uploaded to us or to Polar.</li>
<li><strong>License validation</strong> (licensed commercial use only) sends the organization identifier, the benefit identifier and your license key to Polar's validation endpoint. It does not send file contents, filenames or row data.</li>
<li><strong>No accounts</strong> are required on this site, and we set no advertising or tracking cookies.</li>
</ul>
<h2>This website</h2>
<ul>
<li>Static pages served by GitHub Pages. GitHub logs standard request metadata (IP, user agent) under its own privacy statement.</li>
<li>Fonts load from Google Fonts and the demo spreadsheet library from jsDelivr; those providers receive standard request metadata.</li>
<li>Event instrumentation on this site queues interactions locally and forwards them only to a first-party analytics endpoint if one is configured. No third-party analytics or advertising scripts are loaded by default.</li>
</ul>
<h2>Checkout</h2>
<p>Payment is handled entirely by <strong>Polar</strong> as merchant of record. Polar collects the billing and payment data needed to process the order, calculate tax and issue your receipt and invoice, under Polar's privacy policy. We receive order metadata (product, amount, status) and the contact email you provide, which we use for support and license delivery.</p>
<h2>Support email</h2>
<p>If you write to <a href="mailto:{SUPPORT}">{SUPPORT}</a>, we keep the correspondence to answer you and to improve the product. We do not sell or share it. Ask us to delete it at any time.</p>
<h2>Retention and rights</h2>
<p>Order records are retained as required for tax and accounting through Polar. You may request access, correction or deletion of correspondence we hold by emailing support. Because file processing is local, there is no file content held by us to access or delete.</p>
<div class="note">Last updated {TODAY}. Questions: <a href="mailto:{SUPPORT}">{SUPPORT}</a>.</div>
""")

emit("terms.html", "Terms — Sync Sanctuary", "Evaluation and commercial license terms for Sync Sanctuary tools; purchases governed by Polar buyer terms.", f"""
<p class="kicker">Policies</p>
<h1>Terms</h1>
<p class="lede">These terms cover use of rhemahq.com and the Sync Sanctuary tools. The purchase transaction itself is governed by <strong>Polar's buyer terms</strong>, since Polar is the merchant of record.</p>
<h2>Evaluation and commercial use</h2>
<ul>
<li><strong>Evaluation is free.</strong> You may download and run the tools to evaluate them for your own internal, non-commercial assessment, including on representative copies of your files.</li>
<li><strong>Commercial use requires a valid license key</strong> purchased through Polar: one non-transferable seat per key, for internal business use. Each download's <code>LICENSE.txt</code> is the controlling license text; these terms summarize it.</li>
<li>The OJS Galley Studio companion scripts are additionally offered under <strong>GPL-3.0</strong> as stated in their license file; the commercial license covers the packaged product, support and updates.</li>
</ul>
<h2>What the tools do and do not do</h2>
<ul>
<li>They serialize, consolidate and compare <strong>what you supplied</strong>, and attach source addresses and checksums so a reviewer can verify the output.</li>
<li>They do <strong>not</strong> make accounting postings, tax decisions, grading decisions, typesetting judgments or legal determinations. A qualified person at your organization approves the result.</li>
<li>Capabilities are verified on synthetic and public fixtures; the version ranges stated on each product page are the versions actually tested. Your real inputs may differ — evaluate first.</li>
</ul>
<h2>Availability, support and changes</h2>
<ul>
<li>Support is best-effort email to <a href="mailto:{SUPPORT}">{SUPPORT}</a> for licensed customers.</li>
<li>Subscriptions renew until cancelled through Polar's customer portal; annual licenses renew annually. Prices are those shown at checkout.</li>
<li>We may update the tools and these terms; material changes to licensed functionality will be noted in the product README.</li>
</ul>
<h2>Warranty and liability</h2>
<p>The tools are provided "as is" without warranty of any kind, to the maximum extent permitted by law. Our aggregate liability arising from the tools is limited to the amount you paid for the license in the twelve months preceding the claim. Nothing here limits rights you have under mandatory consumer law or Polar's buyer terms.</p>
<div class="note">Last updated {TODAY}. The license file inside each download controls over this summary where they differ.</div>
{cta_row()}
""")

# ---------------------------------------------------------------- post-checkout
emit("thanks.html", "Thank you — Sync Sanctuary", "Your Sync Sanctuary license is on its way. Next steps after checkout.", """
<p class="kicker">Order received</p>
<h1>Thank you — your license is on its way.</h1>
<p class="lede">Polar has processed your payment and will email your <strong>license key</strong> and receipt to the address you entered at checkout. Delivery is usually immediate.</p>
<div class="card">
<h3>Next steps</h3>
<ol>
<li><strong>Check your email</strong> for the Polar receipt and license key (also check spam).</li>
<li><strong>Download the tool</strong> below if you have not already, and follow its README to activate the key.</li>
<li><strong>Manage billing</strong> — invoices with your company name and VAT ID, cancellation and payment method — through the Polar customer portal link in your receipt email.</li>
<li><strong>Need help?</strong> Reply to the receipt email or write to <a href="mailto:support@trimprocure.com">support@trimprocure.com</a> with your order reference.</li>
</ol>
<p class="note">Order reference: <code id="ref">not provided</code></p>
</div>
<h2>Downloads</h2>
<p>
<a class="cta" href="./tools/ojs-galley-studio.zip">OJS Galley Studio (.zip)</a>
<a class="cta" href="./tools/ledger/index.html">Fulfillment Ledger (open/save)</a>
<a class="cta" href="./tools/moodle/index.html">Moodle Release Pack (open/save)</a>
</p>
<p class="note">Evaluation downloads are free; the license key you receive unlocks commercial use. Files you process never leave your device.</p>
<script>
(function(){
  var id = new URLSearchParams(location.search).get("checkout_id");
  if (id) { document.getElementById("ref").textContent = id; }
})();
</script>
""")

# ---------------------------------------------------------------- procurement
emit("procurement.html", "Procurement one-pager — Moodle Assessment Release Pack", "Institutional purchasing information for the Moodle Assessment Release Pack: price, verification, PO and invoice path.", f"""
<p class="kicker">For institutions · print-friendly</p>
<h1>Moodle Assessment Release Pack</h1>
<p class="lede">A verified question-bank handoff for Moodle: merges previously exported Moodle XML banks into one import file plus a per-question receipt — category, stable id, source line and SHA-256 — so a reviewer can spot-check before importing.</p>
<div class="card">
<h3>At a glance</h3>
<div class="scroll"><table>
<tr><th>Item</th><th>Detail</th></tr>
<tr><td>Price</td><td class="num">USD 499 / year, organization license</td></tr>
<tr><td>License</td><td>One non-transferable commercial seat per key; evaluation free</td></tr>
<tr><td>Verified Moodle versions</td><td>4.5.16 LTS, 5.2.5, 5.3.1 (native import + round-trip, teacher/student permissions)</td></tr>
<tr><td>Question types</td><td>multichoice, truefalse, shortanswer, numerical, essay, cloze; embedded files preserved</td></tr>
<tr><td>Data handling</td><td>Runs locally in the browser; question banks are never uploaded</td></tr>
<tr><td>Merchant of record</td><td>Polar — handles tax, receipts and invoices</td></tr>
<tr><td>Support</td><td>Email <a href="mailto:{SUPPORT}">{SUPPORT}</a> (best-effort, licensed customers)</td></tr>
<tr><td>Renewal</td><td>Annual; reminder outreach 60 days before anniversary</td></tr>
</table></div>
</div>
<h2>Purchase order and invoice path</h2>
<ol>
<li><strong>Quote:</strong> email <a href="mailto:{SUPPORT}?subject=Quote%20request%20—%20Moodle%20Assessment%20Release%20Pack">{SUPPORT}</a> with your institution name, billing contact and quantity; we return a formal quote.</li>
<li><strong>Vendor forms:</strong> W-9 / vendor-registration / security questionnaires — request by email; we complete and return them.</li>
<li><strong>Payment:</strong> card checkout via Polar (link provided on the quote). Polar is merchant of record and calculates applicable tax.</li>
<li><strong>Invoice:</strong> a tax invoice with your company/institution name and VAT or tax ID is self-served from the Polar customer portal linked in the receipt email — suitable for finance reimbursement.</li>
<li><strong>Delivery:</strong> license key by email immediately after payment; tool download and README included.</li>
</ol>
<h2>What it does not do</h2>
<p>It does not author questions, assign grades, or decide import approval. Grading, content and pedagogical decisions remain the institution's. Duplicate question ids within a category are rejected rather than silently merged.</p>
<h2>Evaluation before purchase</h2>
<p>A free evaluation download and a live browser demo are available at <a href="https://rhemahq.com">rhemahq.com</a>. Run a representative exported bank through it before raising a PO.</p>
<div class="note">Sync Sanctuary · rhemahq.com · {TODAY}. Purchases governed by Polar buyer terms; product license in the download's LICENSE.txt.</div>
""")

# ---------------------------------------------------------------- services
emit("services.html", "Done-for-you handoffs — Sync Sanctuary", "Fixed-scope done-for-you reconciliation and release services, with the same source receipts as the tools.", f"""
<p class="kicker">Services</p>
<h1>Done-for-you, <em>same receipts.</em></h1>
<p class="lede">If you would rather hand us the files than run the tool yourself, we offer three fixed-scope engagements. Each returns the finished artifact <strong>plus the source receipt</strong> — original file, worksheet or line, and SHA-256 per row — exactly as the tools produce.</p>
<div class="card">
<h3>Fulfillment close pack — USD 120</h3>
<p>Up to 12 invoice files / 6,000 billed rows from any 3PL (CSV or XLSX). Returns one reconciliation workbook: fee rollup by provider, month, currency and label, plus a source-reference sheet. Turnaround: 2 business days after we receive the files.</p>
</div>
<div class="card">
<h3>Journal galley pack — USD 200 per article</h3>
<p>One accepted Word manuscript plus metadata. Returns two-column PDF, standalone HTML and DTD-valid JATS Publishing 1.2 XML, registered as galleys on your OJS 3.5 submission (or delivered as files for your production editor). Turnaround: 3 business days. Complex layouts are flagged for editor review, not silently approximated.</p>
</div>
<div class="card">
<h3>Moodle bank release — USD 250</h3>
<p>Up to 10 exported Moodle XML banks / 500 questions. Returns one merged import file, counts per category, and a per-question receipt (category, id, source line, checksum). Duplicate ids are rejected and reported. Turnaround: 2 business days.</p>
</div>
<h2>How it works</h2>
<ol>
<li>Email <a href="mailto:{SUPPORT}?subject=Service%20engagement">{SUPPORT}</a> with the scope above and your file counts.</li>
<li>We confirm scope and a fixed price in writing before any work. You authorize us to process the files you send.</li>
<li>Payment via Polar (merchant of record); invoice with your institution/company details available in the customer portal.</li>
<li>Each engagement includes a license key for the corresponding tool, valid for the engagement plus 30 days, so your team can re-run or extend the work in-house.</li>
</ol>
<h2>Limits we keep</h2>
<p>We do not make accounting postings, tax filings, grading decisions or editorial judgments. We serialize and tie out what you supplied; your qualified staff approve the result. Files are handled only for the engagement and deleted on request.</p>
<div class="note">Service capacity is limited (a handful of engagements per month). If the queue is full we will say so and offer the self-serve tool instead.</div>
{cta_row()}
""")

# ---------------------------------------------------------------- guides
GUIDES = [
    ("moodle-merge-multiple-xml.html", "Import multiple XML files into a Moodle question bank",
     "Step-by-step: merge several exported Moodle XML question banks into one import without losing categories, ids or embedded files.",
     "How to import multiple Moodle XML question banks into one bank — categories, duplicate ids, embedded files, and a verification receipt.", """
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
<p>The <strong>Moodle Release Pack</strong> does the merge, the duplicate rejection and the receipt in your browser — nothing uploaded. Free evaluation; commercial use via a Polar license key. Verified by native import and round-trip on Moodle 4.5.16 LTS, 5.2.5 and 5.3.1, including cloze subquestions, embedded files and teacher/student import permissions.</p>
<p><a class="cta solid" href="../#demos">Run the free demo</a><a class="cta" href="../tools/moodle/index.html">Open / save the tool</a><a class="cta" href="../procurement.html">Procurement one-pager</a></p>
</div>
<h2>Limits</h2>
<p>The merge preserves what you supplied; it does not author, regrade or approve questions. Import capability still depends on your role (editing teacher or above). The free WordTable plugin covers Word-table input but its published support stops at Moodle 5.0; native XML merge is a different job.</p>
<p class="note">Sources: Moodle docs <a href="https://docs.moodle.org/en/Import_questions">Import questions</a> and <a href="https://docs.moodle.org/en/Moodle_XML_format">Moodle XML format</a>; version verification performed 2026-11-21 on disposable native installations. Accessed {TODAY}.</p>
"""),
    ("moodle-import-verification.html", "Verify a Moodle question import: counts, categories, checksums",
     "A repeatable spot-check procedure for Moodle question-bank imports: per-category counts, duplicate ids, cloze subquestions, embedded files and a SHA-256 receipt.",
     "How to verify a Moodle question bank import actually preserved every question, category, cloze field and embedded file — with a checksum receipt.", """
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
<p>The <strong>Moodle Release Pack</strong> emits the merged import file and this receipt together, rejects duplicate <code>(category, id)</code> pairs, and preserves embedded files. The identical contract was verified natively on Moodle 4.5.16 LTS, 5.2.5 and 5.3.1: seven questions, six types, category split, cloze fields, four embedded attachments, teacher import and student denial.</p>
<p><a class="cta solid" href="../#demos">Run the free demo</a><a class="cta" href="../tools/moodle/index.html">Open / save the tool</a></p>
</div>
<h2>Limits</h2>
<p>Verification proves the bytes and settings you supplied survived. It does not prove the questions are pedagogically sound, correctly keyed, or approved for release — those remain the institution's decisions.</p>
<p class="note">Sources: Moodle docs <a href="https://docs.moodle.org/en/Import_questions">Import questions</a>, <a href="https://docs.moodle.org/en/Export_questions">Export questions</a>; native contract checks 2026-11-21. Accessed {TODAY}.</p>
"""),
    ("fulfyld-bdr-reconciliation.html", "Reconcile Fulfyld Billing Detail Reports (BDR) in a workbook",
     "The Fulfyld BDR CSV export, field by field, and how to tie every billed row back to its original file, worksheet and line in one reconciliation workbook.",
     "Fulfyld Billing Detail Report (BDR) CSV fields, download path, and a source-row reconciliation workflow for 3PL finance ops.", """
<p class="kicker">Guide · 3PL finance ops</p>
<h1>Reconcile Fulfyld Billing Detail Reports without losing the source row</h1>
<p class="lede">Fulfyld publishes an itemized <strong>Billing Detail Report (BDR)</strong> per invoice. It is the right input for a tie-out — but only if every billed row keeps its original address, so a disputed line can be re-opened in the exact file it came from.</p>
<h2>Getting the export</h2>
<p>Fulfyld's billing guide describes itemized fee exports and provides a <strong>CSV attachment per invoice</strong> (delivered via Invoiced). The published example includes a service-type filter (<code>Charge_Category__c</code> in their example), so confirm the exact fee-label column in your own export before automating anything.</p>
<h2>Fields that matter for a tie-out</h2>
<div class="scroll"><table>
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
<li><strong>Keep a source-reference sheet:</strong> for every billed row, the original file, worksheet (or CSV line), row address, label, total, and a SHA-256 of the source file. This is what makes a credit dispute fast: you hand the provider the exact line, not a screenshot.</li>
<li><strong>Review exceptions</strong> — labels that changed wording mid-period, currencies mixed in one invoice, credits without a matching charge. The workbook surfaces them; a human decides.</li>
</ol>
<h2>What this is not</h2>
<p>A consolidation and evidence workbook is <strong>not</strong> an error detector and not a ledger posting. It does not decide that a charge is wrong; it makes every charge re-openable. Published "3–15% billing leakage" figures in this market are vendor-reported — WareAudit's own site notes no independent study exists — so treat any error-rate claim, including ours if we ever made one, as marketing until measured on your own bills.</p>
<div class="card">
<h3>Do it with the tool</h3>
<p>The <strong>Fulfillment Ledger</strong> reads any 3PL's CSV/XLSX exports (Fulfyld BDR included), builds both sheets in your browser, and never uploads a file. No API token, no Shopify install. Free evaluation; commercial use via a Polar license key at $49/month.</p>
<p><a class="cta solid" href="../#demos">Run the free demo</a><a class="cta" href="../tools/ledger/index.html">Open / save the tool</a><a class="cta" href="./3pl-reconciliation-comparison.html">Compare the options</a></p>
</div>
<p class="note">Source: <a href="https://www.fulfyld.com/docs/download-review-excel-billing-detail-reports/">Fulfyld — download &amp; review Excel billing detail reports</a> (opened 2026-11-22). Exact fee-label column to be confirmed against a customer-authorized export. Accessed {TODAY}.</p>
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
<li><strong>Validate JATS</strong> against the official Publishing 1.2 MathML2 DTD. A galley that fails DTD validation will fail downstream indexing — validate before upload, not after.</li>
<li><strong>HTML → PDF</strong> with a paged-media renderer (a headless browser print pipeline works; commercial engines like PrinceXML offer PDF/UA). Two-column layout, running heads, figure placement.</li>
<li><strong>Register</strong> the three files on the submission via OJS's galley repositories (or the UI), associate figures as dependent files, and verify stored checksums match the originals.</li>
</ol>
<div class="card">
<h3>Verified, not asserted</h3>
<p>This pipeline was executed end-to-end on a disposable <strong>OJS 3.5.0.4</strong> installation: a generated DOCX produced PDF, HTML and JATS; the JATS passed the official Publishing 1.2 MathML2 DTD; all three galleys registered natively on one draft with the PNG associated as a dependent file; MIME types matched and all four files matched their original SHA-256 in OJS private storage.</p>
<p><a class="cta solid" href="../tools/ojs-galley-studio.zip">Download the evaluation zip</a><a class="cta" href="../#get">License and pricing</a></p>
</div>
<h2>Honest limits</h2>
<ul>
<li><strong>Complex layouts need an editor.</strong> Free DOCX→JATS converters (including the OJS <code>docxConverter</code> plugin) handle simple articles; a journal editor in the PKP forum reports their journal was "too complex for it". Multi-column figures, custom floats and heavy math still need review.</li>
<li><strong>JATS display is a separate problem.</strong> Producing valid JATS does not give you a working in-OJS viewer; plan for the viewer maintenance risk.</li>
<li><strong>Native production is coming.</strong> PKP's lead has stated OJS will integrate an OS-APS/SciFlow-derived editor with in-browser HTML→PDF (Vivliostyle), targeted at 3.6, with DOCX import still at pilot stage as of late 2025. JATS export is not in that stated plan. Watch the 3.6 release notes before assuming any external tool is permanently necessary.</li>
<li><strong>Version drift.</strong> Our native verification ran on 3.5.0.4; 3.5.0-6 is current. Re-run the fixture on your exact version before relying on it.</li>
</ul>
<h2>When a subscription beats per-article</h2>
<p>Per-article services run $5–$49/article in the current market. A $59/month local pipeline breaks even against a $25/article service at roughly 3 articles/month, and against $25/article at ~29 articles/year if you only need XML — the three-format bundle plus local, editable source is what changes the math for a journal producing ~40 articles/year.</p>
<p class="note">Sources: <a href="https://docs.pkp.sfu.ca/learning-ojs/en/production">PKP production guide</a>; <a href="https://public.nlm.nih.gov/projects/jats/publishing/1.2/">JATS Publishing 1.2 DTD</a>; <a href="https://forum.pkp.sfu.ca/t/info-on-tech-stack-behind-new-article-production-in-ojs-3-5-3-6/97196">PKP forum thread 97196</a> (staff statements, Oct 2025); <a href="https://pkp.sfu.ca/software/ojs/download/">OJS download page</a> (3.5.0-6, Nov 2026). Accessed {TODAY}.</p>
"""),
    ("3pl-reconciliation-comparison.html", "3PL billing reconciliation options compared (2026)",
     "An honest comparison of Cartwright Labs ShipBob Billing Reconciler, WareAudit, SKU.io and the Fulfillment Ledger workbook: price, inputs, hosting, evidence.",
     "Compare 3PL invoice reconciliation tools in 2026: Cartwright Labs, WareAudit, SKU.io and an offline workbook — prices, inputs, hosting and source evidence.", """
<p class="kicker">Guide · 3PL finance ops</p>
<h1>3PL billing reconciliation: four options, honestly compared</h1>
<p class="lede">Prices and scopes below were read from vendor pages on 2026-11-22. They change; check before you buy. We sell one of these options, so read the "what it does not do" column first.</p>
<div class="scroll"><table>
<tr><th>Option</th><th>Price (as read)</th><th>Inputs</th><th>Hosting</th><th>Evidence per finding</th></tr>
<tr><td><strong>Cartwright Labs — ShipBob Billing Reconciler</strong></td><td class="num">$49/mo from run 3; first two runs free; billed via Shopify</td><td>Shopify orders/fulfillments/refunds ↔ ShipBob shipments/billing, via API install + token</td><td>Hosted app</td><td>Findings list, 8 checks over 7/14/30-day windows; sample PDF</td></tr>
<tr><td><strong>WareAudit</strong></td><td class="num">$149/mo Starter (≤3,000 orders); $299 one-off (3 months of bills); ~10% annual discount</td><td>Any-3PL CSV upload</td><td>Hosted</td><td>Findings reports; evidence column labeled provider Line ID</td></tr>
<tr><td><strong>SKU.io</strong></td><td class="num">from $1,000/mo</td><td>Synced ShipBob bills (account connection)</td><td>Hosted</td><td>Groups by original fee name, count, total; export omits original file/worksheet/row</td></tr>
<tr><td><strong>Fulfillment Ledger (ours)</strong></td><td class="num">$49/mo</td><td>Any 3PL CSV/XLSX you already hold</td><td><strong>Local browser; nothing uploaded</strong></td><td>Per-row original file, worksheet/line, SHA-256 of source; rollup + source-reference sheets</td></tr>
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
<p><a class="cta solid" href="../#demos">Run the free demo</a><a class="cta" href="../tools/ledger/index.html">Open / save the tool</a><a class="cta" href="./fulfyld-bdr-reconciliation.html">Fulfyld BDR guide</a></p>
</div>
<p class="note">Sources opened 2026-11-22: <a href="https://www.cartwrightlabs.com/shipbob-billing-audit/">cartwrightlabs.com</a>, <a href="https://wareaudit.com/">wareaudit.com</a>, <a href="https://www.sku.io/pricing/">sku.io/pricing</a>. Cartwright was in private pilot at reading time. Accessed {TODAY}.</p>
"""),
]

for rel, title, desc, meta, body in GUIDES:
    emit("guides/" + rel, title + " — Sync Sanctuary", meta, body)

emit("guides/index.html", "Guides — Sync Sanctuary",
     "Practical, source-cited guides for Moodle question-bank handoffs, OJS galley production and 3PL invoice reconciliation.", """
<p class="kicker">Guides</p>
<h1>Guides for the <em>handoff</em>.</h1>
<p class="lede">Practical procedures for the three jobs our tools serve — written to be useful even if you never buy anything. Each cites its sources and states its limits.</p>
<ul class="guide-list">
<li><a href="./moodle-merge-multiple-xml.html">Import multiple XML files into a Moodle question bank</a><p>Categories, duplicate ids, embedded files, and the merged-file path with a receipt.</p></li>
<li><a href="./moodle-import-verification.html">Verify a Moodle question import, line by line</a><p>Per-category counts, cloze subquestions, embedded-file hashes, permission checks.</p></li>
<li><a href="./fulfyld-bdr-reconciliation.html">Reconcile Fulfyld Billing Detail Reports</a><p>The BDR CSV field by field, and a tie-out that keeps every row's original address.</p></li>
<li><a href="./ojs-35-galley-production.html">OJS 3.5 galley production: Word → PDF + HTML + JATS</a><p>The native add-galley workflow, DTD validation, and the 3.6 roadmap watch.</p></li>
<li><a href="./3pl-reconciliation-comparison.html">3PL billing reconciliation: four options compared</a><p>Cartwright, WareAudit, SKU.io and the offline workbook — prices, inputs, evidence, limits.</p></li>
</ul>
""" + cta_row("../"))

# ---------------------------------------------------------------- sitemap / robots
pages = ["index.html"] + EMITTED
urls = "\n".join(
    f"  <url><loc>{BASE}/{p}</loc><lastmod>{TODAY}</lastmod></url>" for p in pages
)
(SITE / "sitemap.xml").write_text(
    '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    + urls + "\n</urlset>\n", encoding="utf-8")
(SITE / "robots.txt").write_text(
    f"User-agent: *\nAllow: /\nSitemap: {BASE}/sitemap.xml\n", encoding="utf-8")
(SITE / "assets").mkdir(parents=True, exist_ok=True)
(SITE / "assets" / "page.css").write_text(CSS, encoding="utf-8")

print("emitted:", len(EMITTED), "pages + assets/page.css + sitemap.xml + robots.txt")
for p in EMITTED:
    print(" ", p)
