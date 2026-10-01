import { describe, expect, it } from "vitest";
import { checkArgs, redactArgs, type JsonSchema } from "./args";
import { checkJarvisToken } from "./auth";
import { MAX_BODY_BYTES, parseJarvisBody } from "./body";

const TOKEN = "x".repeat(40);

describe("checkJarvisToken", () => {
  it("is off when no token (or a short one) is configured", () => {
    expect(checkJarvisToken(`Bearer ${TOKEN}`, undefined)).toBe("disabled");
    expect(checkJarvisToken("Bearer short", "short")).toBe("disabled");
  });
  it("accepts only the exact bearer token", () => {
    expect(checkJarvisToken(`Bearer ${TOKEN}`, TOKEN)).toBe("ok");
    expect(checkJarvisToken(`bearer ${TOKEN}`, TOKEN)).toBe("ok");
    expect(checkJarvisToken(`Bearer ${TOKEN}y`, TOKEN)).toBe("denied");
    expect(checkJarvisToken(TOKEN, TOKEN)).toBe("denied");
    expect(checkJarvisToken(null, TOKEN)).toBe("denied");
  });
});

describe("checkArgs", () => {
  const schema: JsonSchema = {
    type: "object",
    properties: {
      student: { type: "string" },
      points: { type: "integer" },
      release: { type: "string", enum: ["keep", "release", "hide"] },
      scores: { type: "object" },
    },
    required: ["student"],
  };
  it("accepts good arguments", () => {
    expect(checkArgs(schema, { student: "james", points: 8, release: "release", scores: { a: 1 } }).ok).toBe(true);
  });
  it("explains what is wrong", () => {
    expect(checkArgs(schema, {})).toEqual({ ok: false, error: 'Missing "student".' });
    expect(checkArgs(schema, { student: "j", points: 1.5 })).toEqual({ ok: false, error: '"points" must be a whole number.' });
    expect(checkArgs(schema, { student: "j", release: "now" })).toMatchObject({ ok: false });
    expect(checkArgs(schema, { student: "j", extra: 1 })).toMatchObject({ ok: false });
    expect(checkArgs(schema, [1])).toMatchObject({ ok: false });
  });
});

describe("redactArgs", () => {
  it("hides passwords and trims long text", () => {
    const out = redactArgs({ password: "hunter22", comment: "a".repeat(400), student: "peter" });
    expect(out.password).toBe("[hidden]");
    expect(String(out.comment).length).toBeLessThan(310);
    expect(out.student).toBe("peter");
  });
});

describe("parseJarvisBody", () => {
  it("accepts a tool call", () => {
    expect(parseJarvisBody('{"tool":"get_overview","args":{}}')).toEqual({ ok: true, tool: "get_overview", args: {} });
    expect(parseJarvisBody('{"tool":" list_students "}')).toEqual({ ok: true, tool: "list_students", args: undefined });
  });
  it("rejects bodies that aren't a JSON object with a tool name", () => {
    for (const raw of ["", "not json", "null", "[1,2]", "42", '{"args":{}}', '{"tool":5}', `{"tool":"${"x".repeat(65)}"}`]) {
      const r = parseJarvisBody(raw);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.status).toBe(400);
    }
  });
  it("rejects oversized bodies, by header or by actual size", () => {
    expect(parseJarvisBody("{}", String(MAX_BODY_BYTES + 1))).toMatchObject({ ok: false, status: 413 });
    expect(parseJarvisBody(`{"tool":"x","args":{"t":"${"a".repeat(MAX_BODY_BYTES)}"}}`)).toMatchObject({ ok: false, status: 413 });
  });
});
