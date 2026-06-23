import { NextRequest, NextResponse } from "next/server";
import { getAdapter } from "@/lib/adapters";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Run arbitrary SQL against one database. Guards, in order:
 *   1. read-only mode  -> block anything that looks mutating
 *   2. destructive-op  -> DROP/TRUNCATE/ALTER/unscoped DELETE|UPDATE need an
 *                          explicit `confirmed: true` from the client
 * Guard/exec failures come back as 200 + { ok:false } so the editor renders
 * them inline instead of throwing.
 */
export async function POST(req: NextRequest) {
  let body: {
    database?: string;
    sql?: string;
    readOnly?: boolean;
    confirmed?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid JSON body" },
      { status: 400 }
    );
  }

  const { database, sql, readOnly = true, confirmed = false } = body;
  if (!database)
    return NextResponse.json(
      { ok: false, error: "database is required" },
      { status: 400 }
    );
  if (!sql || !sql.trim())
    return NextResponse.json(
      { ok: false, error: "sql is required" },
      { status: 400 }
    );

  const adapter = getAdapter();

  if (readOnly && adapter.isMutating(sql)) {
    return NextResponse.json({
      ok: false,
      error:
        "Read-only mode is ON — mutating statements are blocked. Switch to write mode to run this.",
    });
  }

  if (!confirmed && adapter.needsConfirm(sql)) {
    return NextResponse.json({
      ok: false,
      needsConfirm: true,
      error:
        "This is a destructive statement (DROP / TRUNCATE / ALTER, or an unscoped DELETE/UPDATE). Confirm to run it.",
    });
  }

  try {
    const started = Date.now();
    const result = await adapter.runQuery({ database, sql, readOnly, params: [] });
    return NextResponse.json({ ok: true, ...result, ms: Date.now() - started });
  } catch (err) {
    return NextResponse.json({
      ok: false,
      error: err instanceof Error ? err.message : "query failed",
    });
  }
}
