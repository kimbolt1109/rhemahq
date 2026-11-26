import { agencyStorageKey, agencyStore, maxWorkflows } from "../../domain/fulfillment/agency.js";

export function wireAgencyWorkflows(root, reset) {
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
      activate(undefined);
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
      activate(undefined);
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
    },
  };
}
