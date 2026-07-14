import type { PluginManifest } from "@/kernel";
import { ConnectorsPanel } from "./ConnectorsPanel";

export const connectorsPanelPlugin: PluginManifest = {
  id: "com.lilium.builtin.connectors-panel",
  name: "Connectors",
  version: "0.1.0",
  engines: { lilium: "^0.1.0" },
  description:
    "Browse, add and invoke Gradio connectors. Lists registered capabilities, runs them with auto-generated forms.",
  contributes: {
    panels: [
      {
        id: "connectors.center",
        title: "Connectors",
        slot: "center",
        component: ConnectorsPanel,
        order: 60,
      },
    ],
  },
};
