(() => {
  // src/lib/file-integrity.js
  var encoder = new TextEncoder();
  async function sha256Hex(input) {
    const bytes = typeof input === "string" ? encoder.encode(input) : input;
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  // src/lib/markup.js
  function escapeXml(value) {
    return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  }

  // src/domain/learning/release.js
  var MOODLE_COURSE_ROOT = "$course$/top/";
  async function buildMoodleRelease(questions) {
    const seen = /* @__PURE__ */ new Set();
    const counts = /* @__PURE__ */ new Map();
    const receipt = [];
    const parts = ['<?xml version="1.0" encoding="UTF-8"?>', "<quiz>"];
    let lastCategory;
    for (const question of questions) {
      const path = question.categoryPath ?? MOODLE_COURSE_ROOT + question.category;
      const key = JSON.stringify([path, question.id]);
      if (seen.has(key)) throw new Error("Duplicate question id " + question.id + " in category " + question.category);
      seen.add(key);
      if (path !== lastCategory) {
        parts.push('  <question type="category"><category><text>' + escapeXml(path) + "</text></category></question>");
        lastCategory = path;
      }
      parts.push(question.xml);
      counts.set(question.category, (counts.get(question.category) ?? 0) + 1);
      receipt.push({
        source: question.source,
        category: question.category,
        id: question.id,
        type: question.type,
        line: question.line,
        checksum: await sha256Hex(question.xml)
      });
    }
    parts.push("</quiz>");
    return { importXml: parts.join("\n"), receipt, counts: Object.fromEntries(counts) };
  }

  // src/infrastructure/learning/question-bank.js
  function questionLines(xml) {
    const tokens = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>|<\/?([^\s/>]+)(?:[^"'<>]|"[^"]*"|'[^']*')*>/g;
    const breaks = /\r\n|\n|\r/g;
    const lines = [];
    let line = 1;
    let depth = 0;
    let offset = 0;
    for (const match of xml.matchAll(tokens)) {
      const [tag, name] = match;
      line += (xml.slice(offset, match.index).match(breaks) ?? []).length;
      if (name) {
        if (tag.startsWith("</")) {
          depth -= 1;
        } else {
          if (depth === 1 && name === "question") lines.push(line);
          if (!tag.endsWith("/>")) depth += 1;
        }
      }
      line += (tag.match(breaks) ?? []).length;
      offset = match.index + tag.length;
    }
    return lines;
  }
  function readMoodle(xml, source) {
    const document2 = new DOMParser().parseFromString(xml, "application/xml");
    const quiz = document2.documentElement;
    if (quiz.tagName !== "quiz" || document2.doctype || document2.querySelector("parsererror")) {
      throw new Error("choose a well-formed Moodle XML export with a quiz root");
    }
    const questions = Array.from(quiz.children).filter((node) => node.tagName === "question");
    const lines = questionLines(xml);
    if (lines.length !== questions.length) throw new Error("could not locate every question in the source XML");
    const serializer = new XMLSerializer();
    const rows = [];
    let categoryPath = MOODLE_COURSE_ROOT + "default";
    for (const [index, node] of questions.entries()) {
      const type = node.getAttribute("type");
      if (type === "category") {
        categoryPath = node.querySelector("category > text")?.textContent.trim() || categoryPath;
        continue;
      }
      if (!type) throw new Error("question on line " + lines[index] + " is missing a type");
      const id = node.querySelector("idnumber")?.textContent.trim() || node.querySelector("name > text")?.textContent.trim() || "q-" + (index + 1);
      rows.push({
        source,
        categoryPath,
        category: categoryPath.startsWith(MOODLE_COURSE_ROOT) ? categoryPath.slice(MOODLE_COURSE_ROOT.length) : categoryPath,
        id,
        type,
        line: lines[index],
        xml: "  " + serializer.serializeToString(node)
      });
    }
    if (!rows.length) throw new Error("no Moodle questions found");
    return rows;
  }
  function moodleReceiptCsv(receipt) {
    const columns = ["source", "category", "id", "type", "line", "checksum"];
    const cell = (value) => {
      const text = String(value ?? "");
      const safe = typeof value === "string" && /^[\s\uFEFF]*[=+\-@]/.test(text) ? "'" + text : text;
      return '"' + safe.replaceAll('"', '""') + '"';
    };
    return [columns.join(","), ...receipt.map((row) => columns.map((column) => cell(row[column])).join(","))].join("\r\n");
  }

  // src/workbench.js
  function renderTable(element, { title, columns, rows }) {
    const previewLimit = 100;
    const headings = columns.map((column) => "<th scope='col'>" + escapeXml(column) + "</th>").join("");
    const body = rows.slice(0, previewLimit).map((row) => {
      const cells = row.map((cell) => {
        const className = typeof cell === "number" ? " class='num'" : "";
        return "<td" + className + ">" + escapeXml(cell ?? "—") + "</td>";
      }).join("");
      return "<tr>" + cells + "</tr>";
    }).join("");
    const labelId = element.id + "-title";
    const limit = rows.length > previewLimit ? "<p class='bench-hint'>Preview shows 100 of " + rows.length + " rows. Download for the full result.</p>" : "";
    element.innerHTML = "<h5 id='" + labelId + "'>" + title + "</h5><div class='bench-table-wrap' role='region' aria-labelledby='" + labelId + "' tabindex='0'><table class='bench-table' aria-labelledby='" + labelId + "'><thead><tr>" + headings + "</tr></thead><tbody>" + body + "</tbody></table></div>" + limit;
  }
  function wireWorkbench(root, config) {
    const find = (selector) => root.querySelector(selector);
    const sample = find("[data-sample]");
    const files = find("[data-files]");
    const build = find("[data-build]");
    const download = find("[data-download]");
    const downloadReceipt = find("[data-export-receipt]");
    const clear = find("[data-clear]");
    const status = find("[data-status]");
    const results = find("[data-results]");
    const empty = find("[data-empty]");
    const summary = find("[data-summary]");
    const receipt = find("[data-receipt-table]");
    const canAppend = root.hasAttribute("data-append");
    let input = [];
    let output;
    let revision = 0;
    function showStatus(message = "", kind = "") {
      status.textContent = message;
      status.dataset.kind = kind;
    }
    function busy(active) {
      sample.disabled = active;
      files.disabled = active;
      build.disabled = active || input.length === 0;
      root.setAttribute("aria-busy", String(active));
    }
    function resetOutput() {
      output = void 0;
      results.hidden = true;
      empty.hidden = false;
      summary.replaceChildren();
      receipt.replaceChildren();
      download.disabled = true;
      if (downloadReceipt) downloadReceipt.disabled = true;
    }
    async function loadInput(loader, append, progress, source) {
      const current = ++revision;
      if (!append) input = [];
      resetOutput();
      busy(true);
      showStatus(progress);
      try {
        const loaded = await loader(() => current === revision);
        if (current !== revision) return;
        input = append ? input.concat(loaded) : loaded;
        showStatus(input.length + " " + config.inputName + " ready" + source + ".", "success");
      } catch (error) {
        if (current !== revision) return;
        const retained = input.length ? " The previous inputs are still available." : "";
        showStatus(error.message + retained, "error");
      } finally {
        if (current === revision) busy(false);
      }
    }
    sample.addEventListener("click", () => loadInput(config.sample, false, "Loading the sample…", " from the sample"));
    files.addEventListener("change", () => {
      const selected = Array.from(files.files);
      files.value = "";
      if (!selected.length) return;
      loadInput(async (isCurrent) => {
        const batch = [];
        for (const file of selected) {
          if (!isCurrent()) break;
          try {
            batch.push(await config.read(file, isCurrent));
          } catch (error) {
            throw new Error(file.name + ": " + error.message);
          }
        }
        return batch.flat();
      }, canAppend, "Reading " + selected.length + " " + (selected.length === 1 ? "file…" : "files…"), "");
    });
    build.addEventListener("click", async () => {
      const current = ++revision;
      resetOutput();
      busy(true);
      showStatus("Building the result…");
      try {
        const built = await config.build(input);
        if (current !== revision) return;
        renderTable(summary, config.summary(built));
        renderTable(receipt, config.receipt(built));
        output = built;
        results.hidden = false;
        empty.hidden = true;
        download.disabled = false;
        if (downloadReceipt) downloadReceipt.disabled = false;
        showStatus(config.describe(output), "success");
      } catch (error) {
        if (current === revision) showStatus(error.message, "error");
      } finally {
        if (current === revision) busy(false);
      }
    });
    download.addEventListener("click", () => config.download(output));
    downloadReceipt?.addEventListener("click", () => config.receiptDownload(output));
    clear?.addEventListener("click", () => {
      revision += 1;
      input = [];
      files.value = "";
      resetOutput();
      busy(false);
      showStatus("Inputs cleared.");
    });
    if (!globalThis.crypto?.subtle || config.available?.() === false) {
      busy(true);
      showStatus("This browser could not load the file tools. Open the tool in a current browser over HTTPS or from the offline download.", "error");
    }
  }

  // src/features/learning/sample.js
  var MOODLE_SAMPLE = [
    { source: "synthetic-sample.xml", category: "Release pack / demo", id: "q-101", type: "multichoice", line: 4, xml: '  <question type="multichoice"><idnumber>q-101</idnumber><name><text>Capital of France</text></name><questiontext format="html"><text>What is the capital of France?</text></questiontext><answer fraction="100"><text>Paris</text></answer><answer fraction="0"><text>Lyon</text></answer></question>' },
    { source: "synthetic-sample.xml", category: "Release pack / demo", id: "q-102", type: "truefalse", line: 5, xml: '  <question type="truefalse"><idnumber>q-102</idnumber><name><text>Water boils at 100C at sea level</text></name><questiontext format="html"><text>Water boils at 100C at sea level.</text></questiontext><answer fraction="100"><text>true</text></answer><answer fraction="0"><text>false</text></answer></question>' },
    { source: "synthetic-sample.xml", category: "Release pack / cloze", id: "q-201", type: "cloze", line: 7, xml: '  <question type="cloze"><idnumber>q-201</idnumber><name><text>Fill the blanks</text></name><questiontext format="html"><text>The capital of France is {1:SHORTANSWER:=Paris} and it sits on the {1:SHORTANSWER:=Seine}.</text></questiontext></question>' }
  ];

  // src/features/learning/workbench.js
  function saveText(filename, contents, type) {
    const url = URL.createObjectURL(new Blob([contents], { type }));
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1e3);
  }
  var moodle = {
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
      rows: output.receipt.map((row) => [row.source, row.category, row.id, row.type, row.line, row.checksum.slice(0, 12) + "…"])
    })
  };
  document.querySelectorAll('[data-workbench="moodle"]').forEach((root) => wireWorkbench(root, moodle));
})();
