// Parsing the POST /api/jarvis body: small, JSON, and shaped like {"tool": "...", "args": {...}}.

export const MAX_BODY_BYTES = 256 * 1024;

export type ParsedBody = { ok: true; tool: string; args: unknown } | { ok: false; status: 400 | 413; error: string };

export function parseJarvisBody(raw: string, contentLength?: string | null): ParsedBody {
  const declared = Number(contentLength ?? "");
  if ((Number.isFinite(declared) && declared > MAX_BODY_BYTES) || new TextEncoder().encode(raw).length > MAX_BODY_BYTES) {
    return { ok: false, status: 413, error: `Request too large (max ${MAX_BODY_BYTES / 1024} KB).` };
  }
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return { ok: false, status: 400, error: 'Send JSON like {"tool": "get_overview", "args": {}}.' };
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, status: 400, error: 'The body must be a JSON object like {"tool": "get_overview", "args": {}}.' };
  }
  const { tool, args } = value as { tool?: unknown; args?: unknown };
  if (typeof tool !== "string" || !tool.trim() || tool.length > 64) {
    return { ok: false, status: 400, error: 'Say which tool to run: {"tool": "<name>"}.' };
  }
  return { ok: true, tool: tool.trim(), args };
}
