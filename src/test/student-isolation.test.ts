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

  it("student server actions answer with ok/error only, never question data", () => {
    const src = strip(readFileSync(join(root, "app/actions/student.ts"), "utf8"));
    expect(src).not.toMatch(/return\s*{\s*ok:\s*true,\s*(question|correct|auto_points)/);
  });
});
