"use client";

import { useEffect, useState } from "react";
import SchemaMap from "@/components/SchemaMap";

type Stats = {
  sizeBytes: number;
  sizePretty: string;
  version: string;
  uptimeSeconds: number;
  connections: number;
  maxConnections: number;
  tableCount: number;
  indexCount: number;
  estRows: number;
};
type TableSize = { schema: string; name: string; bytes: number; pretty: string };
type Advisors = {
  unusedIndexes: number;
  vacuumTables: number;
  tablesWithoutPk: number;
  cacheHitRatio: number | null;
};
type Resp =
  | { ok: true; stats: Stats; tables: TableSize[]; advisors: Advisors }
  | { ok: false; error: string };

export default function Overview({
  db,
  onOpenTable,
}: {
  db: string;
  onOpenTable?: (schema: string, table: string) => void;
}) {
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setData(null);
    fetch(`/api/overview?db=${encodeURIComponent(db)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d: Resp) => setData(d))
      .catch((e) =>
        setData({ ok: false, error: e instanceof Error ? e.message : "failed" })
      )
      .finally(() => setLoading(false));
  }, [db]);

  return (
    <div className="h-full overflow-auto p-6">
      <div className="mb-5 flex items-baseline gap-3">
        <h2 className="font-mono text-sm text-[var(--muted)]">
          {db} / <span className="text-[var(--fg)]">overview</span>
        </h2>
        {data?.ok && (
          <span className="ml-auto font-mono text-[11px] text-[var(--muted)]">
            postgres {data.stats.version} · up {fmtUptime(data.stats.uptimeSeconds)}
          </span>
        )}
      </div>

      {loading && (
        <p className="font-mono text-sm text-[var(--muted)]">reading catalog…</p>
      )}
      {data && !data.ok && (
        <pre className="overflow-auto rounded bg-[var(--code)] p-3 font-mono text-xs text-[var(--danger)]">
          {data.error}
        </pre>
      )}

      {data?.ok && (
        <>
          <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            <Stat label="size" value={data.stats.sizePretty} />
            <Stat label="tables" value={fmtNum(data.stats.tableCount)} />
            <Stat label="rows ≈" value={fmtCompact(data.stats.estRows)} />
            <Stat label="indexes" value={fmtNum(data.stats.indexCount)} />
            <Stat
              label="conns"
              value={`${data.stats.connections}`}
              sub={`/${data.stats.maxConnections}`}
            />
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <Panel title="largest tables">
              {data.tables.length === 0 && (
                <p className="font-mono text-xs italic text-[var(--muted)]">
                  no tables
                </p>
              )}
              <div className="flex flex-col gap-2">
                {data.tables.map((t, i) => {
                  const max = data.tables[0]?.bytes || 1;
                  const pct = Math.max(2, Math.round((t.bytes / max) * 100));
                  return (
                    <button
                      key={`${t.schema}.${t.name}`}
                      onClick={() => onOpenTable?.(t.schema, t.name)}
                      className="group text-left"
                      title="open table"
                    >
                      <div className="mb-0.5 flex justify-between font-mono text-[11px]">
                        <span className="truncate text-[var(--fg)] group-hover:text-[var(--accent-ink)]">
                          {t.schema === "public" ? t.name : `${t.schema}.${t.name}`}
                        </span>
                        <span className="ml-2 shrink-0 text-[var(--muted)]">
                          {t.pretty}
                        </span>
                      </div>
                      <div className="h-[5px] rounded-full bg-[var(--hover)]">
                        <div
                          className="h-[5px] rounded-full bg-[var(--accent)]"
                          style={{ width: `${pct}%`, opacity: i < 2 ? 1 : 0.6 }}
                        />
                      </div>
                    </button>
                  );
                })}
              </div>
            </Panel>

            <div className="grid gap-3">
              <Panel title="advisors">
                <div className="flex flex-col gap-2 font-mono text-[11px]">
                  <Advisor
                    sev={data.advisors.unusedIndexes > 0 ? "warn" : "ok"}
                    text={`${data.advisors.unusedIndexes} unused indexes`}
                    note="never scanned"
                  />
                  <Advisor
                    sev={data.advisors.vacuumTables > 0 ? "warn" : "ok"}
                    text={`${data.advisors.vacuumTables} tables need vacuum`}
                    note="dead tuples high"
                  />
                  <Advisor
                    sev={data.advisors.tablesWithoutPk > 0 ? "bad" : "ok"}
                    text={`${data.advisors.tablesWithoutPk} tables without a primary key`}
                  />
                  <Advisor
                    sev={
                      data.advisors.cacheHitRatio == null
                        ? "ok"
                        : data.advisors.cacheHitRatio >= 95
                        ? "ok"
                        : "warn"
                    }
                    text={`cache hit ratio ${
                      data.advisors.cacheHitRatio ?? "—"
                    }%`}
                    note={
                      data.advisors.cacheHitRatio != null &&
                      data.advisors.cacheHitRatio >= 95
                        ? "healthy"
                        : undefined
                    }
                  />
                </div>
              </Panel>

              <Panel title="trends" pro>
                <svg viewBox="0 0 240 44" className="w-full" aria-hidden="true">
                  <polyline
                    points="0,38 30,34 60,36 90,27 120,24 150,17 180,19 210,10 240,5"
                    fill="none"
                    stroke="var(--accent)"
                    strokeOpacity="0.35"
                    strokeWidth="1.5"
                  />
                </svg>
                <p className="mt-1 font-mono text-[10px] text-[var(--muted)]">
                  row growth · query latency · size over time
                </p>
                <p className="mt-1.5 font-mono text-[10px] text-[var(--muted)]">
                  OSS shows <span className="text-[var(--fg)]">now</span> — PRO
                  records the timeline.
                </p>
              </Panel>
            </div>
          </div>

          <div className="mt-3">
            <SchemaMap db={db} />
          </div>
        </>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-lg bg-[var(--panel)] p-3">
      <div className="mb-1 font-mono text-[10px] uppercase tracking-wider text-[var(--muted)]">
        {label}
      </div>
      <div className="font-mono text-xl text-[var(--fg)]">
        {value}
        {sub && <span className="text-xs text-[var(--muted)]">{sub}</span>}
      </div>
    </div>
  );
}

function Panel({
  title,
  pro,
  children,
}: {
  title: string;
  pro?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`rounded-xl border p-3 ${
        pro ? "border-[var(--accent)]/20" : "border-[var(--border)]"
      } bg-[var(--inset)]`}
    >
      <div className="mb-2.5 flex items-center gap-1.5 font-mono text-[11px] text-[var(--muted)]">
        {pro && <span className="text-[var(--muted)]">🔒</span>}
        {title}
        {pro && (
          <span className="ml-auto rounded bg-[var(--accent)] px-1.5 py-0.5 text-[9px] font-semibold tracking-wider text-black">
            PRO
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

function Advisor({
  sev,
  text,
  note,
}: {
  sev: "ok" | "warn" | "bad";
  text: string;
  note?: string;
}) {
  const color =
    sev === "ok"
      ? "var(--accent)"
      : sev === "warn"
      ? "#e9b949"
      : "var(--danger)";
  return (
    <div className="flex items-center gap-2">
      <span
        className="h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ background: color }}
      />
      <span className="text-[var(--fg)]">{text}</span>
      {note && <span className="text-[var(--muted)]">· {note}</span>}
    </div>
  );
}

function fmtNum(n: number): string {
  return n.toLocaleString("en-US");
}
function fmtCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}
function fmtUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  if (d > 0) return `${d}d ${h}h`;
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
