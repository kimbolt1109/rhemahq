import { MOODLE_COURSE_ROOT } from "../../domain/learning/release.js";

// The DOM supplies the validated structure. Track opening tags only to recover source line numbers.
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

export function readMoodle(xml, source) {
  const document = new DOMParser().parseFromString(xml, "application/xml");
  const quiz = document.documentElement;
  if (quiz.tagName !== "quiz" || document.doctype || document.querySelector("parsererror")) {
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
    const id = node.querySelector("idnumber")?.textContent.trim()
      || node.querySelector("name > text")?.textContent.trim()
      || "q-" + (index + 1);
    rows.push({
      source, categoryPath, category: categoryPath.startsWith(MOODLE_COURSE_ROOT) ? categoryPath.slice(MOODLE_COURSE_ROOT.length) : categoryPath,
      id, type, line: lines[index], xml: "  " + serializer.serializeToString(node),
    });
  }
  if (!rows.length) throw new Error("no Moodle questions found");
  return rows;
}

export function moodleReceiptCsv(receipt) {
  const columns = ["source", "category", "id", "type", "line", "checksum"];
  const cell = (value) => {
    const text = String(value ?? "");
    const safe = typeof value === "string" && /^[\s\uFEFF]*[=+\-@]/.test(text) ? "'" + text : text;
    return '"' + safe.replaceAll('"', '""') + '"';
  };
  return [columns.join(","), ...receipt.map((row) => columns.map((column) => cell(row[column])).join(","))].join("\r\n");
}
