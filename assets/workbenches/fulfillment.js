(() => {
  // src/domain/fulfillment/ledger.js
  function reconcileRows(rows) {
    const groups = /* @__PURE__ */ new Map();
    for (const row of rows) {
      const month = String(row.date ?? "").slice(0, 7);
      const key = JSON.stringify([row.provider, row.currency, month, row.label]);
      const price = row.unit ?? null;
      if (!groups.has(key)) {
        groups.set(key, { provider: row.provider, currency: row.currency, month, label: row.label, count: 0, quantity: null, unit: price, total: 0 });
      }
      const group = groups.get(key);
      group.count += 1;
      group.total += Number(row.total);
      if (row.quantity != null && row.quantity !== "") {
        group.quantity = (group.quantity ?? 0) + Number(row.quantity);
      }
      if (group.unit !== price) group.unit = null;
    }
    const summary = Array.from(groups.values(), (group) => ({ ...group, total: Number(group.total.toPrecision(15)) }));
    const sources = rows.map(({ file, sheet, row, label, total, sha256 }) => ({ file, sheet, row, label, total: Number(total), sha256 }));
    return { summary, sources };
  }

  // src/lib/file-integrity.js
  var encoder = new TextEncoder();
  async function sha256Hex(input) {
    const bytes = typeof input === "string" ? encoder.encode(input) : input;
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  // src/infrastructure/fulfillment/invoices.js
  function invoiceDate(value, xlsx, date1904) {
    if (typeof value === "number") {
      const date2 = xlsx.SSF.parse_date_code(value, { date1904 });
      if (date2) value = [date2.y, String(date2.m).padStart(2, "0"), String(date2.d).padStart(2, "0")].join("-");
    }
    const text = String(value ?? "").trim();
    const date = new Date(text);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(+date) || date.toISOString().slice(0, 10) !== text) {
      throw new Error("use a date in YYYY-MM-DD format or an Excel date");
    }
    return text;
  }
  function invoiceNumber(value, name, optional = false) {
    if (optional && (value == null || String(value).trim() === "")) return null;
    if (typeof value !== "number" && !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(String(value ?? "").trim())) {
      throw new Error(name + " must be a number");
    }
    const number = Number(value);
    if (!Number.isFinite(number)) throw new Error(name + " must be a finite number");
    return number;
  }
  async function readInvoice(file, xlsx) {
    const bytes = await file.arrayBuffer();
    const digest = await sha256Hex(bytes);
    const workbook = /\.csv$/i.test(file.name) ? xlsx.read(new TextDecoder().decode(bytes), { type: "string", raw: true }) : xlsx.read(bytes, { type: "array" });
    const date1904 = workbook.Workbook?.WBProps?.date1904;
    const rows = [];
    for (const sheet of workbook.SheetNames) {
      const entries = xlsx.utils.sheet_to_json(workbook.Sheets[sheet], { defval: "" });
      for (const entry of entries) {
        const row = entry.__rowNum__ + 1;
        const record = Object.fromEntries(Object.entries(entry).map(([key, value]) => [key.trim().toLowerCase(), value]));
        const provider = String(record.provider ?? "").trim();
        const currency = String(record.currency ?? "").trim().toUpperCase();
        const label = String(record.label || record.fee || "").trim();
        try {
          if (!provider || !/^[A-Z]{3}$/.test(currency) || !label) {
            throw new Error("provide a provider, three-letter currency, and label");
          }
          rows.push({
            file: file.name,
            sheet,
            row,
            provider,
            currency,
            label,
            date: invoiceDate(record.date, xlsx, date1904),
            quantity: invoiceNumber(record.quantity, "quantity", true),
            unit: invoiceNumber(record.unit, "unit", true),
            total: invoiceNumber(record.total, "total"),
            sha256: digest
          });
        } catch (error) {
          throw new Error(sheet + ", row " + row + ": " + error.message);
        }
      }
    }
    if (!rows.length) throw new Error("no invoice rows found");
    return rows;
  }

  // src/lib/markup.js
  function escapeXml(value) {
    return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
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
        const loaded = await loader();
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
      loadInput(async () => {
        const batch = [];
        for (const file of selected) {
          try {
            batch.push(await config.read(file));
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

  // src/features/fulfillment/sample.js
  var LEDGER_SAMPLE = [
    { file: "invoice_march.xlsx", sheet: "Sheet1", row: 128, provider: "ShipBob", batch: "MAR-01", currency: "USD", date: "2026-03-04", label: "Pick & Pack", quantity: 42, unit: 1.1, total: 46.2 },
    { file: "invoice_march.xlsx", sheet: "Sheet1", row: 129, provider: "ShipBob", batch: "MAR-01", currency: "USD", date: "2026-03-04", label: "Pick & Pack", quantity: 17, unit: 1.1, total: 18.7 },
    { file: "invoice_march.xlsx", sheet: "Sheet1", row: 130, provider: "ShipBob", batch: "MAR-01", currency: "USD", date: "2026-03-11", label: "Storage", quantity: null, unit: null, total: 120 },
    { file: "invoice_march_b.xlsx", sheet: "Fees", row: 8, provider: "ShipBob", batch: "MAR-02", currency: "USD", date: "2026-03-18", label: "Returns", quantity: 5, unit: 2.5, total: 12.5 },
    { file: "invoice_march_b.xlsx", sheet: "Fees", row: 9, provider: "ShipBob", batch: "MAR-02", currency: "USD", date: "2026-03-18", label: "Credit", quantity: null, unit: null, total: -6 }
  ];

  // src/features/fulfillment/workbench.js
  async function ledgerSample() {
    const xlsx = globalThis.XLSX;
    const columns = ["provider", "currency", "date", "label", "quantity", "unit", "total"];
    const files = /* @__PURE__ */ new Map();
    for (const row of LEDGER_SAMPLE) {
      if (!files.has(row.file)) files.set(row.file, { name: row.sheet, sheet: xlsx.utils.aoa_to_sheet([columns]) });
      xlsx.utils.sheet_add_aoa(files.get(row.file).sheet, [columns.map((column) => row[column])], {
        origin: { r: row.row - 1, c: 0 }
      });
    }
    const inputs = await Promise.all(Array.from(files, ([name, { sheet, name: sheetName }]) => {
      const workbook = xlsx.utils.book_new();
      xlsx.utils.book_append_sheet(workbook, sheet, sheetName);
      const bytes = xlsx.write(workbook, { type: "array", bookType: "xlsx" });
      return readInvoice(new File([bytes], name), xlsx);
    }));
    return inputs.flat();
  }
  function saveWorkbook(output) {
    const xlsx = globalThis.XLSX;
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, xlsx.utils.json_to_sheet(output.summary), "Fee rollup");
    xlsx.utils.book_append_sheet(workbook, xlsx.utils.json_to_sheet(output.sources), "Source references");
    xlsx.writeFile(workbook, "fulfillment_ledger.xlsx");
  }
  var ledger = {
    available: () => Boolean(globalThis.XLSX),
    sample: ledgerSample,
    read: (file) => readInvoice(file, globalThis.XLSX),
    build: reconcileRows,
    download: saveWorkbook,
    inputName: "invoice rows",
    describe: (output) => output.summary.length + " rollup groups and " + output.sources.length + " source references.",
    summary: (output) => ({
      title: "Fee rollup",
      columns: ["Provider", "Currency", "Month", "Label", "Rows", "Qty", "Unit", "Total"],
      rows: output.summary.map((row) => [row.provider, row.currency, row.month, row.label, row.count, row.quantity, row.unit, row.total])
    }),
    receipt: (output) => ({
      title: "Source references",
      columns: ["File", "Sheet", "Row", "Label", "Total", "SHA-256"],
      rows: output.sources.map((row) => [row.file, row.sheet, row.row, row.label, row.total, row.sha256.slice(0, 12) + "…"])
    })
  };
  document.querySelectorAll('[data-workbench="ledger"]').forEach((root) => wireWorkbench(root, ledger));
})();
