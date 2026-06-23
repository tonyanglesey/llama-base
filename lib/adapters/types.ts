/**
 * lla.ma db — engine-agnostic database adapter contract.
 *
 * Every database engine (Postgres today; MySQL and Mongo later) implements this
 * one interface. Route handlers talk ONLY to a `DatabaseAdapter` — never to a
 * driver directly — so adding an engine means adding one adapter file, not
 * touching the API or the UI.
 *
 * The shape is deliberately relational-first (databases → schemas → tables →
 * rows). Engines that don't fit (e.g. Mongo's databases → collections →
 * documents, no SQL) map their concepts onto these names and advertise what
 * they actually support via `capabilities`, so the UI can adapt instead of
 * assuming a lowest common denominator.
 */

export type Engine = "postgres" | "mysql" | "mongo";

export interface AdapterCapabilities {
  /** Has a free-form query surface (SQL editor). Mongo: false. */
  sql: boolean;
  /** Has a schema layer between database and table (db → schema → table). */
  schemas: boolean;
  /** Supports transactions. */
  transactions: boolean;
  /** Tables expose primary keys (drives PK-aware grids / row edits). */
  primaryKeys: boolean;
  /** Server-level CREATE DATABASE is available. */
  createDatabase: boolean;
  /** Can EXPLAIN / show a query plan. */
  explain: boolean;
  /** Can produce the Overview dashboard (stats, table sizes, advisors). */
  overview: boolean;
}

export type TableInfo = { name: string; type: "table" | "view" | string };

export type ColumnInfo = {
  name: string;
  type: string;
  nullable: boolean;
  default: string | null;
};

export type Row = Record<string, unknown>;

export type RunResult = {
  rows: Row[];
  columns: string[];
  rowCount: number;
};

/**
 * How a single row is uniquely addressed for update/delete. Tables with a
 * primary key use it; PK-less tables fall back to Postgres' physical `ctid`
 * (re-read on every page load, so it stays current for a single operator).
 */
export type RowKey =
  | { kind: "pk"; columns: string[] }
  | { kind: "ctid"; field: string };

export type RowIdentifier =
  | { kind: "pk"; values: Record<string, unknown> }
  | { kind: "ctid"; ctid: string };

export type ReadRowsResult = {
  columns: string[];
  primaryKey: string[];
  /** How the client should identify a row for edits. */
  rowKey: RowKey;
  rows: Row[];
  total: number;
  limit: number;
  offset: number;
};

/** Field name carrying the physical row id when a table has no primary key. */
export const CTID_FIELD = "__ctid";

export type HealthInfo = {
  version: string;
  database: string;
  serverTime: string;
};

// --- overview dashboard ------------------------------------------------------

export type DatabaseStats = {
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

export type TableSize = {
  schema: string;
  name: string;
  bytes: number;
  pretty: string;
};

export type Advisors = {
  unusedIndexes: number;
  vacuumTables: number;
  tablesWithoutPk: number;
  cacheHitRatio: number | null;
};

export type SchemaTable = { schema: string; name: string };

export type ForeignKey = {
  name: string;
  schema: string;
  table: string;
  refSchema: string;
  refTable: string;
};

/** Tables + foreign-key edges of a database — fuel for the schema map. */
export type Relations = {
  tables: SchemaTable[];
  foreignKeys: ForeignKey[];
};

export interface ReadRowsOptions {
  database: string;
  schema: string;
  table: string;
  limit: number;
  offset: number;
  orderBy?: string | null;
  dir?: "asc" | "desc";
}

export interface RunQueryOptions {
  database: string;
  sql: string;
  params?: unknown[];
  readOnly: boolean;
}

export interface InsertRowOptions {
  database: string;
  schema: string;
  table: string;
  /** Column → value. Omitted columns take their DB default (serials, etc.). */
  values: Record<string, unknown>;
}

export interface UpdateRowOptions {
  database: string;
  schema: string;
  table: string;
  /** Column → new value. */
  set: Record<string, unknown>;
  id: RowIdentifier;
}

export interface DeleteRowOptions {
  database: string;
  schema: string;
  table: string;
  id: RowIdentifier;
}

/** Result of a single-row mutation. `row` is the affected row when returned. */
export type MutationResult = {
  rowCount: number;
  row?: Row;
};

export interface DatabaseAdapter {
  readonly engine: Engine;
  readonly capabilities: AdapterCapabilities;

  // --- introspection ---------------------------------------------------------
  listDatabases(): Promise<string[]>;
  listSchemas(database: string): Promise<string[]>;
  listTables(database: string, schema: string): Promise<TableInfo[]>;
  listColumns(
    database: string,
    schema: string,
    table: string
  ): Promise<ColumnInfo[]>;
  listPrimaryKey(
    database: string,
    schema: string,
    table: string
  ): Promise<string[]>;

  // --- data ------------------------------------------------------------------
  /** Paginated, sortable, PK-aware read of one table. */
  readRows(opts: ReadRowsOptions): Promise<ReadRowsResult>;
  /** Run arbitrary query text, honoring read-only mode. */
  runQuery(opts: RunQueryOptions): Promise<RunResult>;

  // --- single-row edits (inline grid editing) -------------------------------
  insertRow(opts: InsertRowOptions): Promise<MutationResult>;
  updateRow(opts: UpdateRowOptions): Promise<MutationResult>;
  deleteRow(opts: DeleteRowOptions): Promise<MutationResult>;

  // --- server-level ----------------------------------------------------------
  createDatabase(name: string): Promise<void>;
  health(): Promise<HealthInfo>;

  // --- overview dashboard ----------------------------------------------------
  databaseStats(database: string): Promise<DatabaseStats>;
  tableSizes(database: string, limit?: number): Promise<TableSize[]>;
  advisors(database: string): Promise<Advisors>;
  /** Tables + FK edges for the schema map. */
  relations(database: string): Promise<Relations>;

  // --- guards (query-shaped; trivial/false for non-SQL engines) --------------
  /** True if the statement looks like it writes. */
  isMutating(sql: string): boolean;
  /** True if the statement is destructive enough to need an explicit confirm. */
  needsConfirm(sql: string): boolean;
}
