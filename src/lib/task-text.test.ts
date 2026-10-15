import { describe, it, expect } from "vitest";
import { appendListLine, cursorAfterInsert, insertListLine, isListLine, isWritingFileName, lineAt, readDraft, writeDraft, nextListPrefix, nextTextFileName, textProblem } from "./task-text";

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

  it("continues numbered list with the next number", () => {
    expect(appendListLine("1. first", "second")).toBe("1. first\n2. second");
    expect(appendListLine("9. ninth", "")).toBe("9. ninth\n10. ");
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

describe("Writing-N.txt names", () => {
  it("only the server's names count as written pieces", () => {
    expect(isWritingFileName("Writing-1.txt")).toBe(true);
    expect(isWritingFileName("Writing-12.txt")).toBe(true);
    expect(isWritingFileName("writing-1.txt")).toBe(false);
    expect(isWritingFileName("Writing-1.txt.exe")).toBe(false);
    expect(isWritingFileName("notes.txt")).toBe(false);
  });
  it("gaps are not reused, so a removed Writing-2 never comes back as a different text", () => {
    expect(nextTextFileName([{ file_name: "Writing-1.txt" }, { file_name: "Writing-3.txt" }])).toBe("Writing-4.txt");
  });
});

describe("textProblem", () => {
  it("rejects empty and whitespace-only text", () => {
    expect(textProblem("")).toMatch(/Write something/);
    expect(textProblem("  \n\t ")).toMatch(/Write something/);
  });
  it("allows exactly 20,000 characters and rejects 20,001", () => {
    expect(textProblem("a".repeat(20_000))).toBeNull();
    expect(textProblem("a".repeat(20_001))).toMatch(/20,000/);
  });
});

describe("list editing", () => {
  it("knows bullets, stars and numbers, keeping indentation", () => {
    expect(nextListPrefix("- a")).toBe("- ");
    expect(nextListPrefix("* a")).toBe("* ");
    expect(nextListPrefix("  - nested")).toBe("  - ");
    expect(nextListPrefix("3. c")).toBe("4. ");
    expect(nextListPrefix("plain")).toBe("");
    expect(nextListPrefix("1.5 apples")).toBe("");
    expect(nextListPrefix("-5 degrees")).toBe("");
  });
  it("Enter in a numbered list counts up", () => {
    expect(insertListLine("1. one", 6, "")).toBe("1. one\n2. ");
  });
  it("Enter on an empty item ends the list instead of adding another bullet", () => {
    expect(insertListLine("- a\n- ", 6, "")).toBe("- a\n");
    expect(insertListLine("1. a\n2. ", 8, "")).toBe("1. a\n");
  });
  it("Enter on a plain line after a list is a plain new line", () => {
    expect(insertListLine("- a\ntext", 8, "")).toBe("- a\ntext\n");
  });
  it("puts the cursor right after the new bullet", () => {
    const before = "- a";
    const after = insertListLine(before, 3, "");
    expect(after.slice(0, cursorAfterInsert(before, after, 3))).toBe("- a\n- ");
  });
  it("puts the cursor where the removed bullet was", () => {
    const before = "- a\n- ";
    const after = insertListLine(before, 6, "");
    expect(cursorAfterInsert(before, after, 6)).toBe(4);
  });
});

describe("lineAt / isListLine (which Enter presses the editor takes over)", () => {
  it("finds the whole line around the cursor, including at the very start", () => {
    expect(lineAt("\n- a", 0)).toBe("");
    expect(lineAt("one\n- two\nthree", 5)).toBe("- two");
    expect(lineAt("abc", 3)).toBe("abc");
  });
  it("only list items are list lines", () => {
    expect(isListLine("- a")).toBe(true);
    expect(isListLine("  12. a")).toBe(true);
    expect(isListLine("-")).toBe(false);
    expect(isListLine("hello - world")).toBe(false);
  });
});

describe("drafts", () => {
  it("restores a draft started from the same text", () => {
    expect(readDraft(writeDraft("new words", "old words"), "old words")).toBe("new words");
    expect(readDraft(writeDraft("first try", ""), "")).toBe("first try");
  });
  it("ignores a draft when the stored text changed since (saved later from another device)", () => {
    expect(readDraft(writeDraft("new words", "old words"), "edited elsewhere")).toBeNull();
  });
  it("handles nothing stored, and old plain-text drafts only for a new piece", () => {
    expect(readDraft(null, "")).toBeNull();
    expect(readDraft("plain old draft", "")).toBe("plain old draft");
    expect(readDraft("plain old draft", "saved text")).toBeNull();
  });
});
