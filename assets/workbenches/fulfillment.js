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

  // src/domain/fulfillment/agency.js
  var maxWorkflows = 4;
  var agencyStorageKey = "rhema-ledger-agency-v1";
  var invoiceFields = ["provider", "currency", "date", "label", "total", "quantity", "unit"];
  function presetFields(mapping) {
    const result = {};
    for (const field of invoiceFields) {
      const { column, value } = mapping?.[field] ?? {};
      if (typeof column === "string" && /^[A-Z]+$/.test(column)) {
        result[field] = { column };
      } else if ((field === "provider" || field === "currency") && typeof value === "string") {
        result[field] = { value: value.trim() };
      }
    }
    return result;
  }
  function invoiceLayoutKey(columns) {
    return sha256Hex(JSON.stringify(columns.map(({ column, label }) => [column, label])));
  }
  function agencyStore(storage) {
    function list() {
      const saved = storage.getItem(agencyStorageKey);
      if (saved === null) return [];
      const workflows = JSON.parse(saved);
      if (!Array.isArray(workflows) || workflows.length > maxWorkflows || workflows.some((item) => typeof item?.id !== "string" || typeof item.label !== "string" || !item.presets || typeof item.presets !== "object" || Array.isArray(item.presets))) {
        throw new Error("Saved workflow settings are invalid.");
      }
      return workflows.map(({ id, label, presets }) => ({
        id,
        label,
        presets: Object.fromEntries(Object.entries(presets).filter(([signature]) => /^[0-9a-f]{64}$/.test(signature)).map(([signature, mapping]) => [signature, presetFields(mapping)]))
      }));
    }
    function write(workflows) {
      storage.setItem(agencyStorageKey, JSON.stringify(workflows));
    }
    return {
      list,
      add(name) {
        const label = name.trim();
        const workflows = list();
        if (!label) throw new Error("Enter a client workflow label.");
        if (workflows.length >= maxWorkflows) throw new Error("This tool supports four client workflows.");
        if (workflows.some((item) => item.label.toLowerCase() === label.toLowerCase())) {
          throw new Error("Choose a label distinct from your other workflows.");
        }
        write([...workflows, { id: crypto.randomUUID(), label, presets: {} }]);
      },
      remove(id) {
        write(list().filter((workflow) => workflow.id !== id));
      },
      preset(id, signature) {
        return list().find((workflow) => workflow.id === id)?.presets[signature];
      },
      savePresets(id, additions) {
        const workflows = list();
        const workflow = workflows.find((item) => item.id === id);
        if (!workflow) return;
        for (const [signature, mapping] of additions) {
          if (!/^[0-9a-f]{64}$/.test(signature)) throw new Error("The column layout could not be identified.");
          workflow.presets[signature] = presetFields(mapping);
        }
        write(workflows);
      }
    };
  }
  function decimal(number) {
    const [mantissa, exponent = "0"] = String(number).split("e");
    const [whole, fraction = ""] = mantissa.split(".");
    return [BigInt(whole + fraction), Number(exponent) - fraction.length];
  }
  function addDecimal([left, leftPower], [right, rightPower]) {
    const power = Math.min(leftPower, rightPower);
    return [left * 10n ** BigInt(leftPower - power) + right * 10n ** BigInt(rightPower - power), power];
  }
  function spreadsheetNumber([coefficient, power]) {
    const number = Number(String(coefficient) + "e" + power);
    if (!Number.isFinite(number)) throw new Error("Close totals exceed the workbook's numeric range.");
    return number;
  }
  function closeReview(rows, workflow) {
    const totals = /* @__PURE__ */ new Map();
    const positions = /* @__PURE__ */ new Set();
    const zero = [0n, 0];
    const trace = rows.map(({ file, sheet, row, sha256, provider, currency, date, label, total }) => {
      const position = JSON.stringify([sha256, sheet, row]);
      if (positions.has(position)) {
        throw new Error("An invoice source position is repeated in " + file + " (" + sheet + ", " + row + "). Clear inputs and add each original file once.");
      }
      positions.add(position);
      const month = date.slice(0, 7);
      const key = JSON.stringify([currency, month]);
      if (!totals.has(key)) totals.set(key, { workflow, currency, month, rows: 0, charges: zero, credits: zero });
      const group = totals.get(key);
      group.rows += 1;
      const type = total < 0 ? "credits" : "charges";
      group[type] = addDecimal(group[type], decimal(total));
      return { workflow, file, sheet, row, sha256, provider, currency, date, label, total };
    });
    return {
      totals: Array.from(totals.values(), (group) => ({
        ...group,
        charges: spreadsheetNumber(group.charges),
        credits: spreadsheetNumber(group.credits),
        net: spreadsheetNumber(addDecimal(group.charges, group.credits))
      })),
      trace
    };
  }

  // src/infrastructure/fulfillment/invoices.js
  var requiredFields = ["provider", "currency", "date", "label", "total"];
  var optionalFields = ["quantity", "unit"];
  var fields = [...requiredFields, ...optionalFields];
  var fixedFields = ["provider", "currency"];
  var normalizeHeader = (value) => String(value ?? "").trim().toLowerCase();
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
  function invoiceColumns(header) {
    return Object.entries(header).map(([column, value]) => ({ column, label: String(value).trim() })).filter(({ label }) => label !== "");
  }
  function hasStandardColumns(columns) {
    const names = columns.map(({ label }) => normalizeHeader(label));
    const known = [...fields, "fee"];
    if (known.some((field) => names.indexOf(field) !== names.lastIndexOf(field))) return false;
    return requiredFields.every((field) => names.includes(field) || field === "label" && names.includes("fee"));
  }
  function validateInvoiceMapping(columns, mapping) {
    const available = new Set(columns.map(({ column }) => column));
    const used = /* @__PURE__ */ new Set();
    for (const field of fields) {
      const { column, value } = mapping[field] ?? {};
      if (column) {
        if (!available.has(column) || used.has(column)) throw new Error("Choose an available, separate column for each field.");
        used.add(column);
      } else if (fixedFields.includes(field)) {
        const text = String(value ?? "").trim();
        if (!text || field === "currency" && !/^[A-Z]{3}$/i.test(text)) {
          throw new Error("Choose a provider and currency column or enter the provider and three-letter currency for this sheet.");
        }
      } else if (requiredFields.includes(field)) {
        throw new Error("Choose a date, fee label, and signed total column.");
      }
    }
  }
  async function sheetRows(file, sheet, worksheet, xlsx, chooseMapping) {
    if (!chooseMapping) {
      return xlsx.utils.sheet_to_json(worksheet, { defval: "" }).map((entry) => ({
        row: entry.__rowNum__ + 1,
        record: Object.fromEntries(Object.entries(entry).map(([key, value]) => [normalizeHeader(key), value]))
      }));
    }
    const [header, ...entries] = xlsx.utils.sheet_to_json(worksheet, { header: "A", defval: "", blankrows: false });
    if (!entries.length) return [];
    const columns = invoiceColumns(header);
    if (!columns.length) throw new Error(sheet + ": the first populated row must contain column headings.");
    let selected;
    if (hasStandardColumns(columns)) {
      selected = columns.map(({ column, label }) => [normalizeHeader(label), { column }]);
    } else {
      const mapping = await chooseMapping({ file, sheet, columns });
      if (!mapping) throw new Error("Column mapping cancelled for " + sheet + ".");
      validateInvoiceMapping(columns, mapping);
      selected = fields.map((field) => [field, mapping[field] ?? {}]);
    }
    return entries.map((entry) => ({
      row: entry.__rowNum__ + 1,
      record: Object.fromEntries(selected.map(([field, source]) => [field, source.column ? entry[source.column] : source.value]))
    }));
  }
  async function readInvoice(file, xlsx, chooseMapping) {
    const bytes = await file.arrayBuffer();
    const digest = await sha256Hex(bytes);
    const workbook = /\.csv$/i.test(file.name) ? xlsx.read(new TextDecoder().decode(bytes), { type: "string", raw: true }) : xlsx.read(bytes, { type: "array" });
    const date1904 = workbook.Workbook?.WBProps?.date1904;
    const rows = [];
    for (const sheet of workbook.SheetNames) {
      const entries = await sheetRows(file.name, sheet, workbook.Sheets[sheet], xlsx, chooseMapping);
      for (const { row, record } of entries) {
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

  // src/features/fulfillment/sample.js
  var LEDGER_SAMPLE = [
    { file: "invoice_march.xlsx", sheet: "Sheet1", row: 128, provider: "ShipBob", batch: "MAR-01", currency: "USD", date: "2026-03-04", label: "Pick & Pack", quantity: 42, unit: 1.1, total: 46.2 },
    { file: "invoice_march.xlsx", sheet: "Sheet1", row: 129, provider: "ShipBob", batch: "MAR-01", currency: "USD", date: "2026-03-04", label: "Pick & Pack", quantity: 17, unit: 1.1, total: 18.7 },
    { file: "invoice_march.xlsx", sheet: "Sheet1", row: 130, provider: "ShipBob", batch: "MAR-01", currency: "USD", date: "2026-03-11", label: "Storage", quantity: null, unit: null, total: 120 },
    { file: "invoice_march_b.xlsx", sheet: "Fees", row: 8, provider: "ShipBob", batch: "MAR-02", currency: "USD", date: "2026-03-18", label: "Returns", quantity: 5, unit: 2.5, total: 12.5 },
    { file: "invoice_march_b.xlsx", sheet: "Fees", row: 9, provider: "ShipBob", batch: "MAR-02", currency: "USD", date: "2026-03-18", label: "Credit", quantity: null, unit: null, total: -6 }
  ];

  // src/features/fulfillment/column-mapping.js
  var fieldLabels = {
    provider: "Provider",
    currency: "Currency",
    date: "Date",
    label: "Fee label",
    total: "Signed total",
    quantity: "Quantity (optional)",
    unit: "Unit price (optional)"
  };
  function invoiceMappingDialog(root) {
    const dialog = document.createElement("dialog");
    dialog.className = "workbench invoice-mapping";
    dialog.setAttribute("aria-label", "Match invoice columns");
    dialog.innerHTML = `
    <header class="bench-head"><div><h3>Match invoice columns</h3><p data-source></p></div></header>
    <form class="bench-input" method="dialog">
      <p class="bench-hint invoice-mapping-hint">Choose the source column for each field. Enter provider or currency once if it applies to the entire sheet.</p>
      <p class="bench-hint invoice-mapping-hint" data-preset-note hidden></p>
      <div class="invoice-mapping-grid">${Object.entries(fieldLabels).map(([name, label]) => `<label>${label}<select name="${name}"></select></label>`).join("")}</div>
      <div class="invoice-mapping-grid invoice-mapping-defaults">
        <label>Provider for this sheet<input name="fixedProvider" type="text"></label>
        <label>Currency for this sheet<input name="fixedCurrency" type="text" maxlength="3" placeholder="USD"></label>
      </div>
      <label class="invoice-mapping-remember" data-preset-choice hidden><input type="checkbox" name="keepPreset"> Remember this mapping for the selected workflow</label>
      <p class="bench-status" data-kind="error" role="alert"></p>
      <div class="bench-actions">
        <button class="button primary" value="apply">Read sheet</button>
        <button class="button" value="cancel">Cancel import</button>
      </div>
    </form>`;
    root.after(dialog);
    const form = dialog.querySelector("form");
    const error = dialog.querySelector("[role=alert]");
    const sourceText = dialog.querySelector("[data-source]");
    const presetNote = dialog.querySelector("[data-preset-note]");
    const choice = dialog.querySelector("[data-preset-choice]");
    const apply = form.querySelector('button[value="apply"]');
    const fields2 = form.elements;
    const defaults = { provider: fields2.fixedProvider, currency: fields2.fixedCurrency };
    for (const [name, input] of Object.entries(defaults)) {
      fields2.namedItem(name).addEventListener("change", (event) => {
        input.disabled = Boolean(event.target.value);
      });
    }
    function open({ file, sheet, columns }, workflow, preset) {
      form.reset();
      error.textContent = "";
      sourceText.textContent = file + " · " + sheet;
      presetNote.hidden = !preset;
      presetNote.textContent = preset ? "Saved mapping for " + workflow.label + ". Confirm the columns and fixed values for this sheet." : "";
      apply.textContent = preset ? "Confirm mapping and read" : "Read sheet";
      choice.hidden = fields2.keepPreset.disabled = !workflow;
      for (const name of Object.keys(fieldLabels)) {
        const select = fields2.namedItem(name);
        const placeholder = defaults[name] ? "Use value below" : name === "quantity" || name === "unit" ? "Leave blank" : "Choose column";
        select.replaceChildren(new Option(placeholder, ""), ...columns.map(({ column, label }) => new Option(column + " · " + label, column)));
        if (preset) select.value = preset[name]?.column ?? "";
        else {
          const matches = columns.filter(({ label }) => label.toLowerCase() === name);
          if (matches.length === 1) select.value = matches[0].column;
        }
        if (defaults[name]) {
          defaults[name].disabled = Boolean(select.value);
          defaults[name].value = preset?.[name]?.value ?? "";
        }
      }
      let selected;
      const submit = (event) => {
        if (event.submitter?.value !== "apply") return;
        const mapping = Object.fromEntries(Object.keys(fieldLabels).map((name) => {
          const column = fields2.namedItem(name).value;
          return [name, column ? { column } : { value: defaults[name]?.value }];
        }));
        try {
          validateInvoiceMapping(columns, mapping);
          selected = { mapping, remember: Boolean(workflow && fields2.keepPreset.checked) };
        } catch (failure) {
          event.preventDefault();
          error.textContent = failure.message;
        }
      };
      return new Promise((resolve) => {
        form.addEventListener("submit", submit);
        dialog.addEventListener("close", () => {
          form.removeEventListener("submit", submit);
          sourceText.textContent = presetNote.textContent = error.textContent = "";
          for (const select of form.querySelectorAll("select")) select.replaceChildren();
          form.reset();
          resolve(selected);
        }, { once: true });
        dialog.showModal();
      });
    }
    return {
      open,
      cancel() {
        if (dialog.open) dialog.close("cancel");
      }
    };
  }

  // src/features/fulfillment/agency-workflows.js
  function wireAgencyWorkflows(root, reset) {
    const panel = root.querySelector("[data-agency]");
    if (!panel) return;
    function openTarget() {
      if (globalThis.location.hash === "#" + panel.id) panel.open = true;
    }
    openTarget();
    globalThis.addEventListener("hashchange", openTarget);
    const select = panel.querySelector("[data-agency-select]");
    const form = panel.querySelector("form");
    const labelInput = form.elements.namedItem("workflowLabel");
    const add = form.querySelector("button");
    const remove = panel.querySelector("[data-agency-remove]");
    const feedback = panel.querySelector("[role=status]");
    const sample = root.querySelector("[data-sample]");
    let selected;
    let store;
    function say(message) {
      feedback.textContent = message;
    }
    function activate(workflow) {
      if (selected?.id === workflow?.id) return;
      selected = workflow;
      select.value = workflow?.id ?? "";
      sample.hidden = Boolean(workflow);
      remove.disabled = !workflow;
      reset();
      say((workflow ? "Selected " + workflow.label + "." : "No client selected.") + " Invoice files and results cleared.");
    }
    function refresh() {
      const available = store.list();
      select.replaceChildren(new Option("No client", ""), ...available.map(({ id, label }) => new Option(label, id)));
      activate(available.find((workflow) => workflow.id === selected?.id));
      select.value = selected?.id ?? "";
      labelInput.disabled = add.disabled = available.length >= maxWorkflows;
      return available;
    }
    try {
      store = agencyStore(globalThis.localStorage);
      refresh();
    } catch {
      say("This browser could not read saved workflow settings. The Ledger can still run without a client.");
      select.disabled = labelInput.disabled = add.disabled = remove.disabled = true;
      return;
    }
    select.addEventListener("change", () => {
      const id = select.value;
      try {
        activate(store.list().find((item) => item.id === id));
      } catch {
        activate(void 0);
        select.value = "";
        say("Saved workflow settings could not be read. Invoice files and results cleared.");
      }
    });
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      try {
        store.add(labelInput.value);
        form.reset();
        refresh();
        say("Workflow saved. Select it before you add invoices for that client.");
        select.focus();
      } catch (failure) {
        say(failure.message);
      }
    });
    remove.addEventListener("click", () => {
      if (!selected || !globalThis.confirm("Remove the local workflow for " + selected.label + " and its mappings?")) return;
      try {
        store.remove(selected.id);
        refresh();
        say("Workflow removed. Invoice files and results cleared.");
        select.focus();
      } catch (failure) {
        say(failure.message);
      }
    });
    globalThis.addEventListener("storage", (event) => {
      if (event.key !== agencyStorageKey && event.key !== null) return;
      try {
        refresh();
      } catch {
        activate(void 0);
        select.value = "";
        say("Saved workflow settings could not be read. Invoice files and results cleared.");
      }
    });
    return {
      active: () => selected,
      preset(id, signature) {
        try {
          return store.preset(id, signature);
        } catch {
          say("Saved mappings could not be read. Check and select the source columns manually.");
        }
      },
      save(id, presets) {
        try {
          store.savePresets(id, presets);
        } catch {
          say("The invoice loaded. These settings could not be saved for reuse.");
        }
      }
    };
  }

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
    const sources = output.sources.map((row) => ({ ...row, positionType: positionType(row.file) }));
    xlsx.utils.book_append_sheet(workbook, xlsx.utils.json_to_sheet(sources), "Source references");
    if (output.close) {
      xlsx.utils.book_append_sheet(workbook, xlsx.utils.json_to_sheet(output.close.totals), "Close review");
      const trace = output.close.trace.map((row) => ({ ...row, positionType: positionType(row.file) }));
      xlsx.utils.book_append_sheet(workbook, xlsx.utils.json_to_sheet(trace), "Close source trace");
    }
    xlsx.writeFile(workbook, "fulfillment_ledger.xlsx");
  }
  var positionType = (file) => /\.csv$/i.test(file) ? "CSV record" : "Excel row";
  var shortenedHash = (hash) => hash.slice(0, 12) + "…";
  var ledger = {
    available: () => Boolean(globalThis.XLSX),
    sample: ledgerSample,
    download: saveWorkbook,
    inputName: "invoice rows",
    describe: (output) => output.summary.length + " rollup groups and " + output.sources.length + " source references.",
    summary: (output) => output.close ? {
      title: "Close review by month and currency",
      columns: ["Workflow", "Month", "Currency", "Rows", "Charges", "Credits", "Net"],
      rows: output.close.totals.map((row) => [row.workflow, row.month, row.currency, row.rows, row.charges, row.credits, row.net])
    } : {
      title: "Fee rollup",
      columns: ["Provider", "Currency", "Month", "Label", "Rows", "Qty", "Unit", "Total"],
      rows: output.summary.map((row) => [row.provider, row.currency, row.month, row.label, row.count, row.quantity, row.unit, row.total])
    },
    receipt: (output) => output.close ? {
      title: "Close source trace",
      columns: ["File", "Sheet", "Position", "Position type", "Provider", "Date", "Label", "Currency", "Total", "SHA-256"],
      rows: output.close.trace.map((row) => [row.file, row.sheet, row.row, positionType(row.file), row.provider, row.date, row.label, row.currency, row.total, shortenedHash(row.sha256)])
    } : {
      title: "Source references",
      columns: ["File", "Sheet", "Position", "Position type", "Label", "Total", "SHA-256"],
      rows: output.sources.map((row) => [row.file, row.sheet, row.row, positionType(row.file), row.label, row.total, shortenedHash(row.sha256)])
    }
  };
  document.querySelectorAll('[data-workbench="ledger"]').forEach((root) => {
    const mappingDialog = invoiceMappingDialog(root);
    const agency = wireAgencyWorkflows(root, () => {
      mappingDialog.cancel();
      root.querySelector("[data-clear]").click();
    });
    wireWorkbench(root, {
      ...ledger,
      build(rows) {
        const output = reconcileRows(rows);
        const workflow = agency?.active();
        if (workflow) output.close = closeReview(rows, workflow.label);
        return output;
      },
      async read(file, isCurrent) {
        const workflow = agency?.active();
        const additions = [];
        const rows = await readInvoice(file, globalThis.XLSX, async (source) => {
          if (!isCurrent()) return;
          const signature = workflow ? await invoiceLayoutKey(source.columns) : void 0;
          if (!isCurrent()) return;
          const preset = workflow ? agency.preset(workflow.id, signature) : void 0;
          const selection = await mappingDialog.open(source, workflow, preset);
          if (selection?.remember) additions.push([signature, selection.mapping]);
          return selection?.mapping;
        });
        if (isCurrent() && additions.length) agency.save(workflow.id, additions);
        return rows;
      }
    });
  });
})();
