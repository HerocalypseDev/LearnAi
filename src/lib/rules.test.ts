import { describe, expect, it } from "vitest";
import { autoPoints, checkUpload, clampPoints, computeGrade, earnedBadges, quizTotals, daysLate, finalPoints, homeworkStatus, isGradeVisible, latePenalty } from "./rules";
import { fromLagosInputs, toLagosInputs } from "./time";

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

describe("checkUpload", () => {
  it("accepts documents and images under 20MB", () => {
    expect(checkUpload("essay.docx", 1_000_000, 0)).toBeNull();
    expect(checkUpload("game.sb3", 5_000_000, 3)).toBeNull();
    expect(checkUpload("photo.JPG", 20 * 1024 * 1024, 9)).toBeNull();
  });

  it("rejects program files whatever the capitals", () => {
    expect(checkUpload("virus.exe", 100, 0)).toMatch(/program file/);
    expect(checkUpload("script.JS", 100, 0)).toMatch(/program file/);
    expect(checkUpload("app.apk", 100, 0)).toMatch(/program file/);
  });

  it("rejects a 25MB file and an 11th file", () => {
    expect(checkUpload("video.mp4", 25 * 1024 * 1024, 0)).toMatch(/20MB/);
    expect(checkUpload("one-more.png", 100, 10)).toMatch(/up to 10/);
  });
});

describe("autoPoints", () => {
  const mcq = { type: "mcq" as const, correct_option: 2, points: 5 };
  it("gives full points for the right option and zero otherwise", () => {
    expect(autoPoints(mcq, 2)).toBe(5);
    expect(autoPoints(mcq, 1)).toBe(0);
    expect(autoPoints(mcq, null)).toBe(0);
  });
  it("leaves short answers for the admin", () => {
    expect(autoPoints({ type: "short", correct_option: null, points: 10 }, null)).toBeNull();
  });
});

describe("Lagos date inputs", () => {
  it("round-trips 21:00 Lagos time", () => {
    const d = fromLagosInputs("2026-10-07", "21:00");
    expect(d?.toISOString()).toBe("2026-10-07T20:00:00.000Z");
    expect(toLagosInputs(d!)).toEqual({ date: "2026-10-07", time: "21:00" });
  });
  it("rejects junk", () => {
    expect(fromLagosInputs("", "21:00")).toBeNull();
    expect(fromLagosInputs("2026-13-45", "21:00")).toBeNull();
  });
});

describe("computeGrade", () => {
  it("applies the late penalty to quiz + task", () => {
    expect(computeGrade({ quizPoints: 35, taskPoints: 50, daysLate: 0 })).toEqual({ late_penalty: 0, final_points: 85 });
    expect(computeGrade({ quizPoints: 35, taskPoints: 50, daysLate: 1 })).toEqual({ late_penalty: 10, final_points: 75 });
    expect(computeGrade({ quizPoints: 20, taskPoints: 20, daysLate: 7 })).toEqual({ late_penalty: 50, final_points: 0 });
  });
});

describe("clampPoints", () => {
  it("keeps marks inside 0..max", () => {
    expect(clampPoints("45", 30)).toBe(30);
    expect(clampPoints("-3", 30)).toBe(0);
    expect(clampPoints("", 30)).toBe(0);
    expect(clampPoints("12.6", 30)).toBe(13);
    expect(clampPoints("abc", 30)).toBe(0);
  });
});

describe("quizTotals", () => {
  it("adds multiple choice and short answer points separately", () => {
    expect(quizTotals([{ type: "mcq", points: 10 }, { type: "mcq", points: 20 }, { type: "short", points: 10 }])).toEqual({ mcq: 30, short: 10 });
  });
});

describe("earnedBadges", () => {
  const now = new Date("2026-10-20T12:00:00+01:00");
  const item = (over: Partial<Parameters<typeof earnedBadges>[0][number]>) => ({
    dueAt: "2026-10-07T21:00:00+01:00",
    submittedAt: "2026-10-07T20:00:00+01:00",
    daysLate: 0,
    grade: null,
    quizMax: 40,
    ...over,
  });
  const names = (b: ReturnType<typeof earnedBadges>) => b.map((x) => x.name);

  it("gives nothing before any hand-in", () => {
    expect(earnedBadges([item({ submittedAt: null, dueAt: "2026-10-30T21:00:00+01:00" })], now)).toEqual([]);
  });

  it("rewards on-time streaks and good scores", () => {
    const b = names(earnedBadges([item({}), item({}), item({ grade: { quiz_points: 40, final_points: 95 } })], now));
    expect(b).toEqual(["Lift-off", "On the clock", "Never late", "Quiz master", "Superstar"]);
  });

  it("drops Never late after a late hand-in", () => {
    expect(names(earnedBadges([item({}), item({ daysLate: 1 })], now))).not.toContain("Never late");
  });
});
