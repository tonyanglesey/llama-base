import { NextRequest, NextResponse } from "next/server";
import { getAdapter, type RowIdentifier } from "@/lib/adapters";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const db = searchParams.get("db");
  const schema = searchParams.get("schema");
  const table = searchParams.get("table");
  if (!db || !schema || !table) {
    return NextResponse.json(
      { ok: false, error: "db, schema and table are required" },
      { status: 400 }
    );
  }

  const limit = Number(searchParams.get("limit") ?? 50);
  const offset = Number(searchParams.get("offset") ?? 0);
  const orderBy = searchParams.get("orderBy");
  const dir = searchParams.get("dir") === "desc" ? "desc" : "asc";

  try {
    const result = await getAdapter().readRows({
      database: db,
      schema,
      table,
      limit,
      offset,
      orderBy,
      dir,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json({
      ok: false,
      error: err instanceof Error ? err.message : "failed to read rows",
    });
  }
}

// --- single-row edits --------------------------------------------------------
// Body for all three carries { db, schema, table, readOnly } plus the payload.
// These are inherently mutating, so read-only mode rejects them outright.

type MutationBody = {
  db?: string;
  schema?: string;
  table?: string;
  readOnly?: boolean;
  values?: Record<string, unknown>; // POST
  set?: Record<string, unknown>; // PATCH
  id?: RowIdentifier; // PATCH / DELETE
};

async function parseBody(
  req: NextRequest
): Promise<
  | { ok: true; body: MutationBody; db: string; schema: string; table: string }
  | { ok: false; res: NextResponse }
> {
  let body: MutationBody;
  try {
    body = (await req.json()) as MutationBody;
  } catch {
    return {
      ok: false,
      res: NextResponse.json(
        { ok: false, error: "invalid JSON body" },
        { status: 400 }
      ),
    };
  }
  const { db, schema, table } = body;
  if (!db || !schema || !table) {
    return {
      ok: false,
      res: NextResponse.json(
        { ok: false, error: "db, schema and table are required" },
        { status: 400 }
      ),
    };
  }
  if (body.readOnly !== false) {
    return {
      ok: false,
      res: NextResponse.json({
        ok: false,
        error: "Read-only mode is ON — switch to write mode to edit data.",
      }),
    };
  }
  return { ok: true, body, db, schema, table };
}

export async function POST(req: NextRequest) {
  const parsed = await parseBody(req);
  if (!parsed.ok) return parsed.res;
  const { body, db, schema, table } = parsed;
  try {
    const result = await getAdapter().insertRow({
      database: db,
      schema,
      table,
      values: body.values ?? {},
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json({
      ok: false,
      error: err instanceof Error ? err.message : "insert failed",
    });
  }
}

export async function PATCH(req: NextRequest) {
  const parsed = await parseBody(req);
  if (!parsed.ok) return parsed.res;
  const { body, db, schema, table } = parsed;
  if (!body.set || !body.id) {
    return NextResponse.json(
      { ok: false, error: "set and id are required" },
      { status: 400 }
    );
  }
  try {
    const result = await getAdapter().updateRow({
      database: db,
      schema,
      table,
      set: body.set,
      id: body.id,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json({
      ok: false,
      error: err instanceof Error ? err.message : "update failed",
    });
  }
}

export async function DELETE(req: NextRequest) {
  const parsed = await parseBody(req);
  if (!parsed.ok) return parsed.res;
  const { body, db, schema, table } = parsed;
  if (!body.id) {
    return NextResponse.json(
      { ok: false, error: "id is required" },
      { status: 400 }
    );
  }
  try {
    const result = await getAdapter().deleteRow({
      database: db,
      schema,
      table,
      id: body.id,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json({
      ok: false,
      error: err instanceof Error ? err.message : "delete failed",
    });
  }
}
