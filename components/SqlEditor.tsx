"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type RunOk = {
  ok: true;
  rows: Record<string, unknown>[];
  columns: string[];
  rowCount: number;
  ms: number;
};
type RunErr = { ok: false; error: string; needsConfirm?: boolean };
type RunResp = RunOk | RunErr;

type HistoryItem = { sql: string; ts: number };
const HISTORY_KEY = "llama.sql.history";
const MAX_ROWS = 1000;

export default function SqlEditor({
  databases,
  initialDb,
  readOnly,
}: {
  databases: string[];
  initialDb: string | null;
  readOnly: boolean;
}) {
  const [db, setDb] = useState(initialDb ?? databases[0] ?? "");
  const [sql, setSql] = useState("");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<RunOk | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (initialDb) setDb(initialDb);
  }, [initialDb]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      if (raw) setHistory(JSON.parse(raw) as HistoryItem[]);
    } catch {
      /* ignore */
    }
  }, []);

  const pushHistory = (entry: string) => {
    setHistory((prev) => {
      const next = [{ sql: entry, ts: Date.now() }, ...prev.filter((h) => h.sql !== entry)].slice(
        0,
        25
      );
      try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  const run = useCallback(
    async (confirmed: boolean) => {
      const text = sql.trim();
      if (!text || !db) return;
      setRunning(true);
      setError(null);
      setPendingConfirm(false);
      try {
        const res = await fetch("/api/query", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ database: db, sql: text, readOnly, confirmed }),
        });
        const data: RunResp = await res.json();
        if (data.ok) {
          setResult(data);
          pushHistory(text);
        } else if (data.needsConfirm) {
          setPendingConfirm(true);
          setError(data.error);
        } else {
          setResult(null);
          setError(data.error);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "request failed");
      } finally {
        setRunning(false);
      }
    },
    [sql, db, readOnly]
  );

  return (
    <div className="flex h-full flex-col">
      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border)] px-4 py-2">
        <label className="font-mono text-xs text-[var(--muted)]">db</label>
        <select
          value={db}
          onChange={(e) => setDb(e.target.value)}
          className="rounded border border-[var(--border)] bg-[var(--field)] px-2 py-1 font-mono text-xs text-[var(--fg)] outline-none focus:border-[var(--accent)]"
        >
          {databases.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>

        <button
          onClick={() => void run(false)}
          disabled={running || !sql.trim()}
          className="rounded bg-[var(--accent)] px-3 py-1 font-mono text-xs font-semibold text-black hover:opacity-90 disabled:opacity-40"
        >
          {running ? "running…" : "▸ run"}
        </button>
        <span className="font-mono text-[10px] text-[var(--muted)]">⌘/ctrl + ⏎</span>

        <span
          className={`ml-auto rounded border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider ${
            readOnly
              ? "border-[var(--border)] text-[var(--muted)]"
              : "border-[var(--danger)] text-[var(--danger)]"
          }`}
        >
          {readOnly ? "read-only" : "write mode"}
        </span>
        <button
          onClick={() => setShowHistory((s) => !s)}
          className="rounded border border-[var(--border)] px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--accent-ink)]"
        >
          history
        </button>
      </div>

      {showHistory && (
        <div className="max-h-40 overflow-auto border-b border-[var(--border)] bg-[var(--inset)]">
          {history.length === 0 && (
            <div className="px-4 py-2 font-mono text-xs italic text-[var(--muted)]">
              no history yet
            </div>
          )}
          {history.map((h, i) => (
            <button
              key={i}
              onClick={() => {
                setSql(h.sql);
                setShowHistory(false);
                taRef.current?.focus();
              }}
              className="block w-full truncate px-4 py-1 text-left font-mono text-xs text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--fg)]"
            >
              {h.sql.replace(/\s+/g, " ")}
            </button>
          ))}
        </div>
      )}

      {/* editor */}
      <textarea
        ref={taRef}
        value={sql}
        onChange={(e) => setSql(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
            e.preventDefault();
            void run(false);
          }
        }}
        spellCheck={false}
        placeholder="select * from public.users limit 50;"
        className="h-48 w-full resize-y bg-transparent px-4 py-3 font-mono text-sm text-[var(--fg)] outline-none placeholder:text-[var(--muted)]"
      />

      {/* confirm / error */}
      {pendingConfirm && (
        <div className="flex items-center gap-3 border-y border-[var(--danger)]/40 bg-[var(--danger)]/10 px-4 py-2">
          <span className="font-mono text-xs text-[var(--danger)]">
            ⚠ {error}
          </span>
          <button
            onClick={() => void run(true)}
            className="ml-auto rounded border border-[var(--danger)] px-2 py-0.5 font-mono text-[11px] text-[var(--danger)] hover:bg-[var(--danger)] hover:text-black"
          >
            run anyway
          </button>
          <button
            onClick={() => setPendingConfirm(false)}
            className="rounded border border-[var(--border)] px-2 py-0.5 font-mono text-[11px] text-[var(--muted)] hover:text-[var(--fg)]"
          >
            cancel
          </button>
        </div>
      )}
      {error && !pendingConfirm && (
        <pre className="overflow-auto border-y border-[var(--danger)]/40 bg-[var(--danger)]/10 px-4 py-2 font-mono text-xs text-[var(--danger)]">
          {error}
        </pre>
      )}

      {/* results */}
      <div className="min-h-0 flex-1 overflow-auto">
        {result && <Results result={result} />}
      </div>
    </div>
  );
}

function Results({ result }: { result: RunOk }) {
  if (result.columns.length === 0) {
    return (
      <div className="px-4 py-3 font-mono text-sm text-[var(--accent-ink)]">
        ✓ ok · {result.rowCount} row{result.rowCount === 1 ? "" : "s"} affected ·{" "}
        {result.ms}ms
      </div>
    );
  }
  const rows = result.rows.slice(0, MAX_ROWS);
  return (
    <div>
      <div className="px-4 py-2 font-mono text-[11px] text-[var(--muted)]">
        {result.rowCount} row{result.rowCount === 1 ? "" : "s"} · {result.ms}ms
        {result.rowCount > MAX_ROWS && ` · showing first ${MAX_ROWS}`}
      </div>
      <table className="w-full border-collapse font-mono text-xs">
        <thead>
          <tr className="sticky top-0 bg-[var(--panel)] text-left uppercase tracking-wider text-[var(--muted)]">
            {result.columns.map((c) => (
              <th
                key={c}
                className="border-b border-[var(--border)] px-3 py-1.5 font-medium"
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-[var(--border)] hover:bg-[var(--hover)]">
              {result.columns.map((c) => (
                <td key={c} className="px-3 py-1 align-top">
                  <Cell value={row[c]} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Cell({ value }: { value: unknown }) {
  if (value === null || value === undefined)
    return <span className="italic text-[var(--muted)]">NULL</span>;
  if (typeof value === "object")
    return <span>{JSON.stringify(value)}</span>;
  return <span>{String(value)}</span>;
}
