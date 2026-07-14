import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getDb } from "@/kernel/db";

function uid(p: string) {
  return `${p}_${Math.random().toString(36).slice(2, 10)}`;
}

export interface SceneView {
  id: string;
  projectId: string;
  name: string;
  order: number;
  description: string;
  createdAt: number;
}

export interface ShotView {
  id: string;
  sceneId: string;
  name: string;
  order: number;
  durationMs: number;
  assetId: string | null;
  createdAt: number;
}

export const listScenes = createServerFn({ method: "GET" })
  .validator(z.object({ projectId: z.string() }))
  .handler(async ({ data }) => {
    const db = getDb();
    const rows = db.prepare("SELECT * FROM scenes WHERE project_id = ? ORDER BY `order` ASC").all<{
      id: string;
      project_id: string;
      name: string;
      order: number;
      description: string;
      created_at: number;
    }>(data.projectId);
    return {
      scenes: rows.map((r) => ({
        id: r.id,
        projectId: r.project_id,
        name: r.name,
        order: r.order,
        description: r.description,
        createdAt: r.created_at,
      })),
    };
  });

export const createScene = createServerFn({ method: "POST" })
  .validator(
    z.object({
      projectId: z.string(),
      name: z.string().min(1),
      description: z.string().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const db = getDb();
    const id = uid("scn");
    db.prepare(
      "INSERT INTO scenes (id, project_id, name, `order`, description, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    ).run(id, data.projectId, data.name, 0, data.description ?? "", Date.now());
    return { id };
  });

export const listShots = createServerFn({ method: "GET" })
  .validator(z.object({ sceneId: z.string() }))
  .handler(async ({ data }) => {
    const db = getDb();
    const rows = db.prepare("SELECT * FROM shots WHERE scene_id = ? ORDER BY `order` ASC").all<{
      id: string;
      scene_id: string;
      name: string;
      order: number;
      duration_ms: number;
      asset_id: string | null;
      created_at: number;
    }>(data.sceneId);
    return {
      shots: rows.map((r) => ({
        id: r.id,
        sceneId: r.scene_id,
        name: r.name,
        order: r.order,
        durationMs: r.duration_ms,
        assetId: r.asset_id,
        createdAt: r.created_at,
      })),
    };
  });
