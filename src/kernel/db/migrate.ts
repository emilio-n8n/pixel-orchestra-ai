// Migration runner. Reads every .sql file under the migrations dir in lexical
// order, splits on `--> statement-breakpoint` (Drizzle convention) and applies
// each chunk inside a transaction. Tracks applied filenames in `_migrations`
// so re-runs are no-ops. Idempotent.

import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { DBAdapter } from "./types";

export interface MigrationResult {
  applied: string[];
  skipped: string[];
}

function splitStatements(sql: string): string[] {
  return sql
    .split(/-->\s*statement-breakpoint/i)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function defaultMigrationsDir(): string {
  // src/kernel/db/migrate.ts → ../../../db/migrations
  // We resolve relative to CWD so this works in dev (Vite) and at build time.
  return resolve(process.cwd(), "src/kernel/db/migrations");
}

export function runMigrations(db: DBAdapter, migrationsDir?: string): MigrationResult {
  const dir = migrationsDir ?? defaultMigrationsDir();
  db.exec(`CREATE TABLE IF NOT EXISTS _migrations (
    name TEXT PRIMARY KEY,
    applied_at INTEGER NOT NULL
  )`);

  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const applied: string[] = [];
  const skipped: string[] = [];

  const seen = new Set(
    db
      .prepare("SELECT name FROM _migrations")
      .all<{ name: string }>()
      .map((r) => r.name),
  );

  for (const file of files) {
    if (seen.has(file)) {
      skipped.push(file);
      continue;
    }
    const sql = readFileSync(join(dir, file), "utf8");
    const statements = splitStatements(sql);
    const tx = db.transaction(() => {
      for (const stmt of statements) db.exec(stmt);
      db.prepare("INSERT INTO _migrations (name, applied_at) VALUES (?, ?)").run(file, Date.now());
    });
    tx();
    applied.push(file);
  }

  return { applied, skipped };
}
