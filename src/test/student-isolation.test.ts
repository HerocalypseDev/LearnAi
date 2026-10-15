import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Guard rails for "students never see answers or teacher-only data". These read the source, so they
// catch a future edit that starts selecting or passing the wrong fields in student-facing code.

const root = join(__dirname, "..");
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
const strip = (src: string) => src.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");

const STUDENT_UI = [...files(join(root, "app/homework")), ...files(join(root, "app/dashboard")), join(root, "lib/student-data.ts")];

describe("student-facing code", () => {
  it("never mentions correct_option or marking_notes", () => {
    for (const file of STUDENT_UI) {
      const src = strip(readFileSync(file, "utf8"));
      expect(src, file).not.toMatch(/correct_option|marking_notes/);
    }
  });

  it("selects explicit question columns for the quiz (no select('*') on quiz_questions)", () => {
    const page = strip(readFileSync(join(root, "app/homework/[id]/page.tsx"), "utf8"));
    expect(page).toMatch(/from\("quiz_questions"\)\s*\.select\("id, version, type, prompt, options, points, position"\)/);
  });

  it("the homework page renders on the server and selects explicit columns everywhere", () => {
    // A client page that loads its data through a server action ships every selected column to the browser
    // (this once leaked the student's password hash, the teacher's marking notes and auto-marked points).
    const page = readFileSync(join(root, "app/homework/[id]/page.tsx"), "utf8");
    expect(page).not.toMatch(/^\s*["']use client["']/);
    for (const file of files(join(root, "app/homework"))) {
      expect(strip(readFileSync(file, "utf8")), file).not.toMatch(/\.select\(\s*["']\*["']\s*\)/);
    }
  });

  it("student pages never pass auto_points or a password hash to the browser", () => {
    for (const file of files(join(root, "app/homework"))) {
      expect(strip(readFileSync(file, "utf8")), file).not.toMatch(/auto_points|password_hash/);
    }
  });

  it("student server actions answer with ok/error only, never question data", () => {
    const src = strip(readFileSync(join(root, "app/actions/student.ts"), "utf8"));
    expect(src).not.toMatch(/return\s*{\s*ok:\s*true,\s*(question|correct|auto_points)/);
  });
});

describe("server actions check who is calling", () => {
  // Every exported action is a public endpoint: the proxy's cookie check is only optimistic, so each one must
  // call requireUser (or requireUserWith) with the right role itself (login/logout excepted).
  const actions: [file: string, role: "admin" | "student"][] = [
    ["app/actions/student.ts", "student"],
    ["app/actions/homework-admin.ts", "admin"],
    ["app/actions/marking.ts", "admin"],
    ["app/actions/admin.ts", "admin"],
    ["app/actions/attendance.ts", "admin"],
  ];
  for (const [file, role] of actions) {
    it(`${file}: every exported action starts with requireUser("${role}")`, () => {
      const src = strip(readFileSync(join(root, file), "utf8"));
      const bodies = src.split(/export async function /).slice(1);
      expect(bodies.length).toBeGreaterThan(0);
      for (const body of bodies) {
        const name = body.slice(0, body.indexOf("("));
        const firstStatement = body.slice(body.indexOf("{", body.indexOf(")")));
        // requireUserWith(role, load) runs the same check, with reads for that user's own id started alongside it.
        expect(firstStatement.slice(0, 200), name).toMatch(new RegExp(`requireUser(With)?\\("${role}"`));
      }
    });
  }
});
