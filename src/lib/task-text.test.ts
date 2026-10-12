import { describe, it, expect } from "vitest";
import { appendListLine, insertListLine, nextTextFileName } from "./task-text";

describe("nextTextFileName", () => {
  it("returns Writing-1.txt for empty list", () => {
    expect(nextTextFileName([])).toBe("Writing-1.txt");
  });

  it("returns Writing-2.txt when Writing-1.txt exists", () => {
    expect(nextTextFileName([{ file_name: "Writing-1.txt" }])).toBe("Writing-2.txt");
  });

  it("continues sequence from highest number", () => {
    expect(
      nextTextFileName([
        { file_name: "Writing-1.txt" },
        { file_name: "Writing-3.txt" },
        { file_name: "Writing-2.txt" },
      ])
    ).toBe("Writing-4.txt");
  });

  it("ignores non-Writing-N.txt files", () => {
    expect(
      nextTextFileName([
        { file_name: "Writing-1.txt" },
        { file_name: "document.txt" },
        { file_name: "Writing.txt" },
        { file_name: "WritingStuff.txt" },
      ])
    ).toBe("Writing-2.txt");
  });
});

describe("appendListLine", () => {
  it("returns content when text empty", () => {
    expect(appendListLine("", "hello")).toBe("hello");
    expect(appendListLine("   ", "hello")).toBe("hello");
  });

  it("continues bullet list", () => {
    expect(appendListLine("- item 1", "item 2")).toBe("- item 1\n- item 2");
  });

  it("continues numbered list", () => {
    expect(appendListLine("1. first", "second")).toBe("1. first\n1. second");
  });

  it("adds plain line after non-list", () => {
    expect(appendListLine("hello", "world")).toBe("hello\nworld");
  });

  it("handles empty content", () => {
    expect(appendListLine("- item", "")).toBe("- item\n- ");
  });
});

describe("insertListLine", () => {
  it("inserts new line at cursor", () => {
    const text = "abc";
    expect(insertListLine(text, 2, "")).toBe("ab\nc");
  });

  it("continues list when cursor on list line", () => {
    const text = "- item 1";
    expect(insertListLine(text, 8, "")).toBe("- item 1\n- ");
  });

  it("inserts plain line when not on list", () => {
    const text = "plain text";
    expect(insertListLine(text, 5, "")).toBe("plain\n text");
  });

  it("handles cursor at start", () => {
    expect(insertListLine("text", 0, "")).toBe("\ntext");
  });

  it("preserves content after cursor", () => {
    expect(insertListLine("- abc", 3, "")).toBe("- a\n- bc");
  });
});

describe("edge cases", () => {
  it("handles 20000 character text", () => {
    const text = "a".repeat(20000);
    expect(text.length).toBe(20000);
    expect(appendListLine(text, "b")).toContain("b");
  });

  it("handles text exactly at limit", () => {
    const text = "x".repeat(19995);
    const result = appendListLine(text, "end");
    expect(result.length).toBeLessThanOrEqual(20001);
  });
});
