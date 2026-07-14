import { addNodeExecutor, type PluginManifest, type NodeExecutor } from "@/kernel";

interface AssetRowForExport {
  id: string;
  project_id: string;
  name: string;
  kind: string;
  mime: string | null;
  size_bytes: number;
  blob_hash: string | null;
  meta_json: string;
  created_at: number;
  updated_at: number;
}

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
    if (!projectId) throw new Error("exporter.library: missing projectId (connect a string node)");
    const blobHash = String(input.blobHash ?? "");
    if (!blobHash)
      throw new Error("exporter.library: missing blobHash (connect a node that produces it)");
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

// Type-only re-export to silence the "unused" lint on AssetRowForExport.
export type { AssetRowForExport };

export const nodeExporterPlugin: PluginManifest = {
  id: "com.lilium.builtin.node-exporter",
  name: "Exporter node",
  version: "0.1.0",
  engines: { lilium: "^0.1.0" },
  description: "Saves the upstream value as an asset row in the project library.",
  contributes: {},
  activate: () => {
    addNodeExecutor({ ...exporterExec, pluginId: "com.lilium.builtin.node-exporter" });
  },
};
