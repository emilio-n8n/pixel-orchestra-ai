import type { EventBus } from "../event-bus";
import type { Registry } from "../registry";
import type { ComponentType, ReactNode } from "react";
import type { DBAdapter } from "../db/types";

export type Permission =
  | "net"
  | `net:${string}`
  | "fs:read"
  | "fs:write"
  | "events:emit"
  | `events:emit:${string}`
  | "secrets:read"
  | "context:read"
  | "context:write";

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  engines: { lilium: string };
  description?: string;
  author?: string;
  permissions?: Permission[];
  contributes: PluginContributions;
  activate?: (ctx: PluginContext) => void | Promise<void>;
  deactivate?: (ctx: PluginContext) => void | Promise<void>;
}

export type PanelSlot = "sidebar" | "inspector" | "bottom" | "center";

export interface PluginContributions {
  panels?: PanelContribution[];
  commands?: CommandContribution[];
  connectors?: ConnectorContribution[];
  viewers?: ViewerContribution[];
  nodes?: NodeContribution[];
  // (further extension points are added as phases land)
}

export interface PanelContribution {
  id: string;
  title: string;
  icon?: string;
  slot: PanelSlot;
  component: ComponentType;
  order?: number;
}

export interface CommandContribution {
  id: string;
  title: string;
  category?: string;
  shortcut?: string;
  run: (ctx: PluginContext) => void | Promise<void>;
}

export interface ConnectorContribution {
  kind: string;
  displayName: string;
  configSchema: unknown; // JSON schema — Zod later
  factory: (config: unknown, ctx: PluginContext) => Connector;
}

export interface ViewerContribution {
  id: string;
  accepts: string[]; // asset kinds: "image" | "video" | ...
  component: ComponentType<{ assetId: string }>;
  priority?: number;
}

export interface NodeContribution {
  id: string;
  category: string;
  displayName: string;
  // schema + implementation land in phase 4
}

// --- Connector runtime (used by connector contributions) ---

export interface ConnectorHealth {
  ok: boolean;
  latencyMs?: number;
  message?: string;
}

export interface Capability {
  id: string;
  kind: "generate" | "transform" | "analyze" | "tool" | "stream";
  media: Array<"image" | "video" | "audio" | "text" | "3d" | "html" | "doc">;
  displayName: string;
  inputs: unknown; // JSON schema
  outputs: unknown;
  tags?: string[];
}

export interface InvocationController {
  signal: AbortSignal;
}

export type InvocationEvent =
  | { type: "progress"; value: number; note?: string }
  | { type: "log"; message: string }
  | { type: "output"; data: unknown }
  | { type: "done"; outputs: unknown[] }
  | { type: "error"; error: string };

export interface Connector {
  probe(): Promise<ConnectorHealth>;
  listCapabilities(): Promise<Capability[]>;
  invoke(capId: string, input: unknown, ctrl: InvocationController): AsyncIterable<InvocationEvent>;
  dispose?(): Promise<void>;
}

// --- Plugin context passed at activate() ---

export interface Logger {
  info: (msg: string, meta?: unknown) => void;
  warn: (msg: string, meta?: unknown) => void;
  error: (msg: string, meta?: unknown) => void;
}

export interface SecretsStore {
  get(name: string): string | undefined;
  set(name: string, value: string): void;
  delete(name: string): void;
  list(): string[];
}

export interface HttpClient {
  fetch(input: string | URL, init?: RequestInit): Promise<Response>;
}

export interface PluginContext {
  pluginId: string;
  events: EventBus;
  registry: Registry;
  logger: Logger;
  ui: {
    notify: (message: string, kind?: "info" | "success" | "warn" | "error") => void;
    render?: (node: ReactNode) => void;
  };
  /**
   * Database adapter. Server-only — the browser kernel exposes an
   * in-memory event bus and no DB. Plugins that need persistence should
   * detect this and degrade gracefully.
   */
  db?: DBAdapter;
  /**
   * Blob storage. Wired in phase 2 (Storage + DB + Asset model). For now
   * it is undefined; plugins must not call it before then.
   */
  storage?: never;
  /**
   * HTTP client with allowlist enforcement. Wired in phase 3 alongside
   * the Gradio connector.
   */
  http?: HttpClient;
  /**
   * Secrets store. Phase 3+.
   */
  secrets?: SecretsStore;
}
