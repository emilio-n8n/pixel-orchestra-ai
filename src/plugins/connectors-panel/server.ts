// Server functions for the connectors panel. Manages the lifecycle of
// connector instances: list / add / probe / list capabilities / invoke.
// Connector configs and runtime state are persisted in the `connectors`
// table (created by migration 003_skeletons).

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getDb } from "@/kernel/db";
import { getKernel } from "@/kernel";
import { GradioConnector } from "@/plugins/connector-gradio";
import type { ScopedHttp } from "@/kernel";

interface ConnectorRow {
  id: string;
  workspace_id: string | null;
  project_id: string | null;
  plugin_id: string;
  kind: string;
  name: string;
  config_json: string;
  status: string;
  created_at: number;
  updated_at: number;
}

export interface ConnectorView {
  id: string;
  workspaceId: string | null;
  projectId: string | null;
  pluginId: string;
  kind: string;
  name: string;
  config: { [k: string]: string | number | boolean | null };
  status: string;
  createdAt: number;
  updatedAt: number;
}

export interface CapabilityView {
  id: string;
  kind: "generate" | "transform" | "analyze" | "tool" | "stream";
  media: Array<"image" | "video" | "audio" | "text" | "3d" | "html" | "doc">;
  displayName: string;
  inputsSchema: Record<string, JsonValue>;
  outputsSchema: Record<string, JsonValue>;
  tags: string[];
}

/** JSON-safe primitive. We don't try to model full JSON Schema; the form
 *  only reads top-level `properties`, `required`, `type`, `enum`, `format`. */
export type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue };

function uid(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
}

function rowToView(r: ConnectorRow): ConnectorView {
  let cfg: Record<string, unknown> = {};
  try {
    cfg = JSON.parse(r.config_json) as Record<string, unknown>;
  } catch {
    /* empty */
  }
  // Coerce to a JSON-safe shape (everything must be string/number/boolean/null).
  const safe: { [k: string]: string | number | boolean | null } = {};
  for (const [k, v] of Object.entries(cfg)) {
    if (v == null) safe[k] = null;
    else if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") safe[k] = v;
    else safe[k] = JSON.stringify(v);
  }
  return {
    id: r.id,
    workspaceId: r.workspace_id,
    projectId: r.project_id,
    pluginId: r.plugin_id,
    kind: r.kind,
    name: r.name,
    config: safe,
    status: r.status,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function localHttp(): ScopedHttp {
  // Server-side fallback when the plugin context didn't provide an http client
  // (e.g. when we instantiate a connector directly from a server fn outside
  // the plugin activation path). Mirrors `net` permission (unrestricted for
  // the server) — the connector is operator-controlled, not user-controlled.
  return {
    permissions: () => ["net"],
    async fetch(req) {
      return globalThis.fetch(req.url, {
        method: req.method ?? "GET",
        headers: req.headers,
        body: req.body ?? undefined,
      });
    },
  };
}

function connectorFor(row: ConnectorRow): GradioConnector {
  const cfg = JSON.parse(row.config_json) as { baseUrl: string; authHeader?: string };
  const http = localHttp();
  return new GradioConnector(http, cfg);
}

export const listConnectors = createServerFn({ method: "GET" }).handler(async () => {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM connectors ORDER BY created_at DESC").all<ConnectorRow>();
  return { connectors: rows.map(rowToView) };
});

export const addConnector = createServerFn({ method: "POST" })
  .validator(
    z.object({
      kind: z.string().min(1),
      name: z.string().min(1),
      config: z.record(z.string()),
    }),
  )
  .handler(async ({ data }) => {
    const db = getDb();
    const id = uid("cn");
    const now = Date.now();
    const pluginId = data.kind === "gradio" ? "com.lilium.builtin.connector-gradio" : "unknown";
    db.prepare(
      `INSERT INTO connectors (id, workspace_id, project_id, plugin_id, kind, name, config_json, status, created_at, updated_at)
       VALUES (?, NULL, NULL, ?, ?, ?, ?, 'offline', ?, ?)`,
    ).run(id, pluginId, data.kind, data.name, JSON.stringify(data.config), now, now);
    try {
      getKernel().events.emit({
        type: "ConnectorRegistered",
        connectorId: id,
        kind: data.kind,
      });
    } catch {
      /* kernel not ready */
    }
    const row = db.prepare("SELECT * FROM connectors WHERE id = ?").get<ConnectorRow>(id);
    return { connector: row ? rowToView(row) : null };
  });

export const deleteConnector = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    const db = getDb();
    db.prepare("DELETE FROM connectors WHERE id = ?").run(data.id);
    db.prepare("DELETE FROM capabilities WHERE connector_id = ?").run(data.id);
    return { ok: true };
  });

export const probeConnector = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    const db = getDb();
    const row = db.prepare("SELECT * FROM connectors WHERE id = ?").get<ConnectorRow>(data.id);
    if (!row) throw new Error("connector not found");
    if (row.kind !== "gradio") {
      db.prepare("UPDATE connectors SET status = ?, updated_at = ? WHERE id = ?").run(
        "unsupported",
        Date.now(),
        data.id,
      );
      return { ok: false, latencyMs: 0, message: "kind not supported in phase 3" };
    }
    const connector = connectorFor(row);
    const health = await connector.probe();
    const newStatus = health.ok ? "online" : "offline";
    db.prepare("UPDATE connectors SET status = ?, updated_at = ? WHERE id = ?").run(
      newStatus,
      Date.now(),
      data.id,
    );
    try {
      getKernel().events.emit({
        type: health.ok ? "ConnectorOnline" : "ConnectorOffline",
        connectorId: data.id,
      });
    } catch {
      /* not ready */
    }
    return health;
  });

export const listCapabilities = createServerFn({ method: "GET" })
  .validator(z.object({ connectorId: z.string() }))
  .handler(async ({ data }) => {
    const db = getDb();
    const row = db
      .prepare("SELECT * FROM connectors WHERE id = ?")
      .get<ConnectorRow>(data.connectorId);
    if (!row || row.kind !== "gradio") return { capabilities: [] };
    const connector = connectorFor(row);
    const caps = await connector.listCapabilities();
    db.prepare("DELETE FROM capabilities WHERE connector_id = ?").run(data.connectorId);
    const ins = db.prepare(
      `INSERT INTO capabilities (id, connector_id, cap_ref, kind, media_json, schema_in, schema_out, tags_json, detected_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const now = Date.now();
    for (const c of caps) {
      ins.run(
        `${data.connectorId}::${c.id}`,
        data.connectorId,
        c.id,
        c.kind,
        JSON.stringify(c.media),
        JSON.stringify(c.inputs),
        JSON.stringify(c.outputs),
        JSON.stringify(c.tags ?? []),
        now,
      );
    }
    try {
      getKernel().events.emit({ type: "CapabilityAdded", connectorId: data.connectorId });
    } catch {
      /* not ready */
    }
    const views: CapabilityView[] = caps.map((c) => ({
      id: c.id,
      kind: c.kind,
      media: c.media,
      displayName: c.displayName,
      inputsSchema: (c.inputs ?? {}) as Record<string, JsonValue>,
      outputsSchema: (c.outputs ?? {}) as Record<string, JsonValue>,
      tags: c.tags ?? [],
    }));
    return { capabilities: views };
  });

export const invokeCapability = createServerFn({ method: "POST" })
  .validator(
    z.object({
      connectorId: z.string(),
      capId: z.string(),
      input: z.record(z.string()),
    }),
  )
  .handler(async ({ data }) => {
    const db = getDb();
    const row = db
      .prepare("SELECT * FROM connectors WHERE id = ?")
      .get<ConnectorRow>(data.connectorId);
    if (!row) return { ok: false, error: "connector not found", outputs: [] as string[] };
    if (row.kind !== "gradio") {
      return { ok: false, error: "kind not supported", outputs: [] as string[] };
    }
    const connector = connectorFor(row);
    const ac = new AbortController();
    const outputs: string[] = [];
    let lastError: string | null = null;
    let lastNote: string | null = null;
    try {
      for await (const ev of connector.invoke(data.capId, data.input, { signal: ac.signal })) {
        if (ev.type === "done") {
          for (const o of ev.outputs) outputs.push(typeof o === "string" ? o : JSON.stringify(o));
        } else if (ev.type === "error") {
          lastError = ev.error;
          break;
        } else if (ev.type === "progress") {
          lastNote = ev.note ?? null;
        } else if (ev.type === "output") {
          const d = ev.data;
          if (Array.isArray(d)) {
            for (const o of d) outputs.push(typeof o === "string" ? o : JSON.stringify(o));
          }
        }
      }
    } catch (err) {
      lastError = (err as Error).message;
    }
    return {
      ok: lastError === null,
      error: lastError,
      note: lastNote,
      outputs,
    };
  });
