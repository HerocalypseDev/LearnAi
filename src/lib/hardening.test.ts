import { describe, expect, it } from "vitest";
import {
  BLOCKED_EXTENSIONS,
  checkUpload,
  daysLate,
  finalPoints,
  isGradeVisible,
  latePenalty,
  MAX_FILE_BYTES,
  MAX_FILES,
  PARTS,
  passwordProblem,
  quizTotals,
} from "./rules";
import { buildCsp, supabaseOrigin } from "./security-headers";
import {
  passwordVersion,
  sessionMatchesPassword,
  sessionSecretKey,
  signSessionToken,
  verifySessionToken,
} from "./session-token";

const due = new Date("2026-10-07T21:00:00+01:00");
const at = (iso: string) => new Date(iso);

describe("deadline edge cases", () => {
  it("handing in exactly at 21:00:00 is on time; 21:00:00.001 is 1 day late", () => {
    expect(daysLate(due, at("2026-10-07T21:00:00+01:00"))).toBe(0);
    expect(daysLate(due, new Date(due.getTime() + 1))).toBe(1);
  });
  it("exactly 24h late is still 1 day; 24h + 1s is 2 days; 5+ days hits the cap", () => {
    expect(daysLate(due, at("2026-10-08T21:00:00+01:00"))).toBe(1);
    expect(daysLate(due, at("2026-10-08T21:00:01+01:00"))).toBe(2);
    expect(latePenalty(daysLate(due, at("2026-10-12T21:00:01+01:00")))).toBe(50);
  });
  it("final score never goes below zero and never ignores the penalty", () => {
    expect(finalPoints(0, 0, 50)).toBe(0);
    expect(finalPoints(40, 60, 50)).toBe(50);
    expect(finalPoints(40, 60, 0)).toBe(100);
  });
});

describe("grade visibility", () => {
  const released = at("2026-10-07T12:00:00+01:00");
  it("is hidden exactly at the deadline, even if released", () => {
    expect(isGradeVisible(due, released, due)).toBe(false);
  });
  it("needs both: past the deadline AND released", () => {
    const after = at("2026-10-08T09:00:00+01:00");
    const before = at("2026-10-07T20:00:00+01:00");
    expect(isGradeVisible(due, released, after)).toBe(true);
    expect(isGradeVisible(due, null, after)).toBe(false);
    expect(isGradeVisible(due, released, before)).toBe(false);
    expect(isGradeVisible(due, null, before)).toBe(false);
  });
});

describe("points split", () => {
  it("adds up to 100 with a 40-point quiz", () => {
    expect(PARTS.mcq + PARTS.short + PARTS.task).toBe(100);
    expect(PARTS.mcq + PARTS.short).toBe(40);
  });
  it("quizTotals separates multiple choice from short answer", () => {
    expect(quizTotals([])).toEqual({ mcq: 0, short: 0 });
    expect(quizTotals([{ type: "mcq", points: 15 }, { type: "mcq", points: 15 }, { type: "short", points: PARTS.short }])).toEqual({
      mcq: PARTS.mcq,
      short: PARTS.short,
    });
  });
});

describe("uploads", () => {
  it("blocks every listed program extension, in any case, even disguised", () => {
    for (const ext of BLOCKED_EXTENSIONS) {
      expect(checkUpload(`file.${ext}`, 10, 0), ext).toMatch(/program file/);
      expect(checkUpload(`FILE.${ext.toUpperCase()}`, 10, 0), ext).toMatch(/program file/);
    }
    expect(checkUpload("photo.png.exe", 10, 0)).toMatch(/program file/);
  });
  it("allows documents, images, Scratch and files without an extension", () => {
    for (const name of ["essay.docx", "slides.pptx", "scan.pdf", "robot.JPG", "game.sb3", "notes.txt", "README"]) {
      expect(checkUpload(name, 10, 0), name).toBeNull();
    }
  });
  it("enforces the exact size and count limits", () => {
    expect(checkUpload("a.png", MAX_FILE_BYTES, 0)).toBeNull();
    expect(checkUpload("a.png", MAX_FILE_BYTES + 1, 0)).toMatch(/20MB/);
    expect(checkUpload("a.png", 0, 0)).toMatch(/empty/);
    expect(checkUpload("a.png", 10, MAX_FILES - 1)).toBeNull();
    expect(checkUpload("a.png", 10, MAX_FILES)).toMatch(/up to 10/);
  });
});

describe("passwords", () => {
  it("students need 6+, the admin 10+, nobody more than 72 bytes", () => {
    expect(passwordProblem("12345", "student")).toMatch(/at least 6/);
    expect(passwordProblem("123456", "student")).toBeNull();
    expect(passwordProblem("123456789", "admin")).toMatch(/at least 10/);
    expect(passwordProblem("1234567890", "admin")).toBeNull();
    expect(passwordProblem("x".repeat(73), "admin")).toMatch(/at most 72/);
  });
});

describe("sessions", () => {
  const secret = "s".repeat(40);
  const key = sessionSecretKey(secret);
  const hash = "$2b$12$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ012345";

  it("refuses a missing or short SESSION_SECRET", () => {
    expect(() => sessionSecretKey(undefined)).toThrow(/SESSION_SECRET/);
    expect(() => sessionSecretKey("short")).toThrow(/at least 32/);
  });

  it("round-trips a signed token and rejects tampered or wrongly-signed ones", async () => {
    const token = await signSessionToken({ uid: "u1", pv: passwordVersion(hash) }, key);
    expect(await verifySessionToken(token, key)).toEqual({ uid: "u1", pv: passwordVersion(hash) });
    const [h, p, sig] = token.split(".");
    expect(await verifySessionToken(`${h}.${p}.${sig.slice(0, -2)}xx`, key)).toBeNull();
    expect(await verifySessionToken(token, sessionSecretKey("t".repeat(40)))).toBeNull();
    expect(await verifySessionToken("not-a-token", key)).toBeNull();
  });

  it("a password change invalidates sessions issued before it", async () => {
    const payload = (await verifySessionToken(await signSessionToken({ uid: "u1", pv: passwordVersion(hash) }, key), key))!;
    expect(sessionMatchesPassword(payload, hash)).toBe(true);
    expect(sessionMatchesPassword(payload, "$2b$12$abcdefghijklmnopqrstuuDIFFERENTHASHVALUEFORNEWPASSWORDzz")).toBe(false);
    expect(sessionMatchesPassword(payload, null)).toBe(false);
  });
});

describe("content security policy", () => {
  it("allows scripts only with the nonce and blocks framing", () => {
    const csp = buildCsp({ nonce: "abc123", supabase: "https://x.supabase.co", isDev: false });
    expect(csp).toContain("script-src 'self' 'nonce-abc123' 'strict-dynamic'");
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("connect-src 'self' https://x.supabase.co");
    expect(csp).toContain("img-src 'self' data: blob: https://x.supabase.co");
    expect(csp).toContain("upgrade-insecure-requests");
  });
  it("adds unsafe-eval only in development and skips the https upgrade for local http Supabase", () => {
    expect(buildCsp({ nonce: "n", supabase: "https://x.supabase.co", isDev: true })).toContain("'unsafe-eval'");
    expect(buildCsp({ nonce: "n", supabase: "http://127.0.0.1:54321", isDev: false })).not.toContain("upgrade-insecure-requests");
  });
  it("uses the exact Supabase origin, falling back to *.supabase.co", () => {
    expect(supabaseOrigin("https://abc.supabase.co/rest/v1/")).toBe("https://abc.supabase.co");
    expect(supabaseOrigin(undefined)).toBe("https://*.supabase.co");
    expect(supabaseOrigin("not a url")).toBe("https://*.supabase.co");
  });
});
