// Server functions for the versioning UI.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getDb } from "@/kernel/db";
import { JsonValue } from "@/plugins/connectors-panel/server";

function uid(p: string) {
  return `${p}_${Math.random().toString(36).slice(2, 10)}`;
}

interface SnapshotRow {
  id: string;
  project_id: string;
  entity_type: string;
  entity_id: string;
  version: number;
  blob_json: string;
  reason: string | null;
  created_at: number;
}

export interface SnapshotView {
  id: string;
  projectId: string;
  entityType: string;
  entityId: string;
  version: number;
  blob: string;
  reason: string | null;
  createdAt: number;
}

export const listSnapshots = createServerFn({ method: "GET" })
  .validator(z.object({ projectId: z.string(), entityType: z.string(), entityId: z.string() }))
  .handler(async ({ data }) => {
    const db = getDb();
    const rows = db
      .prepare(
        "SELECT * FROM snapshots WHERE project_id = ? AND entity_type = ? AND entity_id = ? ORDER BY version DESC",
      )
      .all<SnapshotRow>(data.projectId, data.entityType, data.entityId);
    return {
      snapshots: rows.map((r) => ({
        id: r.id,
        projectId: r.project_id,
        entityType: r.entity_type,
        entityId: r.entity_id,
        version: r.version,
        blob: r.blob_json,
        reason: r.reason,
        createdAt: r.created_at,
      })),
    };
  });

export const createSnapshot = createServerFn({ method: "POST" })
  .validator(
    z.object({
      projectId: z.string(),
      entityType: z.string(),
      entityId: z.string(),
      blob: z.string(),
      reason: z.string().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const db = getDb();
    const id = uid("snap");
    const maxV = db
      .prepare(
        "SELECT COALESCE(MAX(version), 0) as v FROM snapshots WHERE project_id = ? AND entity_type = ? AND entity_id = ?",
      )
      .get<{ v: number }>(data.projectId, data.entityType, data.entityId);
    const v = (maxV?.v ?? 0) + 1;
    db.prepare(
      "INSERT INTO snapshots (id, project_id, entity_type, entity_id, version, blob_json, reason, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(
      id,
      data.projectId,
      data.entityType,
      data.entityId,
      v,
      data.blob,
      data.reason ?? null,
      Date.now(),
    );
    return { id, version: v };
  });

export const restoreSnapshot = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    const db = getDb();
    const row = db.prepare("SELECT * FROM snapshots WHERE id = ?").get<SnapshotRow>(data.id);
    if (!row) throw new Error("snapshot not found");
    return {
      blob: row.blob_json,
      entityType: row.entity_type,
      entityId: row.entity_id,
      version: row.version,
    };
  });
