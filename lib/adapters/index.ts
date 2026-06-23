import type { DatabaseAdapter, Engine } from "./types";
import { postgresAdapter } from "./postgres";

export * from "./types";

/**
 * Adapter registry. Route handlers call `getAdapter()` and get back whichever
 * engine this instance is configured for. Today that's Postgres; MySQL and
 * Mongo slot in here as they're built — no route or UI changes required.
 */

const adapters: Partial<Record<Engine, DatabaseAdapter>> = {
  postgres: postgresAdapter,
};

const DEFAULT_ENGINE = (process.env.LLAMA_DB_ENGINE as Engine) || "postgres";

export function getAdapter(engine: Engine = DEFAULT_ENGINE): DatabaseAdapter {
  const adapter = adapters[engine];
  if (!adapter) {
    const supported = Object.keys(adapters).join(", ");
    throw new Error(
      `No adapter for engine "${engine}" yet. Supported: ${supported}.`
    );
  }
  return adapter;
}
