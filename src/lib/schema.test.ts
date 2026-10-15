import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { attendanceDateProblem, calendarDate, lateDaysAfterUpload, MAX_FILES } from "./rules";

// The upload rules live twice: in the app (src/app/actions/student.ts) and in the database trigger. These checks
// keep the SQL files in step with each other and with MAX_FILES.

const sql = (file: string) => readFileSync(join(__dirname, "../../supabase", file), "utf8");
const triggerBlock = (src: string) => {
  const start = src.indexOf("create or replace function enforce_upload_rules()");
  const end = src.indexOf("for each row execute function enforce_upload_rules();");
  expect(start, "function").toBeGreaterThanOrEqual(0);
  expect(end, "trigger").toBeGreaterThan(start);
  return src.slice(start, end).replace(/^\s*--.*$/gm, "").replace(/\s+/g, " ");
};

describe("upload trigger (schema.sql and migrations)", () => {
  const files = ["schema.sql", "migrations/002_integrity.sql", "migrations/003_task_after_handin.sql", "migrations/004_upload_rules.sql"];

  it("is the same in schema.sql and every migration that installs it, so re-running one can't bring back an old rule", () => {
    const blocks = files.map((f) => triggerBlock(sql(f)));
    for (const b of blocks) expect(b).toBe(blocks[0]);
  });

  it("uses the app's file limit, locks on release and covers edits of written pieces", () => {
    const block = triggerBlock(sql("schema.sql"));
    expect(block).toContain(`file_count >= ${MAX_FILES}`);
    expect(block).toContain("released_at is not null");
    expect(block).toContain("before insert or update of storage_path on uploads");
  });

  it("keeps RLS on for every table and adds no policy", () => {
    const schema = sql("schema.sql");
    const tables = [...schema.matchAll(/create table if not exists (\w+)/g)].map((m) => m[1]);
    for (const t of tables) expect(schema, t).toMatch(new RegExp(`alter table ${t}\\s+enable row level security`));
    expect(schema).not.toMatch(/create policy/i);
  });
});

describe("answers trigger", () => {
  const block = (src: string) => {
    const start = src.indexOf("create or replace function enforce_answer_lock()");
    const end = src.indexOf("for each row execute function enforce_answer_lock();");
    expect(start).toBeGreaterThanOrEqual(0);
    return src.slice(start, end).replace(/\s+/g, " ");
  };
  it("is the same in schema.sql and migration 004, and lets marking write points but not change answers", () => {
    const b = block(sql("schema.sql"));
    expect(block(sql("migrations/004_upload_rules.sql"))).toBe(b);
    expect(b).toContain("new.answer_text is distinct from old.answer_text");
    expect(b).not.toMatch(/manual_points|auto_points/);
  });
});

describe("attendanceDateProblem", () => {
  it("accepts class Sundays", () => {
    expect(attendanceDateProblem("2026-10-04")).toBeNull();
    expect(attendanceDateProblem("2026-10-25")).toBeNull();
  });
  it("rejects impossible dates, other days and other formats", () => {
    expect(attendanceDateProblem("2026-02-30")).toMatch(/real date/);
    expect(attendanceDateProblem("2026-13-04")).toMatch(/real date/);
    expect(attendanceDateProblem("2026-10-03")).toMatch(/Sunday/);
    expect(attendanceDateProblem("4/10/2026")).toMatch(/look like/);
  });
});

describe("lateness after hand-in (task files and edited writing)", () => {
  const due = new Date("2026-10-07T21:00:00+01:00");
  it("an edit after the deadline raises days late; an earlier one or an on-time edit never lowers it", () => {
    expect(lateDaysAfterUpload(0, due, new Date("2026-10-08T09:00:00+01:00"))).toBe(1);
    expect(lateDaysAfterUpload(2, due, new Date("2026-10-08T09:00:00+01:00"))).toBe(2);
    expect(lateDaysAfterUpload(0, due, new Date("2026-10-07T20:59:00+01:00"))).toBe(0);
  });
});

describe("calendarDate", () => {
  it("never rolls an impossible day into the next month", () => {
    expect(calendarDate("2026-02-31")).toBeNull();
    expect(calendarDate("2028-02-29")?.toISOString()).toBe("2028-02-29T00:00:00.000Z");
    expect(calendarDate("2026-2-3")).toBeNull();
  });
});

describe("performance indexes", () => {
  it("are in schema.sql and in migration 005, so new and older databases get the same ones", () => {
    const names = [...sql("migrations/005_performance.sql").matchAll(/create index if not exists (\w+) on (\w+ \([^)]*\))/g)];
    expect(names.length).toBeGreaterThan(0);
    for (const [, name, target] of names) expect(sql("schema.sql")).toContain(`create index if not exists ${name} on ${target}`);
  });
});

describe("quiz_active_ms()", () => {
  const block = (src: string) => {
    const start = src.indexOf("create or replace function quiz_active_ms()");
    const end = src.indexOf("grant execute on function quiz_active_ms() to service_role;");
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    return src.slice(start, end).replace(/^\s*--.*$/gm, "").replace(/\s+/g, " ");
  };
  it("is the same in schema.sql and migration 005, and only the server's key may call it", () => {
    expect(block(sql("migrations/005_performance.sql"))).toBe(block(sql("schema.sql")));
    expect(block(sql("schema.sql"))).toContain("revoke all on function quiz_active_ms() from public;");
  });
});
