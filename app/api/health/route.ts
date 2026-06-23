import { NextResponse } from "next/server";
import { getAdapter } from "@/lib/adapters";

// pg needs the Node runtime (not edge); never statically cache a health check.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const adapter = getAdapter();
    const info = await adapter.health();
    return NextResponse.json({
      ok: true,
      engine: adapter.engine,
      capabilities: adapter.capabilities,
      version: info.version,
      database: info.database,
      serverTime: info.serverTime,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "unknown error" },
      { status: 500 }
    );
  }
}
