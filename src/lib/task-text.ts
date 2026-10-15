// Task text pieces ("Write text" on the homework page): file names and list editing. Pure, so it can be
// unit tested and used by both the server action (names) and the browser editor (lists).

/** Most characters one written piece may have (checked in the editor and again on the server). */
export const MAX_TEXT_LENGTH = 20_000;

const WRITING_NAME = /^Writing-(\d+)\.txt$/;

/** True for the names the server gives written pieces: Writing-1.txt, Writing-2.txt, ... */
export function isWritingFileName(name: string): boolean {
  return WRITING_NAME.test(name);
}

/** The next free Writing-N.txt: one more than the highest number already used (gaps are not reused). */
export function nextTextFileName(existing: { file_name: string }[]): string {
  let index = 0;
  for (const u of existing) {
    const match = u.file_name.match(WRITING_NAME);
    if (match) index = Math.max(index, Number.parseInt(match[1], 10));
  }
  return `Writing-${index + 1}.txt`;
}

/** Why a written piece can't be uploaded, or null when it's fine. */
export function textProblem(text: string): string | null {
  if (!text.trim()) return "Write something before uploading.";
  if (text.length > MAX_TEXT_LENGTH) {
    return `Your text is ${text.length.toLocaleString("en-GB")} characters; keep it to ${MAX_TEXT_LENGTH.toLocaleString("en-GB")}.`;
  }
  return null;
}

// --- Lists ---

const LIST_LINE = /^(\s*)(?:([-*])|(\d+)\.)\s/;

/** The prefix that continues a list after this line ("- ", "* ", "2. " after "1. ..."), or "" for other lines. */
export function nextListPrefix(line: string): string {
  const match = line.match(LIST_LINE);
  if (!match) return "";
  const [, indent, bullet, number] = match;
  return bullet ? `${indent}${bullet} ` : `${indent}${Number.parseInt(number, 10) + 1}. `;
}

/** True when this line is a list item ("- a", "* a", "2. b", indented or not). */
export function isListLine(line: string): boolean {
  return LIST_LINE.test(line);
}

/** The whole line the cursor is on. */
export function lineAt(text: string, pos: number): string {
  const start = pos <= 0 ? 0 : text.lastIndexOf("\n", pos - 1) + 1;
  const end = text.indexOf("\n", pos);
  return text.slice(start, end === -1 ? text.length : end);
}

/** A list line with nothing written after its bullet or number ("- ", "3. "). */
function isEmptyListLine(line: string): boolean {
  const match = line.match(LIST_LINE);
  return !!match && line.slice(match[0].length).trim() === "";
}

/** Append a new line to the end of the text, continuing the list if the last line is a list item. */
export function appendListLine(text: string, content: string): string {
  if (!text.trim()) return content;
  const lines = text.split("\n");
  const lastLine = lines[lines.length - 1];
  if (!lastLine.trim()) return text + "\n" + content;
  return text + "\n" + nextListPrefix(lastLine) + content;
}

/**
 * What pressing Enter at `pos` does: a new line that continues the list when the cursor is on a list line.
 * Enter on an empty list item ends the list instead (the empty bullet is removed), like word processors do.
 */
export function insertListLine(text: string, pos: number, content: string): string {
  const before = text.slice(0, pos);
  const after = text.slice(pos);
  const lineStart = before.lastIndexOf("\n") + 1;
  const currentLine = before.slice(lineStart);
  const restOfLine = after.split("\n")[0];

  if (isEmptyListLine(currentLine + restOfLine) && !restOfLine.trim()) {
    return before.slice(0, lineStart) + after.slice(restOfLine.length);
  }
  return before + "\n" + nextListPrefix(currentLine) + content + after;
}

/** Where the cursor goes after insertListLine: right after what was inserted (or where the bullet was removed). */
export function cursorAfterInsert(before: string, after: string, pos: number): number {
  return Math.max(0, Math.min(after.length, pos + (after.length - before.length)));
}
