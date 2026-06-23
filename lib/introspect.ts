import { getPool } from "./db";

/**
 * Schema introspection. Every function targets a specific database (its own
 * pool); server-level listing uses the admin pool. All reads, all parameterized.
 */

/** Every database on the server we're allowed to connect to (not templates). */
export async function listDatabases(): Promise<string[]> {
  const { rows } = await getPool().query<{ datname: string }>(
    `select datname
     from pg_database
     where datistemplate = false and datallowconn = true
     order by datname`
  );
  return rows.map((r) => r.datname);
}

/** Non-system schemas within a database (keeps auth/storage/etc — it's a console). */
export async function listSchemas(database: string): Promise<string[]> {
  const { rows } = await getPool(database).query<{ nspname: string }>(
    `select nspname
     from pg_namespace
     where nspname not in ('pg_catalog', 'information_schema', 'pg_toast')
       and nspname not like 'pg_temp_%'
       and nspname not like 'pg_toast_temp_%'
     order by nspname`
  );
  return rows.map((r) => r.nspname);
}

export type TableInfo = { name: string; type: "table" | "view" | string };

/** Tables and views in one schema. */
export async function listTables(
  database: string,
  schema: string
): Promise<TableInfo[]> {
  const { rows } = await getPool(database).query<{
    table_name: string;
    table_type: string;
  }>(
    `select table_name, table_type
     from information_schema.tables
     where table_schema = $1
     order by table_name`,
    [schema]
  );
  return rows.map((r) => ({
    name: r.table_name,
    type:
      r.table_type === "BASE TABLE"
        ? "table"
        : r.table_type === "VIEW"
        ? "view"
        : r.table_type,
  }));
}

export type ColumnInfo = {
  name: string;
  type: string;
  nullable: boolean;
  default: string | null;
};

/** Columns of one table, in ordinal order. */
export async function listColumns(
  database: string,
  schema: string,
  table: string
): Promise<ColumnInfo[]> {
  const { rows } = await getPool(database).query<{
    column_name: string;
    data_type: string;
    is_nullable: string;
    column_default: string | null;
  }>(
    `select column_name, data_type, is_nullable, column_default
     from information_schema.columns
     where table_schema = $1 and table_name = $2
     order by ordinal_position`,
    [schema, table]
  );
  return rows.map((r) => ({
    name: r.column_name,
    type: r.data_type,
    nullable: r.is_nullable === "YES",
    default: r.column_default,
  }));
}

/** Primary-key column(s) of a table, in key order. Empty if none. */
export async function listPrimaryKey(
  database: string,
  schema: string,
  table: string
): Promise<string[]> {
  const { rows } = await getPool(database).query<{ column_name: string }>(
    `select kcu.column_name
     from information_schema.table_constraints tc
     join information_schema.key_column_usage kcu
       on kcu.constraint_name = tc.constraint_name
      and kcu.constraint_schema = tc.constraint_schema
     where tc.table_schema = $1
       and tc.table_name = $2
       and tc.constraint_type = 'PRIMARY KEY'
     order by kcu.ordinal_position`,
    [schema, table]
  );
  return rows.map((r) => r.column_name);
}
