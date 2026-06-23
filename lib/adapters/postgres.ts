import {
  getPool,
  getAdminPool,
  query as pgQuery,
  runQuery as pgRunQuery,
  isMutating as pgIsMutating,
  needsConfirm as pgNeedsConfirm,
} from "../db";
import {
  listDatabases as pgListDatabases,
  listSchemas as pgListSchemas,
  listTables as pgListTables,
  listColumns as pgListColumns,
  listPrimaryKey as pgListPrimaryKey,
} from "../introspect";
import {
  CTID_FIELD,
  type AdapterCapabilities,
  type Advisors,
  type ColumnInfo,
  type DatabaseAdapter,
  type DatabaseStats,
  type DeleteRowOptions,
  type Engine,
  type HealthInfo,
  type InsertRowOptions,
  type MutationResult,
  type ReadRowsOptions,
  type ReadRowsResult,
  type Relations,
  type RowIdentifier,
  type RunQueryOptions,
  type RunResult,
  type TableInfo,
  type TableSize,
  type UpdateRowOptions,
} from "./types";

/**
 * Postgres adapter — wraps the pg connection pools (`lib/db`) and catalog
 * introspection (`lib/introspect`) behind the engine-agnostic DatabaseAdapter
 * contract. This is the only place route handlers reach Postgres through.
 */

// Identifiers (schema/table/column names) can't be bound as params. We only
// interpolate names validated against the live catalog, and we quote them.
const ident = (s: string) => `"${s.replace(/"/g, '""')}"`;

// Database names are identifiers too — validate strictly before quoting.
const SAFE_DB_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Build a WHERE clause that pins exactly one row, pushing bound values onto
 * `params`. PK columns are unique by definition; `ctid` is physically unique —
 * either way this matches a single row.
 */
function whereFromId(id: RowIdentifier, params: unknown[]): string {
  if (id.kind === "ctid") {
    params.push(id.ctid);
    return `ctid = $${params.length}::tid`;
  }
  const cols = Object.keys(id.values);
  if (cols.length === 0) {
    throw new Error("cannot identify row: empty primary key");
  }
  return cols
    .map((c) => {
      params.push(id.values[c]);
      return `${ident(c)} = $${params.length}`;
    })
    .join(" and ");
}

const capabilities: AdapterCapabilities = {
  sql: true,
  schemas: true,
  transactions: true,
  primaryKeys: true,
  createDatabase: true,
  explain: true,
  overview: true,
};

// Non-system user relations — the predicate the overview stats count over.
const USER_RELS = `n.nspname not in ('pg_catalog','information_schema') and n.nspname !~ '^pg_'`;

export const postgresAdapter: DatabaseAdapter = {
  engine: "postgres" as Engine,
  capabilities,

  listDatabases(): Promise<string[]> {
    return pgListDatabases();
  },

  listSchemas(database: string): Promise<string[]> {
    return pgListSchemas(database);
  },

  listTables(database: string, schema: string): Promise<TableInfo[]> {
    return pgListTables(database, schema);
  },

  listColumns(
    database: string,
    schema: string,
    table: string
  ): Promise<ColumnInfo[]> {
    return pgListColumns(database, schema, table);
  },

  listPrimaryKey(
    database: string,
    schema: string,
    table: string
  ): Promise<string[]> {
    return pgListPrimaryKey(database, schema, table);
  },

  async readRows(opts: ReadRowsOptions): Promise<ReadRowsResult> {
    const { database, schema, table } = opts;
    const limit = Math.min(Math.max(opts.limit, 1), 200);
    const offset = Math.max(opts.offset, 0);
    const dir = opts.dir === "desc" ? "DESC" : "ASC";

    const columns = await pgListColumns(database, schema, table);
    if (columns.length === 0) {
      throw new Error("no such table, or it has no columns");
    }
    const colNames = columns.map((c) => c.name);
    const pk = await pgListPrimaryKey(database, schema, table);

    const rel = `${ident(schema)}.${ident(table)}`;

    // Order by the requested column only if it's real; otherwise by PK for
    // stable pagination.
    let orderClause = "";
    if (opts.orderBy && colNames.includes(opts.orderBy)) {
      orderClause = ` order by ${ident(opts.orderBy)} ${dir}`;
    } else if (pk.length) {
      orderClause = ` order by ${pk.map(ident).join(", ")}`;
    }

    // PK-less tables: also select the physical ctid so rows stay editable.
    const usingCtid = pk.length === 0;
    const selectList = usingCtid ? `*, ctid::text as ${ident(CTID_FIELD)}` : "*";
    const rowKey = usingCtid
      ? ({ kind: "ctid", field: CTID_FIELD } as const)
      : ({ kind: "pk", columns: pk } as const);

    const pool = getPool(database);
    const totalRes = await pool.query<{ count: string }>(
      `select count(*)::text as count from ${rel}`
    );
    const total = Number(totalRes.rows[0]?.count ?? 0);
    const rowsRes = await pool.query(
      `select ${selectList} from ${rel}${orderClause} limit $1 offset $2`,
      [limit, offset]
    );

    return {
      columns: colNames,
      primaryKey: pk,
      rowKey,
      rows: rowsRes.rows,
      total,
      limit,
      offset,
    };
  },

  async insertRow(opts: InsertRowOptions): Promise<MutationResult> {
    const { database, schema, table } = opts;
    const rel = `${ident(schema)}.${ident(table)}`;
    const cols = Object.keys(opts.values);

    if (cols.length === 0) {
      const res = await getPool(database).query(
        `insert into ${rel} default values returning *`
      );
      return { rowCount: res.rowCount ?? 0, row: res.rows[0] };
    }

    const params: unknown[] = [];
    const colList = cols.map(ident).join(", ");
    const valList = cols
      .map((c) => {
        params.push(opts.values[c]);
        return `$${params.length}`;
      })
      .join(", ");

    const res = await getPool(database).query(
      `insert into ${rel} (${colList}) values (${valList}) returning *`,
      params
    );
    return { rowCount: res.rowCount ?? 0, row: res.rows[0] };
  },

  async updateRow(opts: UpdateRowOptions): Promise<MutationResult> {
    const { database, schema, table } = opts;
    const cols = Object.keys(opts.set);
    if (cols.length === 0) {
      throw new Error("nothing to update: no columns provided");
    }
    const rel = `${ident(schema)}.${ident(table)}`;
    const params: unknown[] = [];
    const setClause = cols
      .map((c) => {
        params.push(opts.set[c]);
        return `${ident(c)} = $${params.length}`;
      })
      .join(", ");
    const whereClause = whereFromId(opts.id, params);

    const res = await getPool(database).query(
      `update ${rel} set ${setClause} where ${whereClause} returning *`,
      params
    );
    if ((res.rowCount ?? 0) === 0) {
      throw new Error("row not found — it may have changed; refresh and retry");
    }
    return { rowCount: res.rowCount ?? 0, row: res.rows[0] };
  },

  async deleteRow(opts: DeleteRowOptions): Promise<MutationResult> {
    const { database, schema, table } = opts;
    const rel = `${ident(schema)}.${ident(table)}`;
    const params: unknown[] = [];
    const whereClause = whereFromId(opts.id, params);

    const res = await getPool(database).query(
      `delete from ${rel} where ${whereClause}`,
      params
    );
    if ((res.rowCount ?? 0) === 0) {
      throw new Error("row not found — it may have changed; refresh and retry");
    }
    return { rowCount: res.rowCount ?? 0 };
  },

  runQuery(opts: RunQueryOptions): Promise<RunResult> {
    return pgRunQuery(opts);
  },

  async createDatabase(name: string): Promise<void> {
    const clean = name.trim();
    if (!SAFE_DB_NAME.test(clean) || clean.length > 63) {
      throw new Error("invalid database name");
    }
    await getAdminPool().query(`CREATE DATABASE "${clean}"`);
  },

  async health(): Promise<HealthInfo> {
    const res = await pgQuery<{
      version: string;
      database: string;
      now: string;
    }>(
      "select version() as version, current_database() as database, now()::text as now"
    );
    const row = res.rows[0];
    return { version: row.version, database: row.database, serverTime: row.now };
  },

  async databaseStats(database: string): Promise<DatabaseStats> {
    const { rows } = await getPool(database).query<{
      size_bytes: string;
      size_pretty: string;
      version: string;
      uptime_seconds: string;
      connections: string;
      max_connections: string;
      table_count: string;
      index_count: string;
      est_rows: string;
    }>(
      `select
         pg_database_size(current_database())::text                  as size_bytes,
         pg_size_pretty(pg_database_size(current_database()))         as size_pretty,
         split_part(current_setting('server_version'), ' ', 1)       as version,
         extract(epoch from (now() - pg_postmaster_start_time()))::bigint::text as uptime_seconds,
         (select count(*) from pg_stat_activity
            where datname = current_database())::text                 as connections,
         current_setting('max_connections')                          as max_connections,
         (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where c.relkind in ('r','p') and ${USER_RELS})::text      as table_count,
         (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where c.relkind = 'i' and ${USER_RELS})::text             as index_count,
         (select coalesce(sum(greatest(c.reltuples, 0)),0)::bigint from pg_class c
            join pg_namespace n on n.oid = c.relnamespace
            where c.relkind in ('r','p') and ${USER_RELS})::text      as est_rows`
    );
    const r = rows[0];
    return {
      sizeBytes: Number(r.size_bytes),
      sizePretty: r.size_pretty,
      version: r.version,
      uptimeSeconds: Number(r.uptime_seconds),
      connections: Number(r.connections),
      maxConnections: Number(r.max_connections),
      tableCount: Number(r.table_count),
      indexCount: Number(r.index_count),
      estRows: Number(r.est_rows),
    };
  },

  async tableSizes(database: string, limit = 8): Promise<TableSize[]> {
    const lim = Math.min(Math.max(limit, 1), 50);
    const { rows } = await getPool(database).query<{
      schema: string;
      name: string;
      bytes: string;
      pretty: string;
    }>(
      `select n.nspname as schema, c.relname as name,
              pg_total_relation_size(c.oid)::text as bytes,
              pg_size_pretty(pg_total_relation_size(c.oid)) as pretty
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where c.relkind in ('r','m','p') and ${USER_RELS}
       order by pg_total_relation_size(c.oid) desc
       limit $1`,
      [lim]
    );
    return rows.map((r) => ({
      schema: r.schema,
      name: r.name,
      bytes: Number(r.bytes),
      pretty: r.pretty,
    }));
  },

  async advisors(database: string): Promise<Advisors> {
    const { rows } = await getPool(database).query<{
      unused_indexes: string;
      vacuum_tables: string;
      tables_without_pk: string;
      cache_hit_ratio: string | null;
    }>(
      `select
         (select count(*) from pg_stat_user_indexes ui
            join pg_index i on i.indexrelid = ui.indexrelid
            where ui.idx_scan = 0 and not i.indisunique and not i.indisprimary)::text
                                                                        as unused_indexes,
         (select count(*) from pg_stat_user_tables
            where n_dead_tup > 1000 and n_dead_tup > 0.1 * (n_live_tup + 1))::text
                                                                        as vacuum_tables,
         (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where c.relkind = 'r' and ${USER_RELS}
              and not exists (select 1 from pg_constraint con
                              where con.conrelid = c.oid and con.contype = 'p'))::text
                                                                        as tables_without_pk,
         (select round(100.0 * sum(blks_hit) / nullif(sum(blks_hit) + sum(blks_read), 0), 1)::text
            from pg_stat_database where datname = current_database())   as cache_hit_ratio`
    );
    const r = rows[0];
    return {
      unusedIndexes: Number(r.unused_indexes),
      vacuumTables: Number(r.vacuum_tables),
      tablesWithoutPk: Number(r.tables_without_pk),
      cacheHitRatio: r.cache_hit_ratio === null ? null : Number(r.cache_hit_ratio),
    };
  },

  async relations(database: string): Promise<Relations> {
    const pool = getPool(database);
    const [tablesRes, fkRes] = await Promise.all([
      pool.query<{ schema: string; name: string }>(
        `select n.nspname as schema, c.relname as name
         from pg_class c join pg_namespace n on n.oid = c.relnamespace
         where c.relkind in ('r','p') and ${USER_RELS}
         order by 1, 2`
      ),
      pool.query<{
        name: string;
        schema: string;
        table: string;
        ref_schema: string;
        ref_table: string;
      }>(
        `select con.conname as name,
                ns.nspname  as schema,  cl.relname  as table,
                fns.nspname as ref_schema, fcl.relname as ref_table
         from pg_constraint con
         join pg_class cl      on cl.oid  = con.conrelid
         join pg_namespace ns  on ns.oid  = cl.relnamespace
         join pg_class fcl     on fcl.oid = con.confrelid
         join pg_namespace fns on fns.oid = fcl.relnamespace
         where con.contype = 'f'
           and ns.nspname not in ('pg_catalog','information_schema')
           and ns.nspname !~ '^pg_'`
      ),
    ]);
    return {
      tables: tablesRes.rows.map((r) => ({ schema: r.schema, name: r.name })),
      foreignKeys: fkRes.rows.map((r) => ({
        name: r.name,
        schema: r.schema,
        table: r.table,
        refSchema: r.ref_schema,
        refTable: r.ref_table,
      })),
    };
  },

  isMutating(sql: string): boolean {
    return pgIsMutating(sql);
  },

  needsConfirm(sql: string): boolean {
    return pgNeedsConfirm(sql);
  },
};
