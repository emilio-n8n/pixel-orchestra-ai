import { addNodeExecutor, type PluginManifest, type NodeExecutor } from "@/kernel";

const assetExec: NodeExecutor = {
  id: "asset.reference",
  category: "asset",
  displayName: "Asset reference",
  defaultInputs: [],
  defaultOutputs: [
    { id: "asset", label: "asset", type: "asset" },
    { id: "blobHash", label: "blob hash", type: "string" },
  ],
  async execute(input) {
    return {
      asset: { id: input.assetId, name: input.name ?? "" },
      blobHash: input.blobHash ?? "",
    };
  },
};

export const nodeAssetPlugin: PluginManifest = {
  id: "com.lilium.builtin.node-asset",
  name: "Asset node",
  version: "0.1.0",
  engines: { lilium: "^0.1.0" },
  description: "References an existing asset in the project library.",
  contributes: {},
  activate: () => {
    addNodeExecutor({ ...assetExec, pluginId: "com.lilium.builtin.node-asset" });
  },
};
