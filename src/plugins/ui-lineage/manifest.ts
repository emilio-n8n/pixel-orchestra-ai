import type { PluginManifest } from "@/kernel";
import { LineagePanel } from "./LineagePanel";

export const uiLineagePlugin: PluginManifest = {
  id: "com.lilium.builtin.ui-lineage",
  name: "Origines",
  version: "0.1.0",
  engines: { lilium: "^0.1.0" },
  description:
    "Panneau d’origine des médias. Affiche le nœud producteur, le moteur, les sources directes, parents et dérivés.",
  contributes: {
    panels: [
      {
        id: "lineage.inspector",
        title: "Origines",
        slot: "inspector",
        component: LineagePanel,
        order: 10,
      },
    ],
  },
};
