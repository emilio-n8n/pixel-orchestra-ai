import type { PluginManifest } from "@/kernel";
import { ConnectorsPanel } from "./ConnectorsPanel";

export const connectorsPanelPlugin: PluginManifest = {
  id: "com.lilium.builtin.connectors-panel",
  name: "Connexions",
  version: "0.1.0",
  engines: { lilium: "^0.1.0" },
  description:
    "Parcourt, ajoute et appelle les connecteurs Gradio. Liste les capacités, les exécute via des formulaires auto-générés.",
  contributes: {
    panels: [
      {
        id: "connectors.center",
        title: "Connexions",
        slot: "center",
        component: ConnectorsPanel,
        order: 60,
      },
    ],
  },
};
