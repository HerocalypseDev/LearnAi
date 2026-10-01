import type { NextRequest } from "next/server";
import { buildCsv } from "@/lib/exports";
import { getCurrentUser } from "@/lib/session";

export async function GET(_req: NextRequest, ctx: RouteContext<"/admin/export/[kind]">) {
  const user = await getCurrentUser();
  if (user?.role !== "admin") return new Response("Not allowed", { status: 403 });
  const { kind } = await ctx.params;

  const csv = await buildCsv(kind);
  if (csv === null) return new Response("Not found", { status: 404 });
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${kind}"`,
      "Cache-Control": "no-store",
    },
  });
}
