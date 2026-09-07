import type { PluginManifest } from "@/kernel";
import { NodeGraphPanel } from "./NodeGraphPanel";

export const uiNodeGraphPlugin: PluginManifest = {
  id: "com.lilium.builtin.ui-node-graph",
  name: "Flux créatif",
  version: "0.1.0",
  engines: { lilium: "^0.1.0" },
  description:
    "Construit, exécute et inspecte les flux créatifs. Chaque type de nœud vient d’un plugin ; les capacités deviennent des nœuds.",
  contributes: {
    panels: [
      {
        id: "graph.center",
        title: "Flux créatif",
        slot: "center",
        component: NodeGraphPanel,
        order: 40,
      },
    ],
  },
};
