"use client";

import { useCallback, useEffect, useState } from "react";
import type { TableRef } from "@/components/Sidebar";

type RowKey =
  | { kind: "pk"; columns: string[] }
  | { kind: "ctid"; field: string };

type RowIdentifier =
  | { kind: "pk"; values: Record<string, unknown> }
  | { kind: "ctid"; ctid: string };

type RowsResp = {
  ok: boolean;
  columns?: string[];
  primaryKey?: string[];
  rowKey?: RowKey;
  rows?: Record<string, unknown>[];
  total?: number;
  error?: string;
};

const PAGE = 50;

// Cell value <-> input text. Empty input means NULL; objects edit as JSON text
// (Postgres casts the bound string back to the column type).
function cellToInput(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
function inputToValue(text: string): unknown {
  return text === "" ? null : text;
}

export default function DataGrid({
  target,
  readOnly,
}: {
  target: TableRef;
  readOnly: boolean;
}) {
  const [offset, setOffset] = useState(0);
  const [orderBy, setOrderBy] = useState<string | null>(null);
  const [dir, setDir] = useState<"asc" | "desc">("asc");
  const [data, setData] = useState<RowsResp | null>(null);
  const [loading, setLoading] = useState(true);

  // editing state
  const [edit, setEdit] = useState<{ row: number; col: string } | null>(null);
  const [draft, setDraft] = useState("");
  const [inserting, setInserting] = useState(false);
  const [newRow, setNewRow] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [mutError, setMutError] = useState<string | null>(null);

  useEffect(() => {
    setOffset(0);
    setOrderBy(null);
    setDir("asc");
    setEdit(null);
    setInserting(false);
    setMutError(null);
  }, [target]);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({
      db: target.db,
      schema: target.schema,
      table: target.table,
      limit: String(PAGE),
      offset: String(offset),
    });
    if (orderBy) {
      params.set("orderBy", orderBy);
      params.set("dir", dir);
    }
    try {
      const res = await fetch(`/api/rows?${params.toString()}`, {
        cache: "no-store",
      });
      setData((await res.json()) as RowsResp);
    } catch (e) {
      setData({ ok: false, error: e instanceof Error ? e.message : "failed" });
    } finally {
      setLoading(false);
    }
  }, [target, offset, orderBy, dir]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleSort = (col: string) => {
    if (edit) return;
    if (orderBy === col) setDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setOrderBy(col);
      setDir("asc");
    }
    setOffset(0);
  };

  const canEdit = !readOnly && !!data?.rowKey;

  // Build the row identifier (PK values, or ctid) the API needs to pin a row.
  const rowIdOf = useCallback(
    (row: Record<string, unknown>): RowIdentifier | null => {
      const rk = data?.rowKey;
      if (!rk) return null;
      if (rk.kind === "ctid") return { kind: "ctid", ctid: String(row[rk.field]) };
      return {
        kind: "pk",
        values: Object.fromEntries(rk.columns.map((c) => [c, row[c]])),
      };
    },
    [data?.rowKey]
  );

  const mutate = useCallback(
    async (method: "POST" | "PATCH" | "DELETE", payload: object) => {
      setBusy(true);
      setMutError(null);
      try {
        const res = await fetch("/api/rows", {
          method,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            db: target.db,
            schema: target.schema,
            table: target.table,
            readOnly: false,
            ...payload,
          }),
        });
        const out = (await res.json()) as { ok: boolean; error?: string };
        if (!out.ok) {
          setMutError(out.error ?? "operation failed");
          return false;
        }
        return true;
      } catch (e) {
        setMutError(e instanceof Error ? e.message : "request failed");
        return false;
      } finally {
        setBusy(false);
      }
    },
    [target]
  );

  const startEdit = (rowIdx: number, col: string, value: unknown) => {
    if (!canEdit) return;
    setMutError(null);
    setEdit({ row: rowIdx, col });
    setDraft(cellToInput(value));
  };

  const saveEdit = async () => {
    if (!edit || !data?.rows) return setEdit(null);
    const row = data.rows[edit.row];
    const id = rowIdOf(row);
    const original = cellToInput(row[edit.col]);
    if (!id || draft === original) return setEdit(null); // no change
    const ok = await mutate("PATCH", {
      set: { [edit.col]: inputToValue(draft) },
      id,
    });
    setEdit(null);
    if (ok) await load();
  };

  const deleteRow = async (rowIdx: number) => {
    if (!data?.rows) return;
    const id = rowIdOf(data.rows[rowIdx]);
    if (!id) return;
    if (!window.confirm("Delete this row? This cannot be undone.")) return;
    const ok = await mutate("DELETE", { id });
    if (ok) await load();
  };

  const saveInsert = async () => {
    // Only send columns the user actually typed into, so serials/defaults apply.
    const values: Record<string, unknown> = {};
    for (const [col, text] of Object.entries(newRow)) {
      if (text !== "") values[col] = text;
    }
    const ok = await mutate("POST", { values });
    if (ok) {
      setInserting(false);
      setNewRow({});
      await load();
    }
  };

  const total = data?.total ?? 0;
  const pageNum = Math.floor(offset / PAGE) + 1;
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const cols = data?.columns ?? [];

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 px-4 py-2 font-mono text-[11px] text-[var(--muted)]">
        <span>{loading ? "loading…" : `${total} row${total === 1 ? "" : "s"}`}</span>
        {readOnly ? (
          <span className="text-[var(--muted)]">· view</span>
        ) : (
          <button
            disabled={busy || inserting || !data?.ok}
            onClick={() => {
              setInserting(true);
              setNewRow({});
              setMutError(null);
            }}
            className="rounded border border-[var(--border)] px-2 py-0.5 hover:border-[var(--accent)] disabled:opacity-40"
          >
            + row
          </button>
        )}
        <div className="ml-auto flex items-center gap-2">
          <button
            disabled={offset === 0}
            onClick={() => setOffset(Math.max(0, offset - PAGE))}
            className="rounded border border-[var(--border)] px-2 py-0.5 hover:border-[var(--accent)] disabled:opacity-40"
          >
            ‹ prev
          </button>
          <span>
            {pageNum} / {pages}
          </span>
          <button
            disabled={offset + PAGE >= total}
            onClick={() => setOffset(offset + PAGE)}
            className="rounded border border-[var(--border)] px-2 py-0.5 hover:border-[var(--accent)] disabled:opacity-40"
          >
            next ›
          </button>
        </div>
      </div>

      {data && !data.ok && (
        <pre className="mx-4 overflow-auto rounded bg-[var(--code)] p-3 font-mono text-xs text-[var(--danger)]">
          {data.error}
        </pre>
      )}

      {mutError && (
        <pre className="mx-4 mb-1 overflow-auto rounded bg-[var(--code)] p-3 font-mono text-xs text-[var(--danger)]">
          {mutError}
        </pre>
      )}

      {data?.ok && data.columns && (
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full border-collapse font-mono text-xs">
            <thead>
              <tr className="sticky top-0 bg-[var(--panel)] text-left uppercase tracking-wider text-[var(--muted)]">
                {cols.map((c) => (
                  <th
                    key={c}
                    onClick={() => toggleSort(c)}
                    className="cursor-pointer whitespace-nowrap border-b border-[var(--border)] px-3 py-1.5 font-medium hover:text-[var(--accent-ink)]"
                  >
                    {c}
                    {orderBy === c ? (dir === "asc" ? " ▲" : " ▼") : ""}
                    {data.primaryKey?.includes(c) && (
                      <span className="text-[var(--accent-ink)]"> ·pk</span>
                    )}
                  </th>
                ))}
                {canEdit && (
                  <th className="border-b border-[var(--border)] px-3 py-1.5" />
                )}
              </tr>
            </thead>
            <tbody>
              {inserting && (
                <tr className="border-b border-[var(--border)] bg-[var(--accent)]/5">
                  {cols.map((c) => (
                    <td key={c} className="px-2 py-1 align-top">
                      <input
                        value={newRow[c] ?? ""}
                        placeholder={
                          data.primaryKey?.includes(c) ? "(auto)" : "NULL"
                        }
                        onChange={(e) =>
                          setNewRow((r) => ({ ...r, [c]: e.target.value }))
                        }
                        className="w-full min-w-[6rem] rounded border border-[var(--border)] bg-[var(--field)] px-1.5 py-0.5 text-[var(--fg)] outline-none focus:border-[var(--accent)]"
                      />
                    </td>
                  ))}
                  <td className="whitespace-nowrap px-2 py-1 text-right">
                    <button
                      disabled={busy}
                      onClick={saveInsert}
                      className="mr-1 rounded border border-[var(--accent)] px-2 py-0.5 text-[var(--accent-ink)] hover:bg-[var(--accent)]/10 disabled:opacity-40"
                    >
                      save
                    </button>
                    <button
                      disabled={busy}
                      onClick={() => {
                        setInserting(false);
                        setNewRow({});
                      }}
                      className="rounded border border-[var(--border)] px-2 py-0.5 hover:text-[var(--fg)]"
                    >
                      cancel
                    </button>
                  </td>
                </tr>
              )}
              {data.rows!.map((row, i) => (
                <tr
                  key={i}
                  className="border-b border-[var(--border)] hover:bg-[var(--hover)]"
                >
                  {cols.map((c) => {
                    const editing = edit?.row === i && edit?.col === c;
                    return (
                      <td
                        key={c}
                        onDoubleClick={() => startEdit(i, c, row[c])}
                        title={canEdit ? "double-click to edit" : undefined}
                        className={`max-w-[28rem] truncate px-3 py-1 align-top ${
                          canEdit && !editing ? "cursor-text" : ""
                        }`}
                      >
                        {editing ? (
                          <input
                            autoFocus
                            value={draft}
                            disabled={busy}
                            onChange={(e) => setDraft(e.target.value)}
                            onBlur={saveEdit}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") void saveEdit();
                              if (e.key === "Escape") setEdit(null);
                            }}
                            className="w-full min-w-[6rem] rounded border border-[var(--accent)] bg-[var(--code)] px-1.5 py-0.5 text-[var(--fg)] outline-none"
                          />
                        ) : (
                          <Cell value={row[c]} />
                        )}
                      </td>
                    );
                  })}
                  {canEdit && (
                    <td className="whitespace-nowrap px-3 py-1 text-right">
                      <button
                        disabled={busy}
                        onClick={() => deleteRow(i)}
                        title="delete row"
                        className="rounded px-1 text-[var(--muted)] hover:text-[var(--danger)] disabled:opacity-40"
                      >
                        ✕
                      </button>
                    </td>
                  )}
                </tr>
              ))}
              {data.rows!.length === 0 && !inserting && (
                <tr>
                  <td
                    colSpan={cols.length + (canEdit ? 1 : 0)}
                    className="px-3 py-6 text-center italic text-[var(--muted)]"
                  >
                    no rows
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Cell({ value }: { value: unknown }) {
  if (value === null || value === undefined)
    return <span className="italic text-[var(--muted)]">NULL</span>;
  if (typeof value === "object") return <span>{JSON.stringify(value)}</span>;
  return <span>{String(value)}</span>;
}
