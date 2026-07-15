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
    throw new Error(
      "No SQLite runtime detected. Lilium dev requires Bun (uses bun:sqlite). " +
        "Run with `bun run dev` or wire a Node-compatible DB adapter.",
    );
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
  if (!_initPromise) _initPromise = initAdapter();
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
