import { describe, expect, it } from "vitest";
import { redactArgs } from "./args";
import { TOOLS } from "./tools";

// GET /api/jarvis publishes this list and Jarvis's MCP server registers tools from it. If you change a
// name, a writes flag or a required argument on purpose, update this table, the integration plan
// (docs/JARVIS_INTEGRATION_PLAN.md) and tell the Jarvis side.
const CONTRACT: [name: string, writes: boolean, required: string[]][] = [
  ["get_overview", false, []],
  ["list_students", false, []],
  ["list_homeworks", false, []],
  ["get_homework", false, ["homework_id"]],
  ["get_submission", false, ["homework_id", "student"]],
  ["list_to_mark", false, []],
  ["get_attendance", false, []],
  ["get_activity", false, []],
  ["get_settings", false, []],
  ["export_csv", false, ["kind"]],
  ["create_homework", true, ["title", "week", "due_date"]],
  ["update_homework", true, ["homework_id"]],
  ["delete_homework", true, ["homework_id", "confirm_title"]],
  ["add_question", true, ["homework_id", "type", "prompt"]],
  ["update_question", true, ["question_id"]],
  ["delete_question", true, ["question_id"]],
  ["save_marks", true, ["homework_id", "student"]],
  ["set_release", true, ["homework_id", "released"]],
  ["set_attendance", true, ["date", "student", "status"]],
  ["update_settings", true, ["late_penalty_per_day", "late_penalty_cap"]],
  ["set_student_password", true, ["student", "password"]],
];

describe("Jarvis tool contract", () => {
  it("matches the frozen list of names, writes flags and required arguments", () => {
    const actual = TOOLS.map((t) => [t.name, t.writes, [...(t.input_schema.required ?? [])]]);
    expect(actual).toEqual(CONTRACT);
  });

  it("has unique names and an object schema for every tool", () => {
    expect(new Set(TOOLS.map((t) => t.name)).size).toBe(TOOLS.length);
    for (const t of TOOLS) expect(t.input_schema.type).toBe("object");
  });

  it("keeps the warning on set_student_password", () => {
    const t = TOOLS.find((x) => x.name === "set_student_password");
    expect(t?.description).toMatch(/password/i);
    expect(t?.description).toMatch(/only|never|confirm|ask|explicit/i);
  });
});

describe("redactArgs", () => {
  it("hides password-like fields in the activity log", () => {
    const out = redactArgs({ student: "peter", password: "hunter2hunter2", api_token: "t", client_secret: "s" });
    expect(out).toEqual({ student: "peter", password: "[hidden]", api_token: "[hidden]", client_secret: "[hidden]" });
  });
});
