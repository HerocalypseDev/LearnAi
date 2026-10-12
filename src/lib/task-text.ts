// --- Text editor helpers ---

/** Detect if current line is a list item. */
function isListItem(line: string): boolean {
  const trimmed = line.trim();
  return /^[-*] /.test(trimmed) || /^\d+\./.test(trimmed);
}

/** Get list prefix for a line (bullet: "- ", numbered: "1. "). */
function getListPrefix(line: string): string {
  const trimmed = line.trim();
  if (/^- /.test(trimmed)) return "- ";
  if (/^\d+\./.test(trimmed)) {
    const match = trimmed.match(/^\d+\./);
    return match ? `${match[0]} ` : "1. ";
  }
  return "";
}

/** Append new line to text, continuing list if last line is a list item. */
export function appendListLine(text: string, content: string): string {
  if (!text.trim()) return content;
  const lines = text.split("\n");
  const lastLine = lines[lines.length - 1];
  if (!lastLine.trim()) return text + "\n" + content;

  const prefix = getListPrefix(lastLine);
  if (prefix) {
    return text + "\n" + prefix + content;
  }
  return text + "\n" + content;
}

/** Insert new line at cursor position, continuing list if cursor is on a list line. */
export function insertListLine(text: string, pos: number, content: string): string {
  const before = text.slice(0, pos);
  const after = text.slice(pos);
  const lines = before.split("\n");
  const currentLine = lines[lines.length - 1];

  const prefix = getListPrefix(currentLine);
  const newLine = prefix ? prefix + content : content;

  return before + "\n" + newLine + after;
}

/** Generate stable next text filename based on existing text uploads. */
export function nextTextFileName(existing: { file_name: string }[]): string {
  let index = 0;
  for (const u of existing) {
    const match = u.file_name.match(/^Writing-(\d+)\.txt$/);
    if (match) {
      index = Math.max(index, Number.parseInt(match[1], 10));
    }
  }
  return `Writing-${index + 1}.txt`;
}