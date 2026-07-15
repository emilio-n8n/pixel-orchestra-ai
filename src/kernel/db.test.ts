import { describe, it, expect, beforeEach } from "bun:test";
import { createMemoryAdapter } from "./db";
import { runMigrations } from "./db/migrate";
import { createBunSqliteAdapter } from "./db/adapters/bun-sqlite";

describe("memory adapter", () => {
  it("executes CREATE TABLE and basic INSERT/SELECT", () => {
    const db = createMemoryAdapter();
    db.exec("CREATE TABLE t (id TEXT, v INTEGER)");
    db.prepare("INSERT INTO t (id, v) VALUES (?, ?)").run("a", 1);
    db.prepare("INSERT INTO t (id, v) VALUES (?, ?)").run("b", 2);
    const rows = db.prepare("SELECT id, v FROM t ORDER BY v ASC").all<{ id: string; v: number }>();
    expect(rows).toEqual([
      { id: "a", v: 1 },
      { id: "b", v: 2 },
    ]);
  });
});

describe("migrations", () => {
  it("applies pending migrations and skips applied ones", () => {
    const db = createMemoryAdapter();
    const r1 = runMigrations(db);
    expect(r1.applied.length).toBeGreaterThan(0);
    const r2 = runMigrations(db);
    expect(r2.applied.length).toBe(0);
    expect(r2.skipped.length).toBe(r1.applied.length);
  });

  it("creates the workspaces, projects and event_log tables", () => {
    const db = createMemoryAdapter();
    runMigrations(db);
    db.prepare("INSERT INTO workspaces (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)").run(
      "w1",
      "Test",
      1,
      1,
    );
    const row = db.prepare("SELECT name FROM workspaces WHERE id = ?").get<{ name: string }>("w1");
    expect(row?.name).toBe("Test");
    db.prepare("INSERT INTO event_log (id, type, payload_json, ts) VALUES (?, ?, ?, ?)").run(
      "e1",
      "Custom.x",
      "{}",
      1,
    );
    const ev = db.prepare("SELECT type FROM event_log WHERE id = ?").get<{ type: string }>("e1");
    expect(ev?.type).toBe("Custom.x");
  });
});

describe("bun-sqlite adapter (integration)", () => {
  // These run only when bun:sqlite is available (i.e. under Bun).
  const isBun = typeof (globalThis as { Bun?: unknown }).Bun !== "undefined";
  if (!isBun) {
    it("skipped (not running under Bun)", () => {});
    return;
  }

  let mod: import("./db/adapters/bun-sqlite").BunSqliteModule;

  beforeEach(async () => {
    mod = (await import(
      "bun:sqlite" as string
    )) as unknown as import("./db/adapters/bun-sqlite").BunSqliteModule;
  });

  it("opens an in-memory DB and roundtrips data", () => {
    const db = createBunSqliteAdapter(mod, ":memory:");
    db.exec("CREATE TABLE t (id TEXT, v INTEGER)");
    db.prepare("INSERT INTO t (id, v) VALUES (?, ?)").run("a", 1);
    const row = db.prepare("SELECT v FROM t WHERE id = ?").get<{ v: number }>("a");
    expect(row?.v).toBe(1);
  });
});
