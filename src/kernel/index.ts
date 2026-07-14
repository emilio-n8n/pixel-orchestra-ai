import { createEventBus, type EventBus } from "./event-bus";
import { createRegistry, type Registry } from "./registry";
import { createPluginHost, type PluginHost } from "./plugin-host";

export interface Kernel {
  events: EventBus;
  registry: Registry;
  host: PluginHost;
}

let singleton: Kernel | null = null;

export function getKernel(): Kernel {
  if (singleton) return singleton;
  const events = createEventBus();
  const registry = createRegistry();
  const host = createPluginHost({ events, registry });
  singleton = { events, registry, host };
  return singleton;
}

export type { EventBus, Registry, PluginHost };
export * from "./contracts/plugin";
export * from "./contracts/events";