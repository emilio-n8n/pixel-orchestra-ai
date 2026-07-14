import type { PluginManifest } from "@/kernel";
import { LineagePanel } from "./LineagePanel";

export const uiLineagePlugin: PluginManifest = {
  id: "com.lilium.builtin.ui-lineage",
  name: "Lineage",
  version: "0.1.0",
  engines: { lilium: "^0.1.0" },
  description:
    "Inspector panel for asset lineage. Shows the producer node, capability, direct sources, and ancestors/descendants in the asset graph.",
  contributes: {
    panels: [
      {
        id: "lineage.inspector",
        title: "Lineage",
        slot: "inspector",
        component: LineagePanel,
        order: 10,
      },
    ],
  },
};
