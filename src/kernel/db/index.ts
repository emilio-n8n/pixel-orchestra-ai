// Database singleton. Picks the right adapter for the runtime:
//   - Bun (dev + local-only)         → bun-sqlite
//   - Browser / unsupported runtime  → throws on getDb()
//
// Migrations run on first init. Path defaults to ~/.lilium/lilium.db,
// override with LILIUM_DB_PATH. The DB is created lazily so importing this
// module from a browser bundle does not touch the filesystem.

import type { DBAdapter, DBConfig } from "./types";
// NOTE: `./migrate` and `./adapters/bun-sqlite` are imported lazily inside
// `initAdapter()` so the client bundle never pulls in `node:fs` / `bun:sqlite`.

let _db: DBAdapter | null = null;
let _initPromise: Promise<DBAdapter> | null = null;

function defaultDbPath(): string {
  if (typeof process !== "undefined" && process.env?.LILIUM_DB_PATH) {
    return process.env.LILIUM_DB_PATH;
  }
  const home = (typeof process !== "undefined" && process.env?.HOME) || "~";
  const safeHome = home === "~" ? "." : home;
  return `${safeHome}/.lilium/lilium.db`;
}

function mkdirpFor(filePath: string): void {
  // Lazy: only import node:fs when we're actually opening a file. Browser code
  // never reaches this branch.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require("node:fs") as typeof import("node:fs");
  const dir = filePath.substring(0, filePath.lastIndexOf("/"));
  if (dir) fs.mkdirSync(dir, { recursive: true });
}

async function initAdapter(): Promise<DBAdapter> {
  if (typeof window !== "undefined") {
    throw new Error("Lilium DB is server-only (window detected).");
  }
  if (typeof (globalThis as { Bun?: unknown }).Bun === "undefined") {
    // Published builds run in an edge Worker where bun:sqlite is unavailable.
    // Keep legacy/local-only plugins operational for the lifetime of the
    // isolate; durable product data lives in Lovable Cloud.
    const { createMemoryAdapter } = await import("./adapters/memory");
    const adapter = createMemoryAdapter();
    adapter.exec(`
      CREATE TABLE IF NOT EXISTS connectors (id TEXT PRIMARY KEY, workspace_id TEXT, project_id TEXT, plugin_id TEXT, kind TEXT, name TEXT, config_json TEXT, status TEXT, created_at INTEGER, updated_at INTEGER);
      CREATE TABLE IF NOT EXISTS capabilities (id TEXT PRIMARY KEY, connector_id TEXT, cap_ref TEXT, kind TEXT, media_json TEXT, schema_in TEXT, schema_out TEXT, tags_json TEXT, detected_at INTEGER);
      CREATE TABLE IF NOT EXISTS graphs (id TEXT PRIMARY KEY, project_id TEXT, name TEXT, doc_json TEXT, is_template INTEGER, created_at INTEGER, updated_at INTEGER);
      CREATE TABLE IF NOT EXISTS graph_runs (id TEXT PRIMARY KEY, graph_id TEXT, status TEXT, started_at INTEGER, finished_at INTEGER, stats_json TEXT);
      CREATE TABLE IF NOT EXISTS node_runs (id TEXT PRIMARY KEY, graph_run_id TEXT, node_id TEXT, status TEXT, input_json TEXT, output_json TEXT, logs TEXT, capability_id TEXT);
      CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, project_id TEXT, graph_run_id TEXT, node_run_id TEXT, status TEXT, progress REAL, note TEXT, error TEXT, result_json TEXT, created_at INTEGER, updated_at INTEGER);
      CREATE TABLE IF NOT EXISTS assets (id TEXT PRIMARY KEY, project_id TEXT, kind TEXT, name TEXT, mime TEXT, size_bytes INTEGER, blob_hash TEXT, thumbnail_hash TEXT, meta_json TEXT, created_at INTEGER, updated_at INTEGER);
      CREATE TABLE IF NOT EXISTS asset_provenance (asset_id TEXT PRIMARY KEY, graph_run_id TEXT, node_run_id TEXT, source_asset_ids_json TEXT, params_json TEXT, capability_id TEXT, seed TEXT);
      CREATE TABLE IF NOT EXISTS context_entries (id TEXT PRIMARY KEY, project_id TEXT, kind TEXT, key TEXT, value_json TEXT, embedding TEXT);
      CREATE TABLE IF NOT EXISTS snapshots (id TEXT PRIMARY KEY, project_id TEXT, entity_type TEXT, entity_id TEXT, version INTEGER, blob_json TEXT, reason TEXT, created_at INTEGER);
      CREATE TABLE IF NOT EXISTS scenes (id TEXT PRIMARY KEY, project_id TEXT, name TEXT, \`order\` INTEGER, description TEXT, created_at INTEGER);
      CREATE TABLE IF NOT EXISTS shots (id TEXT PRIMARY KEY, scene_id TEXT, name TEXT, \`order\` INTEGER, duration_ms INTEGER, asset_id TEXT, created_at INTEGER);
    `);
    console.warn("[db] bun:sqlite unavailable; using an ephemeral compatibility database");
    return adapter;
  }
  const path = defaultDbPath();
  mkdirpFor(path);

  // Dynamic import so Vite's client bundle never sees bun:sqlite.
  const moduleName = "bun:sqlite";
  const mod = (await import(/* @vite-ignore */ moduleName)) as {
    Database: new (path: string) => unknown;
  };
  const { createBunSqliteAdapter } = await import("./adapters/bun-sqlite");
  const adapter = createBunSqliteAdapter(
    mod as unknown as import("./adapters/bun-sqlite").BunSqliteModule,
    path,
  );
  const { runMigrations } = await import("./migrate");
  runMigrations(adapter);
  return adapter;
}

export async function initDb(): Promise<DBAdapter> {
  if (_db) return _db;
  if (!_initPromise) {
    _initPromise = initAdapter().then((db) => {
      _db = db;
      return db;
    });
  }
  return _initPromise;
}

export function getDb(): DBAdapter {
  if (_db) return _db;
  throw new Error("DB not initialized. Call await initDb() at server startup before getDb().");
}

/** Test-only: inject a pre-built adapter. Bypasses runtime detection. */
export function __setDbForTests(adapter: DBAdapter | null): void {
  _db = adapter;
  _initPromise = null;
}

export type { DBAdapter, DBConfig } from "./types";
export { createMemoryAdapter } from "./adapters/memory";
