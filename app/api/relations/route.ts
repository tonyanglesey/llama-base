import { NextRequest, NextResponse } from "next/server";
import { getAdapter } from "@/lib/adapters";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Tables + foreign-key edges for one database (schema map). */
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
    const { tables, foreignKeys } = await getAdapter().relations(db);
    return NextResponse.json({ ok: true, tables, foreignKeys });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "unknown error" },
      { status: 500 }
    );
  }
}
