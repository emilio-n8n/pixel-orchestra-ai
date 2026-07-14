import { describe, it, expect, beforeEach } from "bun:test";
import { createEventBus } from "./event-bus";
import { createEventLogPersister } from "./db/event-log";
import { createMemoryAdapter, runMigrations } from "./db";

describe("event-bus", () => {
  it("emits to handlers matching the exact type", () => {
    const bus = createEventBus();
    const seen: string[] = [];
    bus.on("PluginActivated", (e) => {
      seen.push(e.pluginId);
    });
    bus.emit({ type: "PluginActivated", pluginId: "p1" });
    bus.emit({ type: "PluginActivated", pluginId: "p2" });
    bus.emit({ type: "PluginError", pluginId: "p3", error: "x" });
    expect(seen).toEqual(["p1", "p2"]);
  });

  it("supports wildcard patterns", () => {
    const bus = createEventBus();
    const all: string[] = [];
    const jobs: string[] = [];
    bus.on("*", (e) => {
      all.push(e.type);
    });
    bus.on("Job.*", (e) => {
      jobs.push(e.type);
    });
    bus.emit({ type: "JobQueued", jobId: "j1" });
    bus.emit({ type: "JobFinished", jobId: "j1", resultAssetIds: [] });
    bus.emit({ type: "PluginActivated", pluginId: "p" });
    expect(all).toEqual(["JobQueued", "JobFinished", "PluginActivated"]);
    expect(jobs).toEqual(["JobQueued", "JobFinished"]);
  });

  it("returns an unsubscribe function", () => {
    const bus = createEventBus();
    let n = 0;
    const off = bus.on("Custom.x", () => {
      n++;
    });
    bus.emit({ type: "Custom.x", payload: 1 });
    off();
    bus.emit({ type: "Custom.x", payload: 2 });
    expect(n).toBe(1);
  });

  it("keeps a bounded history", () => {
    const bus = createEventBus({ historyLimit: 3 });
    for (let i = 0; i < 5; i++) {
      bus.emit({ type: "Custom.x", payload: i });
    }
    expect(bus.history().length).toBe(3);
    expect(bus.history().map((e) => (e as unknown as { payload: number }).payload)).toEqual([
      2, 3, 4,
    ]);
  });

  it("swallows handler errors and continues dispatching", () => {
    const bus = createEventBus();
    let n = 0;
    bus.on("Custom.x", () => {
      throw new Error("boom");
    });
    bus.on("Custom.x", () => {
      n++;
    });
    const orig = console.error;
    console.error = () => {};
    bus.emit({ type: "Custom.x" });
    console.error = orig;
    expect(n).toBe(1);
  });
});

describe("event-bus with DB persister", () => {
  let db: ReturnType<typeof createMemoryAdapter>;
  beforeEach(() => {
    db = createMemoryAdapter();
    runMigrations(db);
  });

  it("persists events to event_log", () => {
    const bus = createEventBus({ persister: createEventLogPersister(db) });
    bus.emit({ type: "PluginActivated", pluginId: "p1" });
    bus.emit({ type: "JobFinished", jobId: "j1", resultAssetIds: ["a"] });
    const rows = db.prepare("SELECT type FROM event_log ORDER BY ts ASC").all<{ type: string }>();
    expect(rows.map((r) => r.type)).toEqual(["PluginActivated", "JobFinished"]);
  });

  it("hydrates history from the persister on construction", () => {
    const persister = createEventLogPersister(db);
    db.prepare(
      "INSERT INTO event_log (id, workspace_id, project_id, type, payload_json, actor, ts) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(
      "evt_seed",
      null,
      null,
      "PluginActivated",
      JSON.stringify({ pluginId: "seed" }),
      null,
      1000,
    );
    const bus = createEventBus({ persister });
    const history = bus.history();
    expect(history.length).toBe(1);
    expect(history[0].type).toBe("PluginActivated");
  });
});
