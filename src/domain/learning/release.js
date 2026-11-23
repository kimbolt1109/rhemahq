import { sha256Hex } from "../../lib/file-integrity.js";
import { escapeXml } from "../../lib/markup.js";

export const MOODLE_COURSE_ROOT = "$course$/top/";

export async function buildMoodleRelease(questions) {
  const seen = new Set();
  const counts = new Map();
  const receipt = [];
  const parts = ['<?xml version="1.0" encoding="UTF-8"?>', "<quiz>"];
  let lastCategory;
  for (const question of questions) {
    const path = question.categoryPath ?? (MOODLE_COURSE_ROOT + question.category);
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
      source: question.source, category: question.category, id: question.id, type: question.type,
      line: question.line, checksum: await sha256Hex(question.xml),
    });
  }
  parts.push("</quiz>");
  return { importXml: parts.join("\n"), receipt, counts: Object.fromEntries(counts) };
}
