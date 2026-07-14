import { createEventBus, type EventBus } from "./event-bus";
import { createRegistry, type Registry } from "./registry";
import { createPluginHost, type PluginHost } from "./plugin-host";
import type { BlobStore } from "./storage/types";

export interface Kernel {
  events: EventBus;
  registry: Registry;
  host: PluginHost;
  /** Server-only — undefined on the client. */
  db?: import("./db/types").DBAdapter;
  /** Server-only — undefined on the client. */
  storage?: BlobStore;
  /** Optional notify sink injected by the host shell (Toaster, console, ...). */
  notify?: (message: string, kind?: "info" | "success" | "warn" | "error") => void;
}

export interface KernelOptions {
  db?: import("./db/types").DBAdapter;
  storage?: BlobStore;
  notify?: (message: string, kind?: "info" | "success" | "warn" | "error") => void;
}

let singleton: Kernel | null = null;
let pending: Promise<Kernel> | null = null;

async function build(options: KernelOptions = {}): Promise<Kernel> {
  const { createEventLogPersister } = await import("./db/event-log");
  const persister = options.db ? createEventLogPersister(options.db) : undefined;
  const events = createEventBus({ persister });
  const registry = createRegistry();
  const host = createPluginHost({
    events,
    registry,
    notify: options.notify,
    storage: options.storage,
  });
  const kernel: Kernel = { events, registry, host };
  if (options.db) kernel.db = options.db;
  if (options.storage) kernel.storage = options.storage;
  if (options.notify) kernel.notify = options.notify;
  return kernel;
}

export async function getKernelAsync(options: KernelOptions = {}): Promise<Kernel> {
  if (singleton) return singleton;
  if (!pending) {
    pending = build(options).then((k) => {
      singleton = k;
      return k;
    });
  }
  return pending;
}

export function getKernel(): Kernel {
  if (singleton) return singleton;
  throw new Error(
    "Kernel not initialized. Call await getKernelAsync() first (typically in the server bootstrap).",
  );
}

export type { EventBus, Registry, PluginHost };
export * from "./contracts/plugin";
export * from "./contracts/events";
