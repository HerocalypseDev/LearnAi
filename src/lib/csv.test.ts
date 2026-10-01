import { describe, expect, it } from "vitest";
import { toCsv } from "./csv";

describe("toCsv", () => {
  it("quotes commas, quotes and new lines, and blocks spreadsheet formulas", () => {
    const csv = toCsv(["a", "b"], [["x, y", 'say "hi"'], ["=SUM(A1)", null], ["line\nbreak", 5]]);
    expect(csv).toBe('﻿a,b\r\n"x, y","say ""hi"""\r\n\'=SUM(A1),\r\n"line\nbreak",5\r\n');
  });
});
