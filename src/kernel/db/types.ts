// Database adapter contract — every runtime (Bun, Node, Cloudflare D1, Postgres)
// implements this. The kernel and plugins only see this interface, never a
// concrete client. This is what makes the "Local-first / Adapters in prod" line
// from .lovable/plan.md §0.6 a real boundary.

export type Param = string | number | bigint | boolean | null | Uint8Array | Date;

export interface DBStatement {
  run(...params: Param[]): void;
  get<T = Record<string, unknown>>(...params: Param[]): T | undefined;
  all<T = Record<string, unknown>>(...params: Param[]): T[];
}

// Function passed to transaction(). TParams captures the parameter list shape
// of the wrapped function so callers preserve full type safety.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyFn = (...args: any[]) => unknown;

export interface DBAdapter {
  exec(sql: string): void;
  prepare(sql: string): DBStatement;
  transaction<T extends AnyFn>(fn: T): T;
  close(): void;
  /** Adapter identifier for logs ("bun-sqlite", "memory", "d1", "postgres") */
  readonly kind: string;
}

export interface DBConfig {
  /** File path for file-backed adapters. Ignored by memory / remote adapters. */
  path?: string;
  /** Read-only mode (no migrations). */
  readonly?: boolean;
  /** Override the default migrations directory (used by tests). */
  migrationsDir?: string;
}
