import { validateInvoiceMapping } from "../../infrastructure/fulfillment/invoices.js";

const fieldLabels = {
  provider: "Provider",
  currency: "Currency",
  date: "Date",
  label: "Fee label",
  total: "Signed total",
  quantity: "Quantity (optional)",
  unit: "Unit price (optional)",
};

export function invoiceMappingDialog(root) {
  const dialog = document.createElement("dialog");
  dialog.className = "workbench invoice-mapping";
  dialog.setAttribute("aria-label", "Match invoice columns");
  dialog.innerHTML = `
    <header class="bench-head"><div><h3>Match invoice columns</h3><p data-source></p></div></header>
    <form class="bench-input" method="dialog">
      <p class="bench-hint invoice-mapping-hint">Choose the source column for each field. Enter provider or currency once if it applies to the entire sheet.</p>
      <p class="bench-hint invoice-mapping-hint" data-preset-note hidden></p>
      <div class="invoice-mapping-grid">${Object.entries(fieldLabels).map(([name, label]) =>
        `<label>${label}<select name="${name}"></select></label>`).join("")}</div>
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
  const fields = form.elements;
  const defaults = { provider: fields.fixedProvider, currency: fields.fixedCurrency };
  for (const [name, input] of Object.entries(defaults)) {
    fields.namedItem(name).addEventListener("change", (event) => { input.disabled = Boolean(event.target.value); });
  }

  function open({ file, sheet, columns }, workflow, preset) {
    form.reset();
    error.textContent = "";
    sourceText.textContent = file + " · " + sheet;
    presetNote.hidden = !preset;
    presetNote.textContent = preset ? "Saved mapping for " + workflow.label + ". Confirm the columns and fixed values for this sheet." : "";
    apply.textContent = preset ? "Confirm mapping and read" : "Read sheet";
    choice.hidden = fields.keepPreset.disabled = !workflow;
    for (const name of Object.keys(fieldLabels)) {
      const select = fields.namedItem(name);
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
        const column = fields.namedItem(name).value;
        return [name, column ? { column } : { value: defaults[name]?.value }];
      }));
      try {
        validateInvoiceMapping(columns, mapping);
        selected = { mapping, remember: Boolean(workflow && fields.keepPreset.checked) };
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
    },
  };
}
