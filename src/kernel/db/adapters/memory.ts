// In-memory adapter for tests. Implements the full DBAdapter contract on top of
// a simple Map of tables. Does NOT support transactions across multiple writes
// (single-call transactions only) — fine for kernel tests.
//
// Supports multi-statement exec() (split on `;`). Not a full SQL parser; covers
// the SQL surface the kernel migrations and tests use.

import type { AnyFn, DBAdapter, DBStatement, Param } from "../types";

interface Table {
  cols: string[];
  rows: Record<string, unknown>[];
}

class MemoryDB {
  private tables = new Map<string, Table>();

  exec(sql: string): void {
    // Strip line comments before splitting on `;` so semicolons inside
    // comments don't break the parser. Block comments are rare in migrations
    // and are left as-is.
    const stripped = sql.replace(/^\s*--.*$/gm, "");
    const statements = stripped
      .split(/;\s*(?=$|\n)/m)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    for (const stmt of statements) this.execOne(stmt);
  }

  private execOne(trimmed: string): void {
    if (!trimmed) return;
    const createMatch = trimmed.match(
      /^CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?["'`]?(\w+)["'`]?\s*\(([\s\S]+)\)\s*$/i,
    );
    if (createMatch) {
      const name = createMatch[1];
      const hasIfNotExists = /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS/i.test(trimmed);
      // Respect IF NOT EXISTS — never overwrite an existing table (which would
      // wipe rows the migration runner just inserted).
      if (hasIfNotExists && this.tables.has(name)) return;
      const colsRaw = createMatch[2];
      const cols = colsRaw
        .split(",")
        .map((c) => c.trim().split(/\s+/)[0].replace(/["'`]/g, ""))
        .filter(
          (c) =>
            c &&
            !c.toUpperCase().startsWith("PRIMARY") &&
            !c.toUpperCase().startsWith("FOREIGN") &&
            !c.toUpperCase().startsWith("UNIQUE") &&
            !c.toUpperCase().startsWith("CHECK"),
        );
      this.tables.set(name, { cols, rows: [] });
      return;
    }
    if (/^CREATE\s+(UNIQUE\s+)?INDEX/i.test(trimmed)) {
      return;
    }
    if (/^DROP\s+TABLE/i.test(trimmed)) {
      const m = trimmed.match(/DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?["'`]?(\w+)["'`]?/i);
      if (m) this.tables.delete(m[1]);
      return;
    }
  }

  prepare(sql: string): DBStatement {
    return {
      run: (...params: Param[]) => this.execWrite(sql, params),
      get: <T>(...params: Param[]) => this.execRead(sql, params)[0] as T | undefined,
      all: <T>(...params: Param[]) => this.execRead(sql, params) as T[],
    };
  }

  transaction<T extends AnyFn>(fn: T): T {
    return ((...args: Parameters<T>) => fn(...args)) as T;
  }

  close(): void {
    this.tables.clear();
  }

  private execWrite(sql: string, params: Param[]): void {
    const ins = sql.match(/^INSERT\s+(?:OR\s+REPLACE\s+)?INTO\s+["'`]?(\w+)["'`]?\s*\(([^)]+)\)/i);
    if (ins) {
      const tableName = ins[1];
      const cols = ins[2].split(",").map((c) => c.trim().replace(/["'`]/g, ""));
      const table = this.tables.get(tableName);
      if (!table) throw new Error(`no such table: ${tableName}`);
      const row: Record<string, unknown> = {};
      cols.forEach((c, i) => (row[c] = params[i] ?? null));
      // For INSERT OR REPLACE, if a unique-key row exists, replace it.
      if (/INSERT\s+OR\s+REPLACE/i.test(sql)) {
        const pk = table.cols[0];
        const existing = table.rows.findIndex((r) => r[pk] === row[pk]);
        if (existing >= 0) table.rows[existing] = row;
        else table.rows.push(row);
      } else {
        table.rows.push(row);
      }
      return;
    }
    const upd = sql.match(/^UPDATE\s+["'`]?(\w+)["'`]?\s+SET\s+([\s\S]+?)\s+WHERE\s+([\s\S]+)$/i);
    if (upd) {
      const tableName = upd[1];
      const table = this.tables.get(tableName);
      if (!table) return;
      const setCols = upd[2].split(",").map((s) => s.split("=")[0].trim().replace(/["'`]/g, ""));
      const whereCol = upd[3].split("=")[0].trim().replace(/["'`]/g, "");
      const whereVal = params[setCols.length];
      for (const row of table.rows) {
        if (row[whereCol] === whereVal) {
          setCols.forEach((c, i) => (row[c] = params[i] ?? null));
        }
      }
      return;
    }
  }

  private execRead(sql: string, _params: Param[]): Record<string, unknown>[] {
    const sel = sql.match(
      /^SELECT\s+([\s\S]+?)\s+FROM\s+["'`]?(\w+)["'`]?(?:\s+WHERE\s+([\s\S]+?))?(?:\s+ORDER\s+BY\s+([\s\S]+?))?(?:\s+LIMIT\s+(\d+))?(?:\s+OFFSET\s+(\d+))?\s*$/i,
    );
    if (sel) {
      const colsRaw = sel[1].trim();
      const cols =
        colsRaw === "*"
          ? null
          : colsRaw.split(",").map(
              (c) =>
                c
                  .trim()
                  .replace(/["'`]/g, "")
                  .split(/\s+AS\s+/i)
                  .pop() as string,
            );
      const tableName = sel[2];
      const table = this.tables.get(tableName);
      if (!table) return [];
      let rows = table.rows;
      if (sel[3]) {
        const whereParts = sel[3].trim().split(/\s+AND\s+/i);
        rows = rows.filter((row) =>
          whereParts.every((p) => {
            const [col, val] = p.split("=").map((s) => s.trim().replace(/["'`]/g, ""));
            if (val === "?") return true;
            return row[col] === val.replace(/^['"`]|['"`]$/g, "");
          }),
        );
      }
      if (sel[4]) {
        const [col, dir] = sel[4].trim().split(/\s+/);
        rows = [...rows].sort((a, b) => {
          const av = a[col];
          const bv = b[col];
          const cmp =
            (av as number | string) < (bv as number | string)
              ? -1
              : (av as number | string) > (bv as number | string)
                ? 1
                : 0;
          return dir?.toUpperCase() === "DESC" ? -cmp : cmp;
        });
      }
      if (sel[5]) rows = rows.slice(0, parseInt(sel[5], 10));
      if (!cols) return rows;
      return rows.map((r) => Object.fromEntries(cols.map((c) => [c, r[c]])));
    }
    return [];
  }
}

export function createMemoryAdapter(): DBAdapter {
  const inner = new MemoryDB();
  return {
    kind: "memory",
    exec: (sql) => inner.exec(sql),
    prepare: (sql) => inner.prepare(sql),
    transaction: (fn) => inner.transaction(fn),
    close: () => inner.close(),
  };
}
