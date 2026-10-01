import { describe, expect, it } from "vitest";
import { checkArgs, redactArgs, type JsonSchema } from "./args";
import { checkJarvisToken } from "./auth";

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
