import { NextRequest, NextResponse } from "next/server";
import { getAdapter } from "@/lib/adapters";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const databases = await getAdapter().listDatabases();
    return NextResponse.json({ ok: true, databases });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "unknown error" },
      { status: 500 }
    );
  }
}

// CREATE DATABASE — a database name is an identifier, not a value, so it can't
// be parameterized. We validate it to a strict identifier here (HTTP-level 400)
// and the adapter re-validates + quotes before executing.
const SAFE_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

export async function POST(req: NextRequest) {
  let body: { name?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid JSON body" },
      { status: 400 }
    );
  }

  const name = (body.name ?? "").trim();
  if (!SAFE_NAME.test(name) || name.length > 63) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Invalid name. Use letters, digits and underscores, start with a letter or underscore, max 63 chars.",
      },
      { status: 400 }
    );
  }

  try {
    const adapter = getAdapter();
    await adapter.createDatabase(name);
    const databases = await adapter.listDatabases();
    return NextResponse.json({ ok: true, databases });
  } catch (err) {
    return NextResponse.json({
      ok: false,
      error: err instanceof Error ? err.message : "create failed",
    });
  }
}
