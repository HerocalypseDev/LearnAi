import { describe, expect, it } from "vitest";
import { daysLate, finalPoints, homeworkStatus, isGradeVisible, latePenalty } from "./rules";

// Wednesday 7 Oct 2026, 21:00 in Lagos (UTC+1) = 20:00 UTC.
const due = new Date("2026-10-07T21:00:00+01:00");

describe("daysLate", () => {
  it("is 0 at or before the deadline", () => {
    expect(daysLate(due, new Date("2026-10-07T20:59:59+01:00"))).toBe(0);
    expect(daysLate(due, due)).toBe(0);
  });

  it("counts any started day, so 21:01 is 1 day late", () => {
    expect(daysLate(due, new Date("2026-10-07T21:01:00+01:00"))).toBe(1);
    expect(daysLate(due, new Date("2026-10-08T21:00:00+01:00"))).toBe(1);
    expect(daysLate(due, new Date("2026-10-08T21:00:01+01:00"))).toBe(2);
  });
});

describe("latePenalty", () => {
  it("loses 10 points per started day, capped at 50", () => {
    expect(latePenalty(0)).toBe(0);
    expect(latePenalty(1)).toBe(10);
    expect(latePenalty(5)).toBe(50);
    expect(latePenalty(9)).toBe(50);
  });

  it("uses the admin's settings when given", () => {
    expect(latePenalty(2, 5, 20)).toBe(10);
    expect(latePenalty(10, 5, 20)).toBe(20);
  });
});

describe("finalPoints", () => {
  it("subtracts the penalty but never goes below zero", () => {
    expect(finalPoints(30, 50, 10)).toBe(70);
    expect(finalPoints(10, 20, 50)).toBe(0);
  });
});

describe("isGradeVisible", () => {
  const released = new Date("2026-10-07T10:00:00+01:00");
  it("stays hidden before the deadline even if released", () => {
    expect(isGradeVisible(due, released, new Date("2026-10-07T20:00:00+01:00"))).toBe(false);
  });
  it("stays hidden after the deadline until released", () => {
    expect(isGradeVisible(due, null, new Date("2026-10-08T10:00:00+01:00"))).toBe(false);
  });
  it("shows after the deadline once released", () => {
    expect(isGradeVisible(due, released, new Date("2026-10-07T21:00:01+01:00"))).toBe(true);
  });
});

describe("homeworkStatus", () => {
  const before = new Date("2026-10-06T12:00:00+01:00");
  const after = new Date("2026-10-08T12:00:00+01:00");

  it("is upcoming / in progress before the deadline", () => {
    expect(homeworkStatus(due, null, before)).toBe("upcoming");
    expect(homeworkStatus(due, { status: "draft", submitted_at: null }, before)).toBe("in_progress");
  });

  it("is missing after the deadline if not submitted", () => {
    expect(homeworkStatus(due, null, after)).toBe("missing");
    expect(homeworkStatus(due, { status: "draft", submitted_at: null }, after)).toBe("missing");
  });

  it("is submitted or late once handed in", () => {
    expect(homeworkStatus(due, { status: "submitted", submitted_at: "2026-10-07T20:00:00+01:00" }, after)).toBe("submitted");
    expect(homeworkStatus(due, { status: "submitted", submitted_at: "2026-10-07T21:01:00+01:00" }, after)).toBe("late");
  });
});
