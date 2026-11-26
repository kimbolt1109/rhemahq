import { MOODLE_COURSE_ROOT } from "../../domain/learning/release.js";
import { sha256Hex } from "../../lib/file-integrity.js";

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

function questionNodes(xml, strict = false) {
  const document = new DOMParser().parseFromString(xml, "application/xml");
  const quiz = document.documentElement;
  if (quiz.tagName !== "quiz" || document.doctype || document.querySelector("parsererror")) {
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

export function readMoodle(xml, source) {
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
    const id = node.querySelector("idnumber")?.textContent.trim()
      || node.querySelector("name > text")?.textContent.trim()
      || "q-" + (index + 1);
    rows.push({
      source, categoryPath, category: categoryPath.startsWith(MOODLE_COURSE_ROOT) ? categoryPath.slice(MOODLE_COURSE_ROOT.length) : categoryPath,
      id, type, line, xml: "  " + serializer.serializeToString(node),
    });
  }
  if (!rows.length) throw new Error("no Moodle questions found");
  return rows;
}

const types = {
  multichoice: ["single", "shuffleanswers", "answernumbering", "showstandardinstruction", "shownumcorrect"],
  shortanswer: ["usecase"],
  truefalse: [],
};
const feedbackFields = ["correctfeedback", "partiallycorrectfeedback", "incorrectfeedback"];
const textFormats = new Set(["html", "plain_text", "markdown", "moodle_auto_format"]);
const mediaText = /@@PLUGINFILE@@|<(?:img|picture|audio|video|source|object|embed|iframe|svg)\b/i;

function onlyChild(element, name) {
  const found = Array.from(element.children).filter((child) => child.tagName === name && !child.namespaceURI);
  return found.length === 1 ? found[0] : undefined;
}

function scalar(element) {
  return element && !element.children.length && !element.attributes.length ? element.textContent.trim() : undefined;
}

// Compare the declared XML values. Formatting, answers and feedback are kept as text and never rendered.
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
  const fields = new Map();
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
    if (value === undefined) throw new Error("Unsupported grading or display option: " + name);
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
    return [reviewText(answer, "Answer text", format, true), reviewDecimal(answer.getAttribute("fraction") ?? "0", "Answer fraction"),
      reviewText(answerFields.get("feedback"), "Answer feedback", prompt[0])];
  });
  if (!answers.length) throw new Error("Question answers are missing");

  return {
    "Question name": reviewText(fields.get("name"), "Question name", null, true),
    "Question text": prompt,
    "Answers and answer feedback": answers,
    "Question feedback": [reviewText(fields.get("generalfeedback"), "General feedback", prompt[0]),
      ...feedback.map((name) => reviewText(fields.get(name), name, prompt[0]))],
    "Grading and display options": optionValues,
  };
}

export async function readCampusReviewFile(file) {
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
      categoryPath = (category && scalar(onlyChild(category, "text"))) || null;
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

export function moodleReceiptCsv(receipt) {
  const columns = ["source", "category", "id", "type", "line", "checksum"];
  const cell = (value) => {
    const text = String(value ?? "");
    const safe = typeof value === "string" && /^[\s\uFEFF]*[=+\-@]/.test(text) ? "'" + text : text;
    return '"' + safe.replaceAll('"', '""') + '"';
  };
  return [columns.join(","), ...receipt.map((row) => columns.map((column) => cell(row[column])).join(","))].join("\r\n");
}
