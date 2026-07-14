// Server functions for the node-graph UI: persist a graph document, list
// saved graphs, run a graph (delegates to kernel.scheduler), list
// graph runs.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getDb } from "@/kernel/db";
import { getKernel, type GraphDocument, listNodeExecutors } from "@/kernel";
import { JsonValue } from "@/plugins/connectors-panel/server";

interface GraphRow {
  id: string;
  project_id: string | null;
  name: string;
  doc_json: string;
  is_template: number;
  created_at: number;
  updated_at: number;
}

interface GraphRunRow {
  id: string;
  graph_id: string;
  status: string;
  started_at: number;
  finished_at: number | null;
  stats_json: string;
}

export type { GraphRunRow };

function uid(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
}

export const saveGraph = createServerFn({ method: "POST" })
  .validator(
    z.object({
      id: z.string().optional(),
      projectId: z.string().nullable().optional(),
      name: z.string().min(1),
      doc: z.record(z.unknown()),
    }),
  )
  .handler(async ({ data }) => {
    const db = getDb();
    const id = data.id ?? uid("gph");
    const now = Date.now();
    if (data.id) {
      db.prepare("UPDATE graphs SET name = ?, doc_json = ?, updated_at = ? WHERE id = ?").run(
        data.name,
        JSON.stringify(data.doc),
        now,
        id,
      );
    } else {
      db.prepare(
        `INSERT INTO graphs (id, project_id, name, doc_json, is_template, created_at, updated_at)
         VALUES (?, ?, ?, ?, 0, ?, ?)`,
      ).run(id, data.projectId ?? null, data.name, JSON.stringify(data.doc), now, now);
    }
    return { id };
  });

export const listGraphs = createServerFn({ method: "GET" })
  .validator(z.object({ projectId: z.string().optional() }))
  .handler(async ({ data }) => {
    const db = getDb();
    const rows = data.projectId
      ? db
          .prepare(
            "SELECT * FROM graphs WHERE project_id = ? OR project_id IS NULL ORDER BY updated_at DESC",
          )
          .all<GraphRow>(data.projectId)
      : db.prepare("SELECT * FROM graphs ORDER BY updated_at DESC").all<GraphRow>();
    return {
      graphs: rows.map((r) => ({
        id: r.id,
        projectId: r.project_id,
        name: r.name,
        isTemplate: Boolean(r.is_template),
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      })),
    };
  });

export const loadGraph = createServerFn({ method: "GET" })
  .validator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    const db = getDb();
    const row = db.prepare("SELECT * FROM graphs WHERE id = ?").get<GraphRow>(data.id);
    if (!row) return { graph: null };
    let doc: Record<string, JsonValue> = {};
    try {
      doc = JSON.parse(row.doc_json) as Record<string, JsonValue>;
    } catch {
      /* empty */
    }
    return {
      graph: {
        id: row.id,
        projectId: row.project_id,
        name: row.name,
        doc,
        isTemplate: Boolean(row.is_template),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      },
    };
  });

export const listNodeTypes = createServerFn({ method: "GET" }).handler(async () => {
  const types: { id: string; category: string; displayName: string }[] = [];
  for (const [id, exec] of listNodeExecutors()) {
    types.push({ id, category: exec.category, displayName: exec.displayName });
  }
  return { types };
});

export const runGraphFn = createServerFn({ method: "POST" })
  .validator(
    z.object({
      doc: z.record(z.unknown()),
      projectId: z.string().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const kernel = getKernel();
    const doc = data.doc as unknown as GraphDocument;
    if (!doc.id) doc.id = uid("gph");
    if (!doc.projectId && data.projectId) doc.projectId = data.projectId;
    if (!doc.name) doc.name = "Ad-hoc graph";
    if (!doc.inputs) doc.inputs = [];
    if (!doc.outputs) doc.outputs = [];

    // Persist a graph_run row up front for the Jobs panel to show.
    const db = getDb();
    const graphId = doc.id;
    // Ensure the graph row exists (upsert minimal).
    const existing = db.prepare("SELECT id FROM graphs WHERE id = ?").get<{ id: string }>(graphId);
    if (!existing) {
      db.prepare(
        `INSERT INTO graphs (id, project_id, name, doc_json, is_template, created_at, updated_at)
         VALUES (?, ?, ?, ?, 0, ?, ?)`,
      ).run(graphId, doc.projectId ?? null, doc.name, JSON.stringify(doc), Date.now(), Date.now());
    }
    const runId = uid("gr");
    db.prepare(
      `INSERT INTO graph_runs (id, graph_id, status, started_at, finished_at, stats_json)
       VALUES (?, ?, 'running', ?, NULL, '{}')`,
    ).run(runId, graphId, Date.now());

    kernel.events.emit({ type: "JobQueued", jobId: runId });
    kernel.events.emit({ type: "JobStarted", jobId: runId });

    try {
      const result = await kernel.scheduler.runGraph(doc, {
        env: { db, storage: kernel.storage, http: kernel.host["http" as never] as never },
        events: kernel.events,
      });
      db.prepare(
        "UPDATE graph_runs SET status = ?, finished_at = ?, stats_json = ? WHERE id = ?",
      ).run(result.status, Date.now(), JSON.stringify(result), runId);
      kernel.events.emit({
        type: "JobFinished",
        jobId: runId,
        resultAssetIds: [],
      });
      return {
        graphRunId: result.graphRunId,
        status: result.status,
        okCount: result.okCount,
        errorCount: result.errorCount,
        totalMs: result.totalMs,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      db.prepare(
        "UPDATE graph_runs SET status = ?, finished_at = ?, stats_json = ? WHERE id = ?",
      ).run("error", Date.now(), JSON.stringify({ error: msg }), runId);
      kernel.events.emit({ type: "JobFailed", jobId: runId, error: msg });
      return { graphRunId: runId, status: "error" as const, error: msg };
    }
  });

export const listGraphRuns = createServerFn({ method: "GET" })
  .validator(z.object({ limit: z.number().optional() }))
  .handler(async ({ data }) => {
    const db = getDb();
    const limit = data.limit ?? 50;
    const rows = db
      .prepare("SELECT * FROM graph_runs ORDER BY started_at DESC LIMIT ?")
      .all<GraphRunRow>(limit);
    return {
      runs: rows.map((r) => {
        let stats: Record<string, JsonValue> = {};
        try {
          stats = JSON.parse(r.stats_json) as Record<string, JsonValue>;
        } catch {
          /* empty */
        }
        return {
          id: r.id,
          graphId: r.graph_id,
          status: r.status,
          startedAt: r.started_at,
          finishedAt: r.finished_at,
          stats,
        };
      }),
    };
  });
