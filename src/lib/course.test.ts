import { describe, expect, it } from "vitest";
import { CLASS_SUNDAYS, COURSE_OUTLINE, currentWeekIndex, lagosToday } from "./course";

describe("course outline", () => {
  it("has one entry per class Sunday, in step with CLASS_SUNDAYS", () => {
    expect(COURSE_OUTLINE.map((w) => w.date)).toEqual(CLASS_SUNDAYS);
    expect(COURSE_OUTLINE.map((w) => w.week)).toEqual([1, 2, 3, 4]);
  });

  it("finds the current week from the Lagos date", () => {
    expect(currentWeekIndex("2026-10-01")).toBe(-1); // before the first class
    expect(currentWeekIndex("2026-10-04")).toBe(0);
    expect(currentWeekIndex("2026-10-10")).toBe(0);
    expect(currentWeekIndex("2026-10-11")).toBe(1);
    expect(currentWeekIndex("2026-10-25")).toBe(3);
    expect(currentWeekIndex("2026-11-30")).toBe(3); // stays on the last week
  });

  it("uses the Lagos day, not UTC", () => {
    // 23:30 UTC on Saturday 3 Oct is already 00:30 on Sunday 4 Oct in Lagos (+01:00).
    expect(lagosToday(new Date("2026-10-03T23:30:00Z"))).toBe("2026-10-04");
  });
});
