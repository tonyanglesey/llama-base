import { NextRequest, NextResponse } from "next/server";
import { getAdapter } from "@/lib/adapters";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Overview dashboard data for one database: stats + largest tables + advisors. */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const db = searchParams.get("db");
  if (!db) {
    return NextResponse.json(
      { ok: false, error: "query param 'db' is required" },
      { status: 400 }
    );
  }

  try {
    const adapter = getAdapter();
    const [stats, tables, advisors] = await Promise.all([
      adapter.databaseStats(db),
      adapter.tableSizes(db, 8),
      adapter.advisors(db),
    ]);
    return NextResponse.json({ ok: true, stats, tables, advisors });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "unknown error" },
      { status: 500 }
    );
  }
}
