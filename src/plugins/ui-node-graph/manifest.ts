import type { PluginManifest } from "@/kernel";
import { NodeGraphPanel } from "./NodeGraphPanel";

export const uiNodeGraphPlugin: PluginManifest = {
  id: "com.lilium.builtin.ui-node-graph",
  name: "Node graph",
  version: "0.1.0",
  engines: { lilium: "^0.1.0" },
  description:
    "Build, run and inspect node graphs. Each node type comes from a plugin; capabilities become invokable nodes automatically.",
  contributes: {
    panels: [
      {
        id: "graph.center",
        title: "Node Graph",
        slot: "center",
        component: NodeGraphPanel,
        order: 40,
      },
    ],
  },
};
