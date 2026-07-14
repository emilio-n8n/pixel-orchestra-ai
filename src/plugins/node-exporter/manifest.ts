import { addNodeExecutor, type PluginManifest, type NodeExecutor } from "@/kernel";

function uid(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
}

const exporterExec: NodeExecutor = {
  id: "exporter.library",
  category: "exporter",
  displayName: "Export to library",
  defaultInputs: [],
  defaultOutputs: [{ id: "assetId", label: "asset id", type: "string" }],
  async execute(input, ctx) {
    if (!ctx.env.db) throw new Error("exporter.library: db is not available");
    const projectId = String(input.projectId ?? "");
    if (!projectId) {
      throw new Error("exporter.library: missing projectId (connect a string node)");
    }
    const blobHash = String(input.blobHash ?? "");
    if (!blobHash) {
      throw new Error("exporter.library: missing blobHash (connect a node that produces it)");
    }
    const name = String(input.name ?? "untitled");
    const mime = input.mime ? String(input.mime) : null;
    const kind = String(input.kind ?? "other");
    const size = Number(input.size ?? 0);
    const id = uid("ast");
    const now = Date.now();
    ctx.env.db
      .prepare(
        `INSERT INTO assets (id, project_id, kind, name, mime, size_bytes, blob_hash, thumbnail_hash, meta_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NULL, '{}', ?, ?)`,
      )
      .run(id, projectId, kind, name, mime, size, blobHash, now, now);

    // Capture source assets (any input that looks like an asset reference)
    // for the lineage view. We look at every input value whose key ends
    // with `assetId` or starts with `asset` and is a string that exists
    // in the assets table.
    const sourceAssetIds: string[] = [];
    for (const [key, value] of Object.entries(input)) {
      if (typeof value !== "string") continue;
      if (!/asset|input/i.test(key)) continue;
      const row = ctx.env.db
        .prepare("SELECT id FROM assets WHERE id = ?")
        .get<{ id: string }>(value);
      if (row) sourceAssetIds.push(value);
    }
    // Also accept an explicit `sources` array (string[]) — convenient
    // for graphs that pipe a list of asset references.
    if (Array.isArray(input.sources)) {
      for (const s of input.sources) {
        if (typeof s !== "string") continue;
        const row = ctx.env.db.prepare("SELECT id FROM assets WHERE id = ?").get<{ id: string }>(s);
        if (row && !sourceAssetIds.includes(s)) sourceAssetIds.push(s);
      }
    }

    // Try to find the current graph_run + node_run ids via a side-channel
    // we attach to ctx.env when invoked from runGraphFn. We also accept
    // an explicit `graphRunId` / `nodeRunId` in the input for tests.
    const graphRunId = (ctx.env as { graphRunId?: string }).graphRunId ?? null;
    const nodeRunId = (ctx.env as { nodeRunId?: string }).nodeRunId ?? null;
    if (graphRunId || nodeRunId || sourceAssetIds.length > 0) {
      ctx.env.db
        .prepare(
          `INSERT OR REPLACE INTO asset_provenance (asset_id, graph_run_id, node_run_id, source_asset_ids_json, params_json, capability_id, seed)
           VALUES (?, ?, ?, ?, ?, NULL, NULL)`,
        )
        .run(
          id,
          graphRunId,
          nodeRunId,
          JSON.stringify(sourceAssetIds),
          JSON.stringify({
            name,
            kind,
            mime,
            size,
            graphRunId,
            nodeRunId,
          }),
        );
    }

    try {
      const kernel = await import("@/kernel");
      kernel.getKernel().events.emit({
        type: "AssetImported",
        assetId: id,
        projectId,
        kind,
        name,
        sizeBytes: size,
        blobHash,
      });
    } catch {
      /* kernel not ready */
    }
    return { assetId: id };
  },
};

export const nodeExporterPlugin: PluginManifest = {
  id: "com.lilium.builtin.node-exporter",
  name: "Exporter node",
  version: "0.1.0",
  engines: { lilium: "^0.1.0" },
  description: "Saves the upstream value as an asset row + asset_provenance (for lineage).",
  contributes: {},
  activate: () => {
    addNodeExecutor({ ...exporterExec, pluginId: "com.lilium.builtin.node-exporter" });
  },
};
