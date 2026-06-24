import { Pool, type PoolConfig, type QueryResultRow } from "pg";

/**
 * lla.ma db — server-side Postgres access. The browser never touches this.
 *
 * Target: a self-hosted PostgreSQL on your own Ubuntu box, holding many
 * databases (db-per-app: zenfitness, sparks, llama, ...). This is a management
 * console, so it needs raw catalog access + DDL, including server-level ops
 * (CREATE/DROP DATABASE) that must run outside a transaction against an
 * "admin" database (conventionally `postgres`).
 *
 * Connection model: ONE Pool per database, created lazily and cached. The
 * picker in the UI chooses which database a request runs against. Server-level
 * operations use the admin pool (PG_ADMIN_DB).
 *
 * In local dev the box's Postgres is reached over an SSH tunnel
 * (ssh -N -L 5432:localhost:5432 ubuntu@<box>), so PG_HOST is 127.0.0.1 and
 * TLS is off. Set PG_SSL=require if you ever connect directly over TLS.
 */

const PG_HOST = process.env.PG_HOST ?? "127.0.0.1";
const PG_PORT = Number(process.env.PG_PORT ?? 5432);
const PG_USER = process.env.PG_USER ?? "postgres";
const PG_PASSWORD = process.env.PG_PASSWORD ?? "";
const PG_ADMIN_DB = process.env.PG_ADMIN_DB ?? "postgres";
const PG_SSL = (process.env.PG_SSL ?? "off").toLowerCase();

/**
 * What we're actually connected to, for the UI status line. When an SSH tunnel
 * is in play PG_HOST is just the local tunnel mouth (127.0.0.1) — the host the
 * operator cares about is the box on the far end (SSH_HOST), reached on its own
 * Postgres port. Without a tunnel, PG_HOST/PG_PORT is the real target.
 */
export function connectionTarget(): { host: string; port: number } {
  const tunnelOn = ["on", "true", "1", "yes"].includes(
    (process.env.SSH_TUNNEL ?? "").toLowerCase()
  );
  if (tunnelOn && process.env.SSH_HOST) {
    return {
      host: process.env.SSH_HOST,
      port: Number(process.env.SSH_REMOTE_PORT ?? 5432),
    };
  }
  return { host: PG_HOST, port: PG_PORT };
}

function baseConfig(database: string): PoolConfig {
  return {
    host: PG_HOST,
    port: PG_PORT,
    user: PG_USER,
    password: PG_PASSWORD,
    database,
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 8_000,
    // localhost/tunnel: no TLS. Direct remote: rejectUnauthorized off for
    // self-signed box certs unless PG_SSL=verify.
    ssl:
      PG_SSL === "off" || PG_SSL === "false"
        ? undefined
        : { rejectUnauthorized: PG_SSL === "verify" },
  };
}

const pools = new Map<string, Pool>(); // one pool per database, lazy

/** Get (or create) the connection pool for a specific database. */
export function getPool(database: string = PG_ADMIN_DB): Pool {
  let pool = pools.get(database);
  if (!pool) {
    pool = new Pool(baseConfig(database));
    pools.set(database, pool);
  }
  return pool;
}

/** Pool against the admin database — for listing/creating databases. */
export function getAdminPool(): Pool {
  return getPool(PG_ADMIN_DB);
}

export const adminDatabase = PG_ADMIN_DB;

/** Convenience query. Defaults to the admin database. */
export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
  database: string = PG_ADMIN_DB
) {
  return getPool(database).query<T>(text, params as unknown[]);
}

// --- guards (consumed by the SQL editor + CRUD in later milestones) ---------

/** Cheap regex seatbelt — true if the statement looks like it writes. */
export function isMutating(sql: string): boolean {
  return /^\s*(insert|update|delete|drop|truncate|alter|create|grant|revoke)\b/i.test(
    sql
  );
}

/** Statements that demand an explicit confirm even in write mode. */
export function needsConfirm(sql: string): boolean {
  const s = sql.trim().toLowerCase();
  if (/^drop\b|^truncate\b/.test(s)) return true;
  if (/^(delete|update)\b/.test(s) && !/\bwhere\b/.test(s)) return true; // unscoped
  if (/^alter\b/.test(s)) return true;
  return false;
}

export type RunResult<T extends QueryResultRow = QueryResultRow> = {
  rows: T[];
  columns: string[];
  rowCount: number;
};

/** Run arbitrary SQL against a chosen database, honoring read-only mode. */
export async function runQuery<T extends QueryResultRow = QueryResultRow>(opts: {
  database: string;
  sql: string;
  params?: unknown[];
  readOnly: boolean;
}): Promise<RunResult<T>> {
  const { database, sql, params = [], readOnly } = opts;
  if (readOnly && isMutating(sql)) {
    throw new Error("Read-only mode is ON: mutating statements are blocked.");
  }
  const pool = getPool(database);
  // No params -> simple query protocol, which lets a whole schema file (many
  // statements) run in one go. With params we must use the extended protocol
  // (single statement, but values are safely bound).
  const res = params.length
    ? await pool.query<T>(sql, params as unknown[])
    : await pool.query<T>(sql);
  return {
    rows: res.rows,
    columns: res.fields.map((f) => f.name),
    rowCount: res.rowCount ?? res.rows.length,
  };
}
