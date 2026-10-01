import type { NextRequest } from "next/server";
import { OpError } from "@/lib/admin-ops";
import { logActivity } from "@/lib/activity";
import { db } from "@/lib/db";
import { checkArgs, redactArgs } from "@/lib/jarvis/args";
import { checkJarvisToken } from "@/lib/jarvis/auth";
import { findTool, revalidateAll, TOOLS } from "@/lib/jarvis/tools";

// Jarvis's door into the app. Every request needs "Authorization: Bearer <JARVIS_API_TOKEN>".
//   GET  /api/jarvis                     -> the list of tools (name, description, input_schema)
//   POST /api/jarvis {"tool", "args"}    -> runs one tool, returns {"ok": true, "result"} or {"ok": false, "error"}
// Off unless JARVIS_API_TOKEN (32+ characters) is set. JARVIS_API_READ_ONLY=1 blocks every tool that changes data.

export const dynamic = "force-dynamic";

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });

function authorize(req: NextRequest): Response | null {
  const result = checkJarvisToken(req.headers.get("authorization"), process.env.JARVIS_API_TOKEN);
  if (result === "disabled") return json({ ok: false, error: "Jarvis access is turned off (JARVIS_API_TOKEN is not set)." }, 503);
  if (result === "denied") return json({ ok: false, error: "Wrong or missing Jarvis token." }, 401);
  return null;
}

const readOnly = () => process.env.JARVIS_API_READ_ONLY === "1";

export async function GET(req: NextRequest) {
  const denied = authorize(req);
  if (denied) return denied;
  return json({
    ok: true,
    app: "AI Class Homework",
    read_only: readOnly(),
    tools: TOOLS.filter((t) => !readOnly() || !t.writes).map(({ name, description, input_schema, writes }) => ({
      name,
      description,
      input_schema,
      writes,
    })),
  });
}

async function adminId(): Promise<string | null> {
  const { data } = await db().from("users").select("id").eq("role", "admin").limit(1).maybeSingle();
  return data?.id ?? null;
}

export async function POST(req: NextRequest) {
  const denied = authorize(req);
  if (denied) return denied;

  let body: { tool?: unknown; args?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: 'Send JSON like {"tool": "get_overview", "args": {}}.' }, 400);
  }

  const tool = findTool(body.tool);
  if (!tool) return json({ ok: false, error: `Unknown tool "${String(body.tool)}". GET /api/jarvis lists them.` }, 404);
  if (tool.writes && readOnly()) return json({ ok: false, error: "Jarvis is in read-only mode (JARVIS_API_READ_ONLY=1)." }, 403);

  const checked = checkArgs(tool.input_schema, body.args);
  if (!checked.ok) return json({ ok: false, error: checked.error }, 400);

  let status = 200;
  let response: { ok: boolean; result?: unknown; error?: string };
  try {
    response = { ok: true, result: await tool.run(checked.args) };
  } catch (e) {
    if (e instanceof OpError) {
      status = e.status;
      response = { ok: false, error: e.message };
    } else {
      console.error(`jarvis tool ${tool.name} failed`, e);
      status = 500;
      response = { ok: false, error: "Something went wrong in the homework app. Check the Vercel logs." };
    }
  }

  // Changes (and failed attempts at them) appear in the admin Activity log as "Jarvis".
  if (tool.writes) {
    const id = await adminId();
    if (id) {
      await logActivity(id, "admin_action", {
        via: "jarvis",
        tool: tool.name,
        ok: response.ok,
        error: response.error,
        args: redactArgs(checked.args),
      });
    }
    if (response.ok) await revalidateAll();
  }

  return json(response, status);
}
