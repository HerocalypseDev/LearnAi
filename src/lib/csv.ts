/** Build a CSV string (Excel-friendly, with a BOM so names with accents open correctly). */
export function toCsv(header: string[], rows: (string | number | boolean | null | undefined)[][]): string {
  const cell = (v: string | number | boolean | null | undefined) => {
    const s = v === null || v === undefined ? "" : String(v);
    // Quote when needed; neutralise leading =,+,-,@ so spreadsheets don't run it as a formula.
    const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
    return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  return "﻿" + [header, ...rows].map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}

/** A safe download name that always ends in .csv (only letters, digits, dash and underscore survive). */
export function csvFileName(kind: string): string {
  const base = kind.replace(/\.csv$/i, "").replace(/[^A-Za-z0-9_-]+/g, "_").slice(0, 60) || "export";
  return `${base}.csv`;
}
