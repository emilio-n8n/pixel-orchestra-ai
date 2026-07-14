import type { PluginContext, PluginManifest } from "./contracts/plugin";
import type { EventBus } from "./event-bus";
import type { Registry } from "./registry";

export interface PluginHost {
  register(manifest: PluginManifest): Promise<void>;
  unregister(pluginId: string): Promise<void>;
  list(): PluginManifest[];
  isActive(pluginId: string): boolean;
}

export function createPluginHost(deps: {
  events: EventBus;
  registry: Registry;
  notify?: (message: string, kind?: "info" | "success" | "warn" | "error") => void;
}): PluginHost {
  const manifests = new Map<string, PluginManifest>();
  const active = new Set<string>();

  function contextFor(manifest: PluginManifest): PluginContext {
    return {
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
  }

  return {
    async register(manifest) {
      if (manifests.has(manifest.id)) {
        console.warn(`[plugin-host] ${manifest.id} already registered — skipping`);
        return;
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

    list() { return Array.from(manifests.values()); },
    isActive(pluginId) { return active.has(pluginId); },
  };
}