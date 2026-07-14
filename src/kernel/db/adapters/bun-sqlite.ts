// Bun runtime SQLite adapter. Uses `bun:sqlite` (built-in, no native compile).
// Kept in its own file so the rest of the kernel never imports `bun:sqlite`
// directly — the dynamic import in `index.ts` is the only consumer.

import type { AnyFn, DBAdapter, DBStatement, Param } from "../types";

export interface BunSqliteModule {
  Database: new (path: string) => BunDatabase;
}

interface BunDatabase {
  exec(sql: string): void;
  prepare(sql: string): BunStatement;
  transaction<T extends AnyFn>(fn: T): T;
  close(): void;
}

interface BunStatement {
  run(...params: Param[]): void;
  get(...params: Param[]): unknown;
  all(...params: Param[]): unknown[];
  values(...params: Param[]): unknown[][];
}

function wrap(stmt: BunStatement): DBStatement {
  return {
    run(...params: Param[]) {
      stmt.run(...params);
    },
    get<T = Record<string, unknown>>(...params: Param[]) {
      return stmt.get(...params) as T | undefined;
    },
    all<T = Record<string, unknown>>(...params: Param[]) {
      return stmt.all(...params) as T[];
    },
  };
}

export function createBunSqliteAdapter(mod: BunSqliteModule, path: string): DBAdapter {
  const db = new mod.Database(path);
  return {
    kind: "bun-sqlite",
    exec(sql) {
      db.exec(sql);
    },
    prepare(sql) {
      return wrap(db.prepare(sql));
    },
    transaction(fn) {
      return db.transaction(fn);
    },
    close() {
      db.close();
    },
  };
}
