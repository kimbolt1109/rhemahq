import { mountTabs } from "../product-tabs.js";
import { mountHorizontalSwipe } from "../product-swipe.js";
import { MOODLE_SAMPLE } from "./sample.js";

const deck = document.querySelector("[data-receipt-deck]");
const tabs = deck.querySelector("[data-receipt-tabs]");
const records = deck.querySelector("[data-receipt-records]");
const template = document.getElementById("release-record");
const types = { multichoice: "Multiple choice", truefalse: "True or false", cloze: "Cloze" };
const parser = new DOMParser();
const reduce = matchMedia("(prefers-reduced-motion: reduce)");
let active = 0;
let presentation;

for (const { id, type, category, source, line, xml } of MOODLE_SAMPLE) {
  const record = template.content.firstElementChild.cloneNode(true);
  record.id = "receipt-" + id;
  const name = parser.parseFromString(xml, "application/xml").querySelector("name > text").textContent;
  const fields = { id, type: types[type], category, source, line, name };
  for (const [field, value] of Object.entries(fields)) {
    record.querySelector('[data-field="' + field + '"]').textContent = value;
  }
  records.append(record);

  const tab = document.createElement("button");
  tab.type = "button";
  tab.id = "tab-" + id;
  tab.textContent = id;
  tab.setAttribute("aria-controls", record.id);
  tabs.append(tab);
}
const select = mountTabs(tabs, (index, previous) => {
  active = index;
  deck.dataset.receiptPosition = String(index);
  presentation?.cancel();
  if (previous === undefined || reduce.matches) return;
  const entry = records.children[index];
  const direction = Math.sign(index - previous);
  presentation = entry.animate([
    { opacity: .45, transform: `translateX(${direction * 18}px) rotate(${direction * 1.8}deg)` },
    { opacity: 1, transform: "none" },
  ], { duration: 240, easing: "cubic-bezier(.23, 1, .32, 1)" });
});
mountHorizontalSwipe(records, {
  move(distance) {
    if (reduce.matches) return;
    presentation?.cancel();
    const damped = distance / (1 + Math.abs(distance) / 95);
    records.style.setProperty("--receipt-drag", damped.toFixed(2) + "px");
    records.style.setProperty("--receipt-angle", (damped * .06).toFixed(2) + "deg");
  },
  finish(direction) {
    records.style.removeProperty("--receipt-drag");
    records.style.removeProperty("--receipt-angle");
    if (direction) select((active + direction + MOODLE_SAMPLE.length) % MOODLE_SAMPLE.length);
  },
});
reduce.addEventListener("change", () => {
  presentation?.cancel();
  records.style.removeProperty("--receipt-drag");
  records.style.removeProperty("--receipt-angle");
});
deck.hidden = false;
document.querySelector("[data-receipt-instruction]").hidden = false;
