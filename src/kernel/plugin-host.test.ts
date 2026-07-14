import { describe, it, expect, beforeEach } from "bun:test";
import { createPluginHost, KERNEL_VERSION } from "./plugin-host";
import { createEventBus } from "./event-bus";
import { createRegistry } from "./registry";
import type { PluginManifest } from "./contracts/plugin";

describe("plugin-host", () => {
  function makeHost(notify?: (m: string) => void) {
    const events = createEventBus();
    const registry = createRegistry();
    const seen: string[] = [];
    events.on("PluginActivated", (e) => {
      seen.push(e.pluginId);
    });
    events.on("PluginError", (e) => {
      seen.push(`${e.pluginId}:${e.error}`);
    });
    const host = createPluginHost({
      events,
      registry,
      notify: notify ?? (() => {}),
    });
    return { host, registry, seen };
  }

  it("registers a plugin and runs activate", async () => {
    const { host, seen } = makeHost();
    const manifest: PluginManifest = {
      id: "test.a",
      name: "A",
      version: "0.1.0",
      engines: { lilium: `^${KERNEL_VERSION}` },
      contributes: {
        panels: [{ id: "a.center", title: "A", slot: "center", component: () => null }],
      },
      activate: (ctx) => {
        ctx.events.emit({ type: "Custom.a", payload: ctx.pluginId });
      },
    };
    await host.register(manifest);
    expect(host.isActive("test.a")).toBe(true);
    expect(host.count()).toBe(1);
    expect(seen).toContain("test.a");
    expect(host.list()[0].id).toBe("test.a");
  });

  it("logs a warning for mismatched engines.lilium and continues", async () => {
    const { host } = makeHost();
    const warnings: unknown[][] = [];
    const orig = console.warn;
    console.warn = (...args) => {
      warnings.push(args);
    };
    await host.register({
      id: "test.bad",
      name: "Bad",
      version: "0.0.1",
      engines: { lilium: "^99.0.0" },
      contributes: {},
    });
    console.warn = orig;
    expect(warnings.length).toBeGreaterThan(0);
    expect(host.isActive("test.bad")).toBe(true);
  });

  it("emits PluginError and refuses to activate when activate throws", async () => {
    const { host, seen } = makeHost();
    await host.register({
      id: "test.boom",
      name: "Boom",
      version: "0.1.0",
      engines: { lilium: "^0.1.0" },
      contributes: {},
      activate: () => {
        throw new Error("kaboom");
      },
    });
    expect(host.isActive("test.boom")).toBe(false);
    expect(seen.some((s) => s.startsWith("test.boom:"))).toBe(true);
  });

  it("unregisters and removes contributions", async () => {
    const { host, registry } = makeHost();
    await host.register({
      id: "test.u",
      name: "U",
      version: "0.1.0",
      engines: { lilium: "^0.1.0" },
      contributes: {
        panels: [{ id: "u.center", title: "U", slot: "center", component: () => null }],
      },
    });
    expect(registry.panels.length).toBe(1);
    await host.unregister("test.u");
    expect(host.count()).toBe(0);
    expect(registry.panels.length).toBe(0);
  });

  it("skips duplicate registrations", async () => {
    const { host } = makeHost();
    const m: PluginManifest = {
      id: "test.dup",
      name: "Dup",
      version: "0.1.0",
      engines: { lilium: "^0.1.0" },
      contributes: {},
    };
    await host.register(m);
    await host.register(m);
    expect(host.count()).toBe(1);
  });
});
