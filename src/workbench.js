import { escapeXml } from "./lib/markup.js";

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
  element.innerHTML = "<h5 id='" + labelId + "'>" + title + "</h5><div class='bench-table-wrap' role='region' aria-labelledby='" + labelId +
    "' tabindex='0'><table class='bench-table' aria-labelledby='" + labelId + "'><thead><tr>" + headings +
    "</tr></thead><tbody>" + body + "</tbody></table></div>" + limit;
}

export function wireWorkbench(root, config) {
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
    output = undefined;
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
