import type { EventBus } from "../event-bus";
import type { Registry } from "../registry";
import type { ComponentType, ReactNode } from "react";
import type { DBAdapter } from "../db/types";
import type { BlobStore } from "../storage/types";
import type { ScopedHttp } from "../http/scoped";

/**
 * What viewers receive as their `asset` prop. The library plugin owns the
 * canonical row shape; viewers only need the minimum to fetch and render.
 * Declared in contracts/ so the kernel has zero coupling to the library
 * plugin's exact row type.
 */
export interface ViewerAsset {
  id: string;
  kind: string;
  name: string;
  mime: string | null;
  sizeBytes: number;
  blobHash: string | null;
  meta?: Record<string, unknown>;
}

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
  component: ComponentType<{ asset: ViewerAsset }>;
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

export interface HttpRequest {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: BodyInit | null;
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
   * Blob storage. Server-only. Content-addressed, dedup by hash. Wired
   * in phase 2; plugins should check `ctx.storage` before using.
   */
  storage?: BlobStore;
  /**
   * HTTP client with allowlist enforcement. Wired in phase 3 alongside
   * the Gradio connector.
   */
  http?: ScopedHttp;
  /**
   * Secrets store. Phase 3+.
   */
  secrets?: SecretsStore;
}
