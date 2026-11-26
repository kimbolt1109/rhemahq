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
  function questionNodes(xml, strict = false) {
    const document2 = new DOMParser().parseFromString(xml, "application/xml");
    const quiz = document2.documentElement;
    if (quiz.tagName !== "quiz" || document2.doctype || document2.querySelector("parsererror")) {
      throw new Error("choose a well-formed Moodle XML export with a quiz root");
    }
    const questions = Array.from(quiz.children).filter((node) => node.tagName === "question");
    if (strict && (quiz.namespaceURI || questions.length !== quiz.children.length)) {
      throw new Error("the quiz root must contain only Moodle XML question records");
    }
    const lines = questionLines(xml);
    if (lines.length !== questions.length) throw new Error("could not locate every question in the source XML");
    return questions.map((node, index) => ({ node, line: lines[index], index }));
  }
  function readMoodle(xml, source) {
    const serializer = new XMLSerializer();
    const rows = [];
    let categoryPath = MOODLE_COURSE_ROOT + "default";
    for (const { node, line, index } of questionNodes(xml)) {
      const type = node.getAttribute("type");
      if (type === "category") {
        categoryPath = node.querySelector("category > text")?.textContent.trim() || categoryPath;
        continue;
      }
      if (!type) throw new Error("question on line " + line + " is missing a type");
      const id = node.querySelector("idnumber")?.textContent.trim() || node.querySelector("name > text")?.textContent.trim() || "q-" + (index + 1);
      rows.push({
        source,
        categoryPath,
        category: categoryPath.startsWith(MOODLE_COURSE_ROOT) ? categoryPath.slice(MOODLE_COURSE_ROOT.length) : categoryPath,
        id,
        type,
        line,
        xml: "  " + serializer.serializeToString(node)
      });
    }
    if (!rows.length) throw new Error("no Moodle questions found");
    return rows;
  }
  var types = {
    multichoice: ["single", "shuffleanswers", "answernumbering", "showstandardinstruction", "shownumcorrect"],
    shortanswer: ["usecase"],
    truefalse: []
  };
  var feedbackFields = ["correctfeedback", "partiallycorrectfeedback", "incorrectfeedback"];
  var textFormats = /* @__PURE__ */ new Set(["html", "plain_text", "markdown", "moodle_auto_format"]);
  var mediaText = /@@PLUGINFILE@@|<(?:img|picture|audio|video|source|object|embed|iframe|svg)\b/i;
  function onlyChild(element, name) {
    const found = Array.from(element.children).filter((child) => child.tagName === name && !child.namespaceURI);
    return found.length === 1 ? found[0] : void 0;
  }
  function scalar(element) {
    return element && !element.children.length && !element.attributes.length ? element.textContent.trim() : void 0;
  }
  function reviewText(element, label, defaultFormat = "html", required = false) {
    if (!element) {
      if (required) throw new Error(label + " is missing");
      return null;
    }
    const text = onlyChild(element, "text");
    const format = element.getAttribute("format") ?? defaultFormat;
    const isAnswer = element.tagName === "answer";
    const unknownElement = Array.from(element.children).some(({ tagName }) => tagName !== "text" && !(isAnswer && tagName === "feedback"));
    const unknownAttribute = element.getAttributeNames().some((name) => name !== "format" && !(isAnswer && name === "fraction"));
    if (!text || unknownElement || unknownAttribute || text.children.length || text.attributes.length || mediaText.test(text.textContent)) {
      throw new Error(label + " contains media or unsupported text markup");
    }
    if (format && !textFormats.has(format)) throw new Error(label + " has an unsupported text format");
    if (!text.textContent.trim()) {
      if (required) throw new Error(label + " is empty");
      return null;
    }
    return [format, text.textContent];
  }
  function reviewDecimal(text, label) {
    const value = /^([+-]?)(\d+)(?:\.(\d+))?$/.exec(text);
    if (!value) throw new Error(label + " is not a decimal value");
    const whole = value[2].replace(/^0+(?=\d)/, "");
    const fraction = (value[3] ?? "").replace(/0+$/, "");
    const sign = value[1] === "-" && (whole !== "0" || fraction) ? "-" : "";
    return sign + whole + (fraction ? "." + fraction : "");
  }
  function uniqueFields(node, allowed, repeatable = "") {
    const fields = /* @__PURE__ */ new Map();
    for (const child of node.children) {
      const name = child.tagName;
      if (name === repeatable && !child.namespaceURI) continue;
      if (!allowed.includes(name) || child.namespaceURI || fields.has(name)) throw new Error("Unexpected or repeated XML field: " + name);
      fields.set(name, child);
    }
    return fields;
  }
  function readQuestionContent(node, type) {
    if (!Object.hasOwn(types, type)) throw new Error(type ? "Content comparison is unavailable for this question type" : "Question type is missing");
    if (node.namespaceURI || node.attributes.length !== 1) throw new Error("Unsupported question attributes");
    if (node.querySelector("file, image, image_base64")) throw new Error("Embedded files and media require manual review");
    const options = ["defaultgrade", "penalty", "hidden", ...types[type]];
    const feedback = type === "multichoice" ? feedbackFields : [];
    const fields = uniqueFields(node, ["idnumber", "name", "questiontext", "generalfeedback", "tags", ...options, ...feedback], "answer");
    const optionValues = options.map((name) => {
      const element = fields.get(name);
      if (!element) return null;
      const value = scalar(element);
      if (value === void 0) throw new Error("Unsupported grading or display option: " + name);
      if (name === "defaultgrade" || name === "penalty") return reviewDecimal(value, name);
      if (["single", "shuffleanswers", "showstandardinstruction", "usecase"].includes(name)) {
        if (value === "1" || value === "true") return true;
        if (value === "0" || value === "false") return false;
        throw new Error("Unsupported grading or display option: " + name);
      }
      return value;
    });
    const prompt = reviewText(fields.get("questiontext"), "Question text", "html", true);
    const answers = Array.from(node.children).filter((child) => child.tagName === "answer").map((answer) => {
      const answerFields = uniqueFields(answer, ["text", "feedback"]);
      const format = type === "multichoice" ? prompt[0] : "plain_text";
      return [
        reviewText(answer, "Answer text", format, true),
        reviewDecimal(answer.getAttribute("fraction") ?? "0", "Answer fraction"),
        reviewText(answerFields.get("feedback"), "Answer feedback", prompt[0])
      ];
    });
    if (!answers.length) throw new Error("Question answers are missing");
    return {
      "Question name": reviewText(fields.get("name"), "Question name", null, true),
      "Question text": prompt,
      "Answers and answer feedback": answers,
      "Question feedback": [
        reviewText(fields.get("generalfeedback"), "General feedback", prompt[0]),
        ...feedback.map((name) => reviewText(fields.get(name), name, prompt[0]))
      ],
      "Grading and display options": optionValues
    };
  }
  async function readCampusReviewFile(file) {
    const bytes = await file.arrayBuffer();
    let xml;
    try {
      xml = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      throw new Error("save the Moodle XML export as UTF-8");
    }
    const rows = [];
    let categoryPath = null;
    for (const { node, line } of questionNodes(xml, true)) {
      const type = node.getAttribute("type") || null;
      if (type === "category") {
        const category = onlyChild(node, "category");
        categoryPath = category && scalar(onlyChild(category, "text")) || null;
        continue;
      }
      const id = scalar(onlyChild(node, "idnumber")) || null;
      const row = { categoryPath, id, type, line };
      if (categoryPath && id) {
        try {
          row.content = readQuestionContent(node, type);
        } catch (error) {
          row.unsupported = error.message;
        }
      }
      rows.push(row);
    }
    return { name: file.name, sha256: await sha256Hex(bytes), rows };
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

  // src/domain/learning/campus-review.js
  var matches = (expected, actual) => JSON.stringify(expected) === JSON.stringify(actual);
  function reference(row) {
    return row ? { type: row.type, line: row.line } : null;
  }
  function issue(expected, actual, details) {
    const { categoryPath, id } = expected ?? actual;
    return { categoryPath, id, expected: reference(expected), actual: reference(actual), details };
  }
  function indexRelease(rows, side, categories, unsupported) {
    const byId = /* @__PURE__ */ new Map();
    for (const row of rows) {
      const counts = categories.get(row.categoryPath) ?? { categoryPath: row.categoryPath, expected: 0, actual: 0 };
      counts[side] += 1;
      categories.set(row.categoryPath, counts);
      if (!row.categoryPath || !row.id) {
        const details = [!row.categoryPath && "Category path missing from export", !row.id && "Unique explicit ID missing from question"].filter(Boolean);
        unsupported.push(issue(side === "expected" ? row : null, side === "actual" ? row : null, details));
        continue;
      }
      const key = JSON.stringify([row.categoryPath, row.id]);
      const group = byId.get(key) ?? [];
      group.push(row);
      byId.set(key, group);
    }
    return byId;
  }
  function buildCampusReview(expected, actual, { runLabel, stagingVersion }) {
    const label = runLabel.trim();
    const version = stagingVersion.trim();
    if (!label || !version) throw new Error("Enter a run label and the staging Moodle version.");
    if (!expected.rows.length) throw new Error("The expected release must contain at least one question.");
    const categories = /* @__PURE__ */ new Map();
    const missing = [];
    const extra = [];
    const changed = [];
    const unsupported = [];
    const matched = [];
    const left = indexRelease(expected.rows, "expected", categories, unsupported);
    const right = indexRelease(actual.rows, "actual", categories, unsupported);
    const keys = /* @__PURE__ */ new Set([...left.keys(), ...right.keys()]);
    for (const key of [...keys].sort()) {
      const before = left.get(key) ?? [];
      const after = right.get(key) ?? [];
      const [source] = before;
      const [destination] = after;
      if (before.length > 1 || after.length > 1) {
        const details = ["Duplicate ID in category: " + before.length + " expected, " + after.length + " destination"];
        for (const row of before) unsupported.push(issue(row, null, details));
        for (const row of after) unsupported.push(issue(null, row, details));
      } else if (!destination) {
        missing.push(issue(source, null, ["ID absent from destination category"]));
      } else if (!source) {
        extra.push(issue(null, destination, ["ID absent from expected category"]));
      } else if (source.type && destination.type && source.type !== destination.type) {
        changed.push(issue(source, destination, ["Question type"]));
      } else if (source.unsupported || destination.unsupported) {
        const details = [
          source.unsupported && "Expected: " + source.unsupported,
          destination.unsupported && "Destination: " + destination.unsupported
        ].filter(Boolean);
        unsupported.push(issue(source, destination, details));
      } else {
        const fields = /* @__PURE__ */ new Set([...Object.keys(source.content), ...Object.keys(destination.content)]);
        const differences = [...fields].filter((field) => !matches(source.content[field], destination.content[field]));
        if (differences.length) changed.push(issue(source, destination, differences));
        else matched.push(issue(source, destination, []));
      }
    }
    const counts = {
      expected: expected.rows.length,
      actual: actual.rows.length,
      matched: matched.length,
      missing: missing.length,
      extra: extra.length,
      changed: changed.length,
      unsupported: unsupported.length
    };
    return {
      schema: "rhema.campus-review.v1",
      runLabel: label,
      stagingVersion: version,
      sources: {
        expected: { name: expected.name, sha256: expected.sha256 },
        actual: { name: actual.name, sha256: actual.sha256 }
      },
      outcome: counts.matched === counts.expected && counts.matched === counts.actual ? "matched" : "review_required",
      scope: "Compares exact category paths and explicit IDs. Checks selected text and grading fields for multiple choice, true/false and short answer. Review tags, media rendering and LMS behavior manually.",
      counts,
      categories: [...categories.keys()].sort().map((path) => categories.get(path)),
      matched,
      missing,
      extra,
      changed,
      unsupported
    };
  }

  // src/features/learning/campus-review.js
  var sections = [
    ["missing", "Missing IDs"],
    ["extra", "Extra IDs"],
    ["changed", "Changed questions"],
    ["unsupported", "Manual review"]
  ];
  function reviewTable(title, columns, rows) {
    const section = document.createElement("section");
    const heading = document.createElement("h5");
    heading.textContent = title;
    section.append(heading);
    const note = document.createElement("p");
    note.className = "bench-hint";
    if (!rows.length) {
      note.textContent = "None.";
      section.append(note);
      return section;
    }
    const wrap = document.createElement("div");
    wrap.className = "bench-table-wrap";
    wrap.tabIndex = 0;
    wrap.setAttribute("role", "region");
    wrap.setAttribute("aria-label", title);
    const table = document.createElement("table");
    table.className = "bench-table";
    table.setAttribute("aria-label", title);
    const header = table.createTHead().insertRow();
    for (const label of columns) {
      const cell = document.createElement("th");
      cell.scope = "col";
      cell.textContent = label;
      header.append(cell);
    }
    const previewLimit = 100;
    const body = table.createTBody();
    for (const row of rows.slice(0, previewLimit)) {
      const record = body.insertRow();
      for (const value of row) {
        const cell = record.insertCell();
        if (typeof value === "number") cell.className = "num";
        cell.textContent = value;
      }
    }
    wrap.append(table);
    section.append(wrap);
    if (rows.length > previewLimit) {
      note.textContent = "Showing " + previewLimit + " of " + rows.length + " rows. The receipt contains every row.";
      section.append(note);
    }
    return section;
  }
  var categoryLabel = (path) => path ?? "Category path unavailable";
  var lineReference = (row) => row ? (row.type ?? "Type unavailable") + ", line " + row.line : "—";
  function showReview(results, receipt) {
    const scope = document.createElement("p");
    scope.className = "bench-hint";
    scope.textContent = receipt.scope;
    results.append(scope);
    const rows = receipt.categories.map((category) => [categoryLabel(category.categoryPath), category.expected, category.actual]);
    results.append(reviewTable("Category counts", ["Category path", "Expected", "Destination"], rows));
    for (const [key, title] of sections) {
      const issues = receipt[key].map((row) => [
        categoryLabel(row.categoryPath),
        row.id ?? "Unidentified",
        lineReference(row.expected),
        lineReference(row.actual),
        row.details.join(" · ")
      ]);
      results.append(reviewTable(title + " (" + issues.length + ")", ["Category path", "ID", "Expected", "Destination", "Detail"], issues));
    }
  }
  async function readReviewInput(file, label) {
    try {
      return await readCampusReviewFile(file);
    } catch (error) {
      throw new Error(label + " (" + file.name + "): " + error.message);
    }
  }
  function wireCampusReview(root, saveText2) {
    const form = root.querySelector("form");
    const { expected, actual, runLabel, stagingVersion } = form.elements;
    const compare = root.querySelector("[data-campus-compare]");
    const download = root.querySelector("[data-campus-download]");
    const status = root.querySelector("[data-campus-status]");
    const output = root.querySelector("[data-campus-output]");
    const empty = root.querySelector("[data-campus-empty]");
    const results = root.querySelector("[data-campus-results]");
    const ready = Boolean(globalThis.crypto?.subtle);
    let revision = 0;
    let receipt;
    function report(message = "", kind = "") {
      status.textContent = message;
      status.dataset.kind = kind;
    }
    function resetResult() {
      receipt = void 0;
      download.disabled = true;
      results.hidden = true;
      results.replaceChildren();
      empty.hidden = false;
    }
    function pending(active) {
      compare.disabled = active || !ready;
      output.setAttribute("aria-busy", String(active));
    }
    form.addEventListener("input", () => {
      for (const [name, input] of [["expected", expected], ["actual", actual]]) {
        root.querySelector("[data-campus-" + name + "-file]").textContent = input.files[0]?.name ?? "No file selected.";
      }
      revision += 1;
      pending(false);
      resetResult();
      if (ready) report();
    });
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!ready || compare.disabled) return;
      const expectedFile = expected.files[0];
      const actualFile = actual.files[0];
      if (!expectedFile || !actualFile) {
        report("Choose the expected release and the destination export.", "error");
        return;
      }
      const current = ++revision;
      resetResult();
      pending(true);
      report("Comparing the two exports…");
      const labels = { runLabel: runLabel.value, stagingVersion: stagingVersion.value };
      try {
        const [left, right] = await Promise.all([
          readReviewInput(expectedFile, "Expected release"),
          readReviewInput(actualFile, "Destination export")
        ]);
        if (current !== revision) return;
        const compared = buildCampusReview(left, right, labels);
        showReview(results, compared);
        receipt = compared;
        results.hidden = false;
        empty.hidden = true;
        download.disabled = false;
        const prefix = compared.counts.matched + " matched. ";
        if (compared.outcome === "matched") report(prefix + "The checked fields match in both exports.", "success");
        else report(prefix + "Review the category counts and rows below.");
      } catch (error) {
        if (current === revision) report(error.message, "error");
      } finally {
        if (current === revision) pending(false);
      }
    });
    download.addEventListener("click", () => {
      if (receipt) saveText2("campus_review_receipt.json", JSON.stringify(receipt, null, 2) + "\n", "application/json");
    });
    if (!ready) {
      pending(false);
      report("Open this tool in a current browser over HTTPS or from the offline download.", "error");
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
  document.querySelectorAll("[data-campus-review]").forEach((root) => wireCampusReview(root, saveText));
})();
