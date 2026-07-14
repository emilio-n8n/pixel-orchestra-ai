// Server functions for the lineage UI. Given an asset id, walks the
// asset_provenance table to find ancestors (assets this one was
// derived from) and descendants (assets derived from this one). Bounded
// recursion to avoid pathological graphs.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getDb } from "@/kernel/db";
import { JsonValue } from "@/plugins/connectors-panel/server";

interface AssetRowLite {
  id: string;
  name: string;
  kind: string;
  created_at: number;
}

interface ProvenanceRow {
  asset_id: string;
  graph_run_id: string | null;
  node_run_id: string | null;
  source_asset_ids_json: string;
  params_json: string;
  capability_id: string | null;
  seed: string | null;
}

interface NodeRunRow {
  id: string;
  graph_run_id: string;
  node_id: string;
  status: string;
  input_json: string | null;
  output_json: string | null;
  started_at: number;
  finished_at: number | null;
}

export interface LineageAsset {
  id: string;
  name: string;
  kind: string;
  createdAt: number;
  /** Edge type from this asset to the next in the chain. */
  relation: "self" | "ancestor" | "descendant";
  /** Hop distance from the seed asset. 0 = self. */
  depth: number;
  /** Path of node_ids that produced this asset (from seed outward). */
  path: string[];
}

export interface LineageView {
  seed: { id: string; name: string; kind: string; createdAt: number };
  ancestors: LineageAsset[];
  descendants: LineageAsset[];
  /** Source asset ids used to produce this asset (direct, no recursion). */
  directSources: { id: string; name: string }[];
  /** Capabilities that produced this asset (direct, no recursion). */
  capabilities: { id: string; params: Record<string, JsonValue> }[];
  /** Node run that created this asset (direct). */
  nodeRun: { id: string; graphRunId: string; nodeId: string; status: string } | null;
}

function readAsset(id: string): AssetRowLite | null {
  const db = getDb();
  return (
    (db.prepare("SELECT id, name, kind, created_at FROM assets WHERE id = ?").get<AssetRowLite>(id) ??
      null)
  );
}

function listProvenanceForAsset(id: string): ProvenanceRow | null {
  const db = getDb();
  return (
    db.prepare("SELECT * FROM asset_provenance WHERE asset_id = ?").get<ProvenanceRow>(id) ?? null
  );
}

function listAssetsBySourceIds(ids: string[]): AssetRowLite[] {
  if (ids.length === 0) return [];
  const db = getDb();
  const placeholders = ids.map(() => "?").join(",");
  return db
    .prepare(`SELECT id, name, kind, created_at FROM assets WHERE id IN (${placeholders})`)
    .all<AssetRowLite>(...ids);
}

function listAssetsByProvenanceSource(id: string, maxDepth: number): LineageAsset[] {
  // Walk upward: assets whose source_asset_ids include `id` (transitively).
  const seen = new Set<string>([id]);
  const out: LineageAsset[] = [];
  type QueueItem = { id: string; depth: number; path: string[] };
  const queue: QueueItem[] = [{ id, depth: 0, path: [] }];
  while (queue.length > 0 && out.length < 64) {
    const { id: cur, depth, path } = queue.shift()!;
    if (depth > maxDepth) continue;
    const db = getDb();
    // Find all provenance rows whose source_asset_ids_json contains cur.
    // (Cheap because the table is small in phase 5. For a real prod
    // scale, add a real join table or a JSON1 index.)
    const candidates = db
      .prepare("SELECT * FROM asset_provenance")
      .all<ProvenanceRow>();
    for (const p of candidates) {
      let sourceIds: string[] = [];
      try {
        sourceIds = JSON.parse(p.source_asset_ids_json) as string[];
      } catch {
        /* empty */
      }
      if (!sourceIds.includes(cur)) continue;
      if (seen.has(p.asset_id)) continue;
      const asset = readAsset(p.asset_id);
      if (!asset) continue;
      seen.add(p.asset_id);
      out.push({
        id: asset.id,
        name: asset.name,
        kind: asset.kind,
        createdAt: asset.created_at,
        relation: "ancestor",
        depth: depth + 1,
        path: [...path, p.node_run_id ?? p.asset_id],
      });
      queue.push({ id: p.asset_id, depth: depth + 1, path: [...path, p.node_run_id ?? p.asset_id] });
    }
  }
  return out;
}

function listAssetsByProvenanceDescendant(id: string, maxDepth: number): LineageAsset[] {
  // Walk downward: assets for which `id` is in their source_asset_ids.
  const seen = new Set<string>([id]);
  const out: LineageAsset[] = [];
  type QueueItem = { id: string; depth: number; path: string[] };
  const queue: QueueItem[] = [{ id, depth: 0, path: [] }];
  while (queue.length > 0 && out.length < 64) {
    const { id: cur, depth, path } = queue.shift()!;
    if (depth > maxDepth) continue;
    const prov = listProvenanceForAsset(cur);
    if (!prov) continue;
    let sourceIds: string[] = [];
    try {
      sourceIds = JSON.parse(prov.source_asset_ids_json) as string[];
    } catch {
      /* empty */
    }
    for (const sourceId of sourceIds) {
      if (seen.has(sourceId)) continue;
      const asset = readAsset(sourceId);
      if (!asset) continue;
      seen.add(sourceId);
      out.push({
        id: asset.id,
        name: asset.name,
        kind: asset.kind,
        createdAt: asset.created_at,
        relation: "descendant",
        depth: depth + 1,
        path: [...path, prov.node_run_id ?? cur],
      });
      queue.push({ id: sourceId, depth: depth + 1, path: [...path, prov.node_run_id ?? cur] });
    }
  }
  return out;
}

export const getLineage = createServerFn({ method: "GET" })
  .validator(z.object({ assetId: z.string(), maxDepth: z.number().optional() }))
  .handler(async ({ data }) => {
    const maxDepth = data.maxDepth ?? 5;
    const seed = readAsset(data.assetId);
    if (!seed) {
      return {
        seed: null,
        ancestors: [],
        descendants: [],
        directSources: [],
        capabilities: [],
        nodeRun: null,
      };
    }
    const prov = listProvenanceForAsset(data.assetId);
    let directSources: { id: string; name: string }[] = [];
    let capabilities: { id: string; params: Record<string, JsonValue> }[] = [];
    let nodeRun: LineageView["nodeRun"] = null;
    if (prov) {
      let sourceIds: string[] = [];
      try {
        sourceIds = JSON.parse(prov.source_asset_ids_json) as string[];
      } catch {
        /* empty */
      }
      directSources = listAssetsBySourceIds(sourceIds).map((a) => ({ id: a.id, name: a.name }));
      try {
        const params = JSON.parse(prov.params_json) as Record<string, JsonValue>;
        capabilities = prov.capability_id
          ? [{ id: prov.capability_id, params }]
          : [];
      } catch {
        /* empty */
      }
      if (prov.node_run_id) {
        const db = getDb();
        const nr = db
          .prepare("SELECT * FROM node_runs WHERE id = ?")
          .get<NodeRunRow>(prov.node_run_id);
        if (nr) {
          nodeRun = {
            id: nr.id,
            graphRunId: nr.graph_run_id,
            nodeId: nr.node_id,
            status: nr.status,
          };
        }
      }
    }
    const ancestors = listAssetsByProvenanceDescendant(data.assetId, maxDepth);
    const descendants = listAssetsByProvenanceSource(data.assetId, maxDepth);
    return {
      seed: { id: seed.id, name: seed.name, kind: seed.kind, createdAt: seed.created_at },
      ancestors,
      descendants,
      directSources,
      capabilities,
      nodeRun,
    };
  });
