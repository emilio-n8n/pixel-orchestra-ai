import type { PluginContext, PluginManifest } from "./contracts/plugin";
import type { EventBus } from "./event-bus";
import type { Registry } from "./registry";

export interface PluginHost {
  register(manifest: PluginManifest): Promise<void>;
  unregister(pluginId: string): Promise<void>;
  list(): PluginManifest[];
  isActive(pluginId: string): boolean;
  count(): number;
}

const KERNEL_VERSION = "0.1.0";

/** Tiny semver check: accepts "^x.y.z" or "x.y.z". Returns true if compatible. */
function engineMatches(engineRange: string | undefined, kernelVersion: string): boolean {
  if (!engineRange) return true;
  const range = engineRange.trim();
  if (range.startsWith("^")) {
    const [maj, min] = range
      .slice(1)
      .split(".")
      .map((n) => parseInt(n, 10));
    const [kmaj, kmin] = kernelVersion.split(".").map((n) => parseInt(n, 10));
    if (Number.isNaN(maj) || Number.isNaN(kmaj)) return true;
    if (kmaj !== maj) return false;
    return Number.isNaN(min) || Number.isNaN(kmin) || kmin >= min;
  }
  return true;
}

export function createPluginHost(deps: {
  events: EventBus;
  registry: Registry;
  notify?: (message: string, kind?: "info" | "success" | "warn" | "error") => void;
  storage?: import("./storage/types").BlobStore;
}): PluginHost {
  const manifests = new Map<string, PluginManifest>();
  const active = new Set<string>();

  function contextFor(manifest: PluginManifest): PluginContext {
    const ctx: PluginContext = {
      pluginId: manifest.id,
      events: deps.events,
      registry: deps.registry,
      logger: {
        info: (m, meta) => console.info(`[${manifest.id}]`, m, meta ?? ""),
        warn: (m, meta) => console.warn(`[${manifest.id}]`, m, meta ?? ""),
        error: (m, meta) => console.error(`[${manifest.id}]`, m, meta ?? ""),
      },
      ui: {
        notify: (message, kind) => deps.notify?.(message, kind),
      },
    };
    if (deps.storage) ctx.storage = deps.storage;
    // HTTP and secrets are scoped per-plugin (phase 3). Built here, not at
    // host construction, so each plugin gets a fresh client bound to its
    // own declared `net:` permissions.
    try {
      // Lazy require — keeps the kernel's static import surface tight.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { httpForPlugin } = require("./http") as typeof import("./http");
      ctx.http = httpForPlugin(manifest);
    } catch {
      /* http subsystem not available */
    }
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { createFsSecrets } = require("./secrets/fs") as typeof import("./secrets/fs");
      ctx.secrets = createFsSecrets(manifest.id);
    } catch {
      /* secrets subsystem not available (e.g. browser) */
    }
    return ctx;
  }

  return {
    async register(manifest) {
      if (manifests.has(manifest.id)) {
        console.warn(`[plugin-host] ${manifest.id} already registered — skipping`);
        return;
      }

      // Engine compatibility check.
      if (!engineMatches(manifest.engines?.lilium, KERNEL_VERSION)) {
        console.warn(
          `[plugin-host] ${manifest.id} declares engines.lilium=${manifest.engines?.lilium}, kernel is ${KERNEL_VERSION} — registering anyway`,
        );
      }

      // Surface declared permissions so users can audit the active set.
      if (manifest.permissions?.length) {
        console.info(
          `[plugin-host] ${manifest.id} requests permissions:`,
          manifest.permissions.join(", "),
        );
      }

      manifests.set(manifest.id, manifest);
      const ctx = contextFor(manifest);

      const c = manifest.contributes;
      c.panels?.forEach((p) => deps.registry.addPanel(manifest.id, p));
      c.commands?.forEach((cmd) => deps.registry.addCommand(manifest.id, cmd));
      c.connectors?.forEach((cn) => deps.registry.addConnector(manifest.id, cn));
      c.viewers?.forEach((v) => deps.registry.addViewer(manifest.id, v));
      c.nodes?.forEach((n) => deps.registry.addNode(manifest.id, n));

      try {
        await manifest.activate?.(ctx);
        active.add(manifest.id);
        deps.events.emit({ type: "PluginActivated", pluginId: manifest.id });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        deps.events.emit({ type: "PluginError", pluginId: manifest.id, error: message });
        console.error(`[plugin-host] activation failed for ${manifest.id}:`, err);
      }
    },

    async unregister(pluginId) {
      const manifest = manifests.get(pluginId);
      if (!manifest) return;
      const ctx = contextFor(manifest);
      try {
        await manifest.deactivate?.(ctx);
      } catch (err) {
        console.error(`[plugin-host] deactivate failed for ${pluginId}:`, err);
      }
      deps.registry.removeByPlugin(pluginId);
      manifests.delete(pluginId);
      active.delete(pluginId);
    },

    list() {
      return Array.from(manifests.values());
    },
    isActive(pluginId) {
      return active.has(pluginId);
    },
    count() {
      return active.size;
    },
  };
}

export { KERNEL_VERSION };
