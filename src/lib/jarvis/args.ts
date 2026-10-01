// Minimal JSON-schema checking for Jarvis tool arguments: enough to give the model a clear
// error when it leaves something out or sends the wrong type. Business rules live in admin-ops.

export interface JsonSchema {
  type: "object";
  properties: Record<string, PropSchema>;
  required?: string[];
  additionalProperties?: boolean;
}

export interface PropSchema {
  type: "string" | "integer" | "number" | "boolean" | "object" | "array";
  description?: string;
  enum?: (string | number)[];
  items?: { type: string };
  additionalProperties?: { type: string };
}

export function checkArgs(schema: JsonSchema, raw: unknown): { ok: true; args: Record<string, unknown> } | { ok: false; error: string } {
  if (raw !== undefined && raw !== null && (typeof raw !== "object" || Array.isArray(raw))) {
    return { ok: false, error: "args must be a JSON object." };
  }
  const args = (raw ?? {}) as Record<string, unknown>;
  for (const key of schema.required ?? []) {
    if (args[key] === undefined || args[key] === null || args[key] === "") return { ok: false, error: `Missing "${key}".` };
  }
  for (const [key, value] of Object.entries(args)) {
    const prop = schema.properties[key];
    if (!prop) return { ok: false, error: `Unknown argument "${key}". Allowed: ${Object.keys(schema.properties).join(", ") || "none"}.` };
    if (value === undefined || value === null) continue;
    const t = prop.type;
    const okType =
      t === "string" ? typeof value === "string"
      : t === "integer" ? Number.isInteger(value)
      : t === "number" ? typeof value === "number" && Number.isFinite(value)
      : t === "boolean" ? typeof value === "boolean"
      : t === "array" ? Array.isArray(value)
      : typeof value === "object" && !Array.isArray(value);
    if (!okType) return { ok: false, error: `"${key}" must be ${t === "integer" ? "a whole number" : `a ${t}`}.` };
    if (prop.enum && !prop.enum.includes(value as string | number)) {
      return { ok: false, error: `"${key}" must be one of: ${prop.enum.join(", ")}.` };
    }
  }
  return { ok: true, args };
}

/** Drop secrets before an argument list is written to the activity log. */
export function redactArgs(args: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(args)) {
    if (/password|token|secret/i.test(k)) out[k] = "[hidden]";
    else if (typeof v === "string" && v.length > 300) out[k] = `${v.slice(0, 300)}…`;
    else out[k] = v;
  }
  return out;
}
