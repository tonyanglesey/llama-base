import { NextRequest, NextResponse } from "next/server";
import { getAdapter } from "@/lib/adapters";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * One endpoint, three depths of the schema tree, chosen by query params:
 *   ?db=X                     -> schemas in X
 *   ?db=X&schema=Y            -> tables/views in Y
 *   ?db=X&schema=Y&table=Z    -> columns of Z
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const db = searchParams.get("db");
  const schema = searchParams.get("schema");
  const table = searchParams.get("table");

  if (!db) {
    return NextResponse.json(
      { ok: false, error: "query param 'db' is required" },
      { status: 400 }
    );
  }

  try {
    const adapter = getAdapter();
    if (schema && table) {
      return NextResponse.json({
        ok: true,
        columns: await adapter.listColumns(db, schema, table),
      });
    }
    if (schema) {
      return NextResponse.json({
        ok: true,
        tables: await adapter.listTables(db, schema),
      });
    }
    return NextResponse.json({ ok: true, schemas: await adapter.listSchemas(db) });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "unknown error" },
      { status: 500 }
    );
  }
}
