import { describe, expect, it } from "vitest";
import { csvFileName } from "./csv";
import {
  checkQuestionBudget,
  checkStoredUpload,
  fileExtension,
  hasHandInContent,
  MAX_FILE_BYTES,
  MAX_FILES,
  normalizeMcq,
  PARTS,
  quizScore,
} from "./rules";

const mcq = (id: string, correct: number, points: number) => ({ id, type: "mcq" as const, correct_option: correct, points });
const short = (id: string) => ({ id, type: "short" as const, correct_option: null, points: PARTS.short });

describe("quizScore (marks follow the current questions)", () => {
  const picks = { a: { selected_option: 1, manual_points: null }, s: { selected_option: null, manual_points: 7 } };

  it("re-marks multiple choice when the correct option changes", () => {
    expect(quizScore([mcq("a", 1, 15), short("s")], picks).mcq).toBe(15);
    // The teacher fixes the answer key after the child answered.
    expect(quizScore([mcq("a", 2, 15), short("s")], picks).mcq).toBe(0);
  });

  it("re-marks when the points change and adds the short answer mark", () => {
    expect(quizScore([mcq("a", 1, 20), short("s")], picks)).toEqual({ mcq: 20, short: 7, total: 27 });
  });

  it("an unanswered question earns nothing and the total is capped at the quiz maximum", () => {
    expect(quizScore([mcq("a", 0, 30)], {}).mcq).toBe(0);
    expect(quizScore([mcq("a", 1, 30), short("s")], { a: picks.a, s: { selected_option: null, manual_points: 99 } }).total).toBe(40);
  });
});

describe("uploads: stored names and unknown sizes", () => {
  it("ignores trailing dots and spaces when finding the extension", () => {
    expect(fileExtension("setup.exe.")).toBe("exe");
    expect(fileExtension("setup.EXE ")).toBe("exe");
    expect(fileExtension("notes")).toBe("");
  });

  it("blocks a program file even when the reported name looks harmless", () => {
    const verdict = checkStoredUpload("holiday.png", "0b9e-setup.exe.", 1000, 0);
    expect(verdict?.retryable).toBe(false);
    expect(verdict?.problem).toMatch(/program file/);
  });

  it("an unknown size is a retry, never a guess", () => {
    expect(checkStoredUpload("a.png", "x-a.png", null, 0)).toMatchObject({ retryable: true });
    expect(checkStoredUpload("a.png", "x-a.png", Number.NaN, 0)).toMatchObject({ retryable: true });
  });

  it("enforces the real size and the file count", () => {
    expect(checkStoredUpload("a.png", "x-a.png", MAX_FILE_BYTES, 0)).toBeNull();
    expect(checkStoredUpload("a.png", "x-a.png", MAX_FILE_BYTES + 1, 0)?.retryable).toBe(false);
    expect(checkStoredUpload("a.png", "x-a.png", 5, MAX_FILES)?.problem).toMatch(/up to 10/);
    expect(checkStoredUpload("a.png", "x-a.png", 0, 0)?.problem).toMatch(/empty/);
  });
});

describe("normalizeMcq", () => {
  it("drops blank options and re-points the correct answer", () => {
    expect(normalizeMcq(["", "Paris", " ", "Rome"], 3)).toEqual({ options: ["Paris", "Rome"], correct: 1 });
  });
  it("needs two real options and a correct answer that is one of them", () => {
    expect(normalizeMcq(["Only", ""], 0)).toHaveProperty("error");
    expect(normalizeMcq(["a", "", "c"], 1)).toHaveProperty("error"); // marked option was blank
    expect(normalizeMcq(["a", "b"], "")).toHaveProperty("error"); // nothing chosen is not option 0
    expect(normalizeMcq(["a", "b"], null)).toHaveProperty("error");
    expect(normalizeMcq(["a", "b"], 7)).toHaveProperty("error");
    expect(normalizeMcq(["1", "2", "3", "4", "5", "6", "7"], 0)).toHaveProperty("error");
  });
});

describe("checkQuestionBudget", () => {
  const q = (version: "A" | "B" | "both", type: "mcq" | "short", points: number) => ({ version, type, points });

  it("keeps multiple choice within 30 per version", () => {
    expect(checkQuestionBudget([q("both", "mcq", 20)], q("A", "mcq", 10))).toBeNull();
    expect(checkQuestionBudget([q("both", "mcq", 20)], q("A", "mcq", 11))).toMatch(/version A/);
    // A "both" question counts against both versions.
    expect(checkQuestionBudget([q("B", "mcq", 25)], q("both", "mcq", 10))).toMatch(/version B/);
  });

  it("allows different questions per version", () => {
    expect(checkQuestionBudget([q("A", "mcq", 30)], q("B", "mcq", 30))).toBeNull();
  });

  it("allows only one short answer question per version", () => {
    expect(checkQuestionBudget([q("A", "short", PARTS.short)], q("B", "short", PARTS.short))).toBeNull();
    expect(checkQuestionBudget([q("A", "short", PARTS.short)], q("A", "short", PARTS.short))).toMatch(/already has/);
    expect(checkQuestionBudget([q("both", "short", PARTS.short)], q("B", "short", PARTS.short))).toMatch(/already has/);
  });
});

describe("hasHandInContent (no empty hand-ins)", () => {
  it("needs an answer or a file", () => {
    expect(hasHandInContent([], 0)).toBe(false);
    expect(hasHandInContent([{ selected_option: null, answer_text: "   " }], 0)).toBe(false);
    expect(hasHandInContent([{ selected_option: 0, answer_text: null }], 0)).toBe(true);
    expect(hasHandInContent([{ selected_option: null, answer_text: "because" }], 0)).toBe(true);
    expect(hasHandInContent([], 1)).toBe(true);
  });
});

describe("csvFileName", () => {
  it("always ends in .csv and has no path or header characters", () => {
    expect(csvFileName("scores.csv")).toBe("scores.csv");
    expect(csvFileName('x"; evil=1\r\n')).toBe("x_evil_1_.csv");
    expect(csvFileName("../../etc/passwd")).toBe("_etc_passwd.csv");
    expect(csvFileName("")).toBe("export.csv");
  });
});
