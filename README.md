<div align="center">

# lla.ma base

**The self-hosted, AI-native database console — Supabase Studio's polish, for any Postgres, on your own box.**

Browse schema, edit data, run SQL, and read an at-a-glance Overview dashboard for *any* PostgreSQL database — RDS, Neon, a bare VPS, or your laptop. No vendor lock-in. Runs as a single container you own.

</div>

---

## Why

Supabase Studio is lovely — but it only manages a *Supabase* database. The moment your Postgres lives anywhere else, you're back to `psql` or a heavyweight desktop client. lla.ma base gives you that same polish for **any** Postgres, self-hosted.

- **Overview dashboard** — size, table/row/index counts, largest tables, advisors (unused indexes, vacuum, missing PKs, cache hit) and a live **schema map** (foreign-key graph). All from instant catalog queries.
- **Browse & edit** — paginated, sortable, PK-aware data grid with inline edit / insert / delete. Tables without a primary key are edited safely via `ctid`.
- **SQL editor** — query history, multi-statement support, and a result grid.
- **Safety first** — **read-only by default**; mutations are blocked until you flip to write mode, and destructive statements (`DROP` / `TRUNCATE` / `ALTER`, unscoped `DELETE`/`UPDATE`) require an explicit confirm. *A console that won't let you `TRUNCATE` production by accident.*
- **Your credentials never reach the browser** — all database access is server-side.
- **AI-native, bring your own key** *(on the roadmap)* — natural-language → SQL that runs against your own model key, never a managed middleman.

---

## Quick start (Docker)

```bash
docker build -t llama-base .

docker run --rm -p 3939:3939 \
  -e PG_HOST=host.docker.internal \
  -e PG_PORT=5432 \
  -e PG_USER=postgres \
  -e PG_PASSWORD=your_password \
  llama-base
```

Open <http://localhost:3939>. Pick a database on the left — you land on its Overview.

> `host.docker.internal` reaches a Postgres running on your host machine. For a remote database, set `PG_HOST` to its address (and `PG_SSL=require`).

## Quick start (local dev)

```bash
npm install
cp .env.example .env   # then edit the PG_* values
npm run dev            # http://127.0.0.1:3939
```

---

## Configuration

All config is environment variables (no UI to clutter — point it at a database and go):

| Variable | Default | Description |
|---|---|---|
| `PG_HOST` | `127.0.0.1` | Postgres host |
| `PG_PORT` | `5432` | Postgres port |
| `PG_USER` | `postgres` | Connection user |
| `PG_PASSWORD` | — | Connection password |
| `PG_ADMIN_DB` | `postgres` | Admin database for server-level ops (list/create database) |
| `PG_SSL` | `off` | `off` \| `require` (self-signed) \| `verify` (validate cert) |
| `LLAMA_DB_ENGINE` | `postgres` | Database engine (Postgres today; MySQL & Mongo planned) |

### Connecting to a remote box over SSH

If your Postgres isn't exposed publicly (it shouldn't be), lla.ma base can open the SSH tunnel for you — no second terminal, no manual `ssh` command. Add an `SSH_*` block to `.env`:

```bash
SSH_TUNNEL=on
SSH_HOST=your-box.example.com
SSH_USER=ubuntu
SSH_KEY=~/.ssh/id_rsa        # omit to use your ssh-agent
SSH_REMOTE_PORT=5432         # the DB port on that box
# point the app at the tunnel's local end:
PG_HOST=127.0.0.1
PG_PORT=5433
```

Then `npm run dev` opens the tunnel automatically before starting the app (and closes it on exit). Need just the tunnel? `npm run tunnel`. Connecting to a local/RDS/Neon database instead? Leave `SSH_TUNNEL` unset and `npm run dev` is a plain dev server.

---

## How it's built

Next.js (App Router) + React + Tailwind, TypeScript, the `pg` driver. The shared
[`@lla-ma/ui`](https://www.npmjs.com/package/@lla-ma/ui) design system supplies the
header/footer shell and theme tokens. Every database operation goes through a single
engine-agnostic **adapter** (`lib/adapters/`), so the API and UI never touch a driver
directly — which is how MySQL and Mongo will slot in later as one adapter file each.

```
app/api/*        route handlers — call getAdapter(), never pg directly
lib/adapters/    DatabaseAdapter contract + the Postgres adapter
lib/db.ts        pg connection pools (one per database, lazy)
lib/introspect   catalog queries (schemas, tables, columns, keys)
components/      Overview, SchemaMap, DataGrid, SqlEditor, Sidebar
```

---

## Roadmap

- [x] Connect to any Postgres · schema browser · SQL editor
- [x] PK-aware data grid with inline edit / insert / delete
- [x] Overview dashboard + foreign-key schema map
- [ ] MySQL adapter, then MongoDB
- [ ] Natural-language → SQL (bring your own API key)

**lla.ma base is free and self-hostable forever.** A hosted edition (**LLA.MA&nbsp;PRO**) will add the things that need a server recording history — trend charts over time, query-latency monitoring, alerts, team collaboration, managed AI — and fuse the database console with app hosting under one login. The console you self-host stays complete on its own; PRO is convenience and the timeline, not a paywall on the basics.

---

## License

Apache-2.0 — see [LICENSE](LICENSE).
