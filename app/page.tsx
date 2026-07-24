"use client";

import { useCallback, useEffect, useState } from "react";
import AppChrome from "./chrome";
import Sidebar, { type TableRef } from "@/components/Sidebar";
import SqlEditor from "@/components/SqlEditor";
import DataGrid from "@/components/DataGrid";
import Overview from "@/components/Overview";

type Health =
  | {
      ok: true;
      version: string;
      database: string;
      serverTime: string;
      host: string;
      port: number;
    }
  | { ok: false; error: string };

type DbResp = { ok: boolean; databases?: string[]; error?: string };
type View = "overview" | "browse" | "sql";

export default function Page() {
  const [databases, setDatabases] = useState<string[]>([]);
  const [loadingDbs, setLoadingDbs] = useState(true);
  const [dbError, setDbError] = useState<string | null>(null);

  const [selected, setSelected] = useState<TableRef | null>(null);
  const [activeDb, setActiveDb] = useState<string | null>(null);
  const [view, setView] = useState<View>("overview");
  const [readOnly, setReadOnly] = useState(true);
  const [health, setHealth] = useState<Health | null>(null);

  const loadDatabases = useCallback(async () => {
    try {
      const res = await fetch("/api/databases", { cache: "no-store" });
      const data: DbResp = await res.json();
      if (data.ok && data.databases) setDatabases(data.databases);
      else setDbError(data.error ?? "failed to list databases");
    } catch (e) {
      setDbError(e instanceof Error ? e.message : "request failed");
    } finally {
      setLoadingDbs(false);
    }
  }, []);

  useEffect(() => {
    void loadDatabases();
    fetch("/api/health", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: Health) => setHealth(d))
      .catch(() => setHealth({ ok: false, error: "unreachable" }));
  }, [loadDatabases]);

  const createDatabase = useCallback(async (name: string) => {
    const res = await fetch("/api/databases", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const data: DbResp = await res.json();
    if (data.ok && data.databases) {
      setDatabases(data.databases);
      return { ok: true };
    }
    return { ok: false, error: data.error ?? "create failed" };
  }, []);

  return (
    <AppChrome>
      {/* Console toolbar — view tabs, health, read-only/write switch. */}
      <div className="flex items-stretch border-b border-[var(--border)] bg-[var(--panel)]">
        {/* Status block — same width + right border as the sidebar, so the
            tabs beside it line up with the content panel below. */}
        <div className="flex w-72 shrink-0 items-center border-r border-[var(--border)] px-3 py-2.5">
          <HealthDot health={health} />
        </div>

        {/* Tabs + controls sit over the content panel (px-6 matches its p-6). */}
        <div className="flex flex-1 items-center gap-4 px-6 py-2.5">
          <nav className="flex gap-1">
            <Tab active={view === "overview"} onClick={() => setView("overview")}>
              overview
            </Tab>
            <Tab active={view === "browse"} onClick={() => setView("browse")}>
              browse
            </Tab>
            <Tab active={view === "sql"} onClick={() => setView("sql")}>
              sql
            </Tab>
          </nav>

          <div className="ml-auto" />

          <button
            onClick={() => setReadOnly((r) => !r)}
            title="Toggle read-only / write mode"
            className={`rounded border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider transition-colors ${
              readOnly
                ? "border-[var(--border)] text-[var(--muted)] hover:text-[var(--fg)]"
                : "border-[var(--danger)] bg-[var(--danger)]/10 text-[var(--danger)]"
            }`}
          >
            {readOnly ? "● read-only" : "● write mode"}
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <Sidebar
          databases={databases}
          loadingDbs={loadingDbs}
          dbError={dbError}
          selected={selected}
          onSelect={(t) => {
            setSelected(t);
            setActiveDb(t.db);
            setView("browse");
          }}
          onActivateDb={(db) => {
            setActiveDb(db);
            setView("overview");
          }}
          onNewDatabase={createDatabase}
        />

        <main className="min-w-0 flex-1 overflow-hidden">
          {view === "sql" ? (
            <SqlEditor
              databases={databases}
              initialDb={activeDb}
              readOnly={readOnly}
            />
          ) : view === "overview" ? (
            activeDb ? (
              <Overview
                key={activeDb}
                db={activeDb}
                onOpenTable={(schema, table) => {
                  setSelected({ db: activeDb, schema, table, type: "table" });
                  setView("browse");
                }}
              />
            ) : (
              <Welcome />
            )
          ) : selected ? (
            <TableView
              key={`${selected.db}.${selected.schema}.${selected.table}`}
              target={selected}
              readOnly={readOnly}
            />
          ) : (
            <Welcome />
          )}
        </main>
      </div>
    </AppChrome>
  );
}

function HealthDot({ health }: { health: Health | null }) {
  const ok = health?.ok === true;
  return (
    <span className="flex items-center gap-1.5 font-mono text-xs text-[var(--muted)]">
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          health == null
            ? "bg-[var(--muted)]"
            : ok
            ? "bg-[var(--accent)]"
            : "bg-[var(--danger)]"
        }`}
      />
      {health == null ? "connecting…" : ok ? "connected" : "connection failed"}
      {ok && health?.host && (
        <span className="text-[var(--muted)] opacity-70">
          · {health.host}:{health.port}
        </span>
      )}
    </span>
  );
}

function Tab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`cursor-pointer rounded px-2.5 py-1 font-mono text-xs lowercase ${
        active
          ? "bg-[var(--accent)]/10 text-[var(--accent-ink)]"
          : "text-[var(--muted)] hover:text-[var(--fg)]"
      }`}
    >
      {children}
    </button>
  );
}

function TableView({
  target,
  readOnly,
}: {
  target: TableRef;
  readOnly: boolean;
}) {
  const [sub, setSub] = useState<"data" | "columns">("data");
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-[var(--border)] px-4 py-2">
        <div className="font-mono text-xs text-[var(--muted)]">
          {target.db} / {target.schema} /{" "}
          <span className="text-[var(--fg)]">{target.table}</span>
          <span className="ml-2 rounded border border-[var(--border)] px-1 py-0.5 text-[9px] uppercase tracking-wider">
            {target.type}
          </span>
        </div>
        <div className="ml-2 flex gap-1">
          <Tab active={sub === "data"} onClick={() => setSub("data")}>
            data
          </Tab>
          <Tab active={sub === "columns"} onClick={() => setSub("columns")}>
            columns
          </Tab>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {sub === "data" ? (
          <DataGrid target={target} readOnly={readOnly} />
        ) : (
          <TableColumns target={target} />
        )}
      </div>
    </div>
  );
}

type ColumnsResp = {
  ok: boolean;
  columns?: {
    name: string;
    type: string;
    nullable: boolean;
    default: string | null;
  }[];
  error?: string;
};

function TableColumns({ target }: { target: TableRef }) {
  const [resp, setResp] = useState<ColumnsResp | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(
      `/api/schema?db=${encodeURIComponent(target.db)}&schema=${encodeURIComponent(
        target.schema
      )}&table=${encodeURIComponent(target.table)}`,
      { cache: "no-store" }
    )
      .then((r) => r.json())
      .then((d: ColumnsResp) => setResp(d))
      .catch((e) =>
        setResp({ ok: false, error: e instanceof Error ? e.message : "failed" })
      )
      .finally(() => setLoading(false));
  }, [target]);

  return (
    <div className="p-6">
      {loading && (
        <p className="font-mono text-sm text-[var(--muted)]">reading columns…</p>
      )}
      {!loading && resp && !resp.ok && (
        <pre className="overflow-auto rounded bg-[var(--code)] p-3 font-mono text-xs text-[var(--danger)]">
          {resp.error}
        </pre>
      )}
      {!loading && resp?.ok && resp.columns && (
        <div className="overflow-hidden rounded-lg border border-[var(--border)]">
          <table className="w-full border-collapse font-mono text-sm">
            <thead>
              <tr className="bg-[var(--hover)] text-left text-xs uppercase tracking-wider text-[var(--muted)]">
                <th className="px-3 py-2 font-medium">column</th>
                <th className="px-3 py-2 font-medium">type</th>
                <th className="px-3 py-2 font-medium">nullable</th>
                <th className="px-3 py-2 font-medium">default</th>
              </tr>
            </thead>
            <tbody>
              {resp.columns.map((c) => (
                <tr
                  key={c.name}
                  className="border-t border-[var(--border)] hover:bg-[var(--hover)]"
                >
                  <td className="px-3 py-1.5 text-[var(--fg)]">{c.name}</td>
                  <td className="px-3 py-1.5 text-[var(--accent-ink)]">{c.type}</td>
                  <td className="px-3 py-1.5 text-[var(--muted)]">
                    {c.nullable ? "yes" : "no"}
                  </td>
                  <td className="px-3 py-1.5 text-[var(--muted)]">
                    {c.default ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Welcome() {
  return (
    <div className="flex h-full items-center justify-center p-10 text-center">
      <div>
        <div className="mb-2 font-mono text-2xl">
          lla.ma <span className="text-[var(--accent-ink)]">base</span>
        </div>
        <p className="font-mono text-sm text-[var(--muted)]">
          pick a database on the left, or hit{" "}
          <span className="text-[var(--accent-ink)]">sql</span> to run a query.
        </p>
      </div>
    </div>
  );
}
