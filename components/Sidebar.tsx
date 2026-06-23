"use client";

import { useCallback, useState } from "react";

export type TableRef = {
  db: string;
  schema: string;
  table: string;
  type: string;
};

type SchemasResp = { ok: boolean; schemas?: string[]; error?: string };
type TablesResp = {
  ok: boolean;
  tables?: { name: string; type: string }[];
  error?: string;
};

export default function Sidebar({
  databases,
  loadingDbs,
  dbError,
  selected,
  onSelect,
  onActivateDb,
  onNewDatabase,
}: {
  databases: string[];
  loadingDbs: boolean;
  dbError: string | null;
  selected: TableRef | null;
  onSelect: (t: TableRef) => void;
  onActivateDb: (db: string) => void;
  onNewDatabase: (name: string) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [openDb, setOpenDb] = useState<string | null>(null);
  const [schemas, setSchemas] = useState<Record<string, string[]>>({});
  const [openSchemas, setOpenSchemas] = useState<Set<string>>(new Set());
  const [tables, setTables] = useState<
    Record<string, { name: string; type: string }[]>
  >({});
  const [busy, setBusy] = useState<Set<string>>(new Set());

  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [createErr, setCreateErr] = useState<string | null>(null);
  const [createBusy, setCreateBusy] = useState(false);

  const setBusyKey = (key: string, on: boolean) =>
    setBusy((prev) => {
      const next = new Set(prev);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });

  const toggleDb = useCallback(
    async (db: string) => {
      const opening = openDb !== db;
      setOpenDb(opening ? db : null);
      if (opening) {
        onActivateDb(db);
        if (!schemas[db]) {
          setBusyKey(db, true);
          try {
            const res = await fetch(`/api/schema?db=${encodeURIComponent(db)}`, {
              cache: "no-store",
            });
            const data: SchemasResp = await res.json();
            if (data.ok && data.schemas)
              setSchemas((s) => ({ ...s, [db]: data.schemas! }));
          } finally {
            setBusyKey(db, false);
          }
        }
      }
    },
    [openDb, schemas, onActivateDb]
  );

  const toggleSchema = useCallback(
    async (db: string, schema: string) => {
      const key = `${db}.${schema}`;
      const opening = !openSchemas.has(key);
      setOpenSchemas((prev) => {
        const next = new Set(prev);
        if (opening) next.add(key);
        else next.delete(key);
        return next;
      });
      if (opening && !tables[key]) {
        setBusyKey(key, true);
        try {
          const res = await fetch(
            `/api/schema?db=${encodeURIComponent(db)}&schema=${encodeURIComponent(
              schema
            )}`,
            { cache: "no-store" }
          );
          const data: TablesResp = await res.json();
          if (data.ok && data.tables)
            setTables((t) => ({ ...t, [key]: data.tables! }));
        } finally {
          setBusyKey(key, false);
        }
      }
    },
    [openSchemas, tables]
  );

  async function submitNewDatabase() {
    const name = newName.trim();
    if (!name) return;
    setCreateBusy(true);
    setCreateErr(null);
    const res = await onNewDatabase(name);
    setCreateBusy(false);
    if (res.ok) {
      setCreating(false);
      setNewName("");
    } else {
      setCreateErr(res.error ?? "create failed");
    }
  }

  return (
    <aside className="flex w-72 shrink-0 flex-col overflow-y-auto border-r border-[var(--border)] bg-[var(--panel)]">
      <div className="flex items-center justify-between px-3 py-3">
        <span className="font-mono text-[10px] uppercase tracking-widest text-[var(--muted)]">
          databases
        </span>
        <button
          onClick={() => {
            setCreating((c) => !c);
            setCreateErr(null);
          }}
          title="New database"
          className="font-mono text-sm leading-none text-[var(--muted)] hover:text-[var(--accent-ink)]"
        >
          {creating ? "×" : "+"}
        </button>
      </div>

      {creating && (
        <div className="px-3 pb-2">
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void submitNewDatabase();
              if (e.key === "Escape") setCreating(false);
            }}
            placeholder="new_database_name"
            className="w-full rounded border border-[var(--border)] bg-[var(--field)] px-2 py-1 font-mono text-xs text-[var(--fg)] outline-none focus:border-[var(--accent)]"
          />
          <div className="mt-1 flex items-center gap-2">
            <button
              onClick={() => void submitNewDatabase()}
              disabled={createBusy}
              className="rounded border border-[var(--border)] px-2 py-0.5 font-mono text-[11px] hover:border-[var(--accent)] hover:text-[var(--accent-ink)] disabled:opacity-50"
            >
              {createBusy ? "creating…" : "create"}
            </button>
            {createErr && (
              <span className="font-mono text-[10px] text-[var(--danger)]">
                {createErr}
              </span>
            )}
          </div>
        </div>
      )}

      {loadingDbs && (
        <div className="px-3 py-2 font-mono text-sm text-[var(--muted)]">
          loading…
        </div>
      )}
      {dbError && (
        <div className="px-3 py-2 font-mono text-xs text-[var(--danger)]">
          {dbError}
        </div>
      )}

      <ul className="pb-8 font-mono text-sm">
        {databases.map((db) => (
          <li key={db}>
            <button
              onClick={() => toggleDb(db)}
              className={`flex cursor-pointer w-full items-center gap-1.5 px-3 py-1.5 text-left hover:bg-[var(--hover)] ${
                openDb === db ? "text-[var(--fg)]" : "text-[var(--muted)]"
              }`}
            >
              <Caret open={openDb === db} />
              <span className="text-[var(--accent-ink)]">◆</span>
              <span className="truncate cursor-pointer">{db}</span>
              {busy.has(db) && <Dot />}
            </button>

            {openDb === db && (
              <ul className="ml-[18px] border-l border-[var(--border)]">
                {(schemas[db] ?? []).map((schema) => {
                  const key = `${db}.${schema}`;
                  const open = openSchemas.has(key);
                  return (
                    <li key={key}>
                      <button
                        onClick={() => toggleSchema(db, schema)}
                        className={`flex cursor-pointer w-full items-center gap-1.5 px-3 py-1 text-left hover:bg-[var(--hover)] ${
                          open ? "text-[var(--fg)]" : "text-[var(--muted)]"
                        }`}
                      >
                        <Caret open={open} />
                        <span className="truncate">{schema}</span>
                        {busy.has(key) && <Dot />}
                      </button>

                      {open && (
                        <ul className="ml-[18px] border-l border-[var(--border)]">
                          {(tables[key] ?? []).map((t) => {
                            const isSel =
                              selected?.db === db &&
                              selected?.schema === schema &&
                              selected?.table === t.name;
                            return (
                              <li key={t.name}>
                                <button
                                  onClick={() =>
                                    onSelect({
                                      db,
                                      schema,
                                      table: t.name,
                                      type: t.type,
                                    })
                                  }
                                  className={`flex w-full cursor-pointer items-center gap-1.5 px-3 py-1 text-left hover:bg-[var(--hover)] ${
                                    isSel
                                      ? "bg-[var(--accent)]/10 text-[var(--accent-ink)]"
                                      : "text-[var(--muted)]"
                                  }`}
                                >
                                  <span className="w-3 text-center text-[10px] opacity-60">
                                    {t.type === "view" ? "◈" : "▦"}
                                  </span>
                                  <span className="truncate">{t.name}</span>
                                </button>
                              </li>
                            );
                          })}
                          {tables[key]?.length === 0 && (
                            <li className="px-3 py-1 text-xs italic text-[var(--muted)]">
                              no tables
                            </li>
                          )}
                        </ul>
                      )}
                    </li>
                  );
                })}
                {schemas[db]?.length === 0 && (
                  <li className="px-3 py-1 text-xs italic text-[var(--muted)]">
                    no schemas
                  </li>
                )}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </aside>
  );
}

function Caret({ open }: { open: boolean }) {
  return (
    <span
      className={`inline-block w-2 text-[10px] text-[var(--muted)] transition-transform ${
        open ? "rotate-90" : ""
      }`}
    >
      ▸
    </span>
  );
}

function Dot() {
  return (
    <span className="ml-auto h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--accent)]" />
  );
}
