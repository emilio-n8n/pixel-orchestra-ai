import type { PluginManifest } from "@/kernel";
import { VersionsPanel } from "./VersionsPanel";

export const uiVersionsPlugin: PluginManifest = {
  id: "com.lilium.builtin.ui-versions",
  name: "Versions",
  version: "0.1.0",
  engines: { lilium: "^0.1.0" },
  description: "Creative versioning — snapshots, restore, branch (phase 8).",
  contributes: {
    panels: [
      {
        id: "versions.inspector",
        title: "Versions",
        slot: "inspector",
        component: VersionsPanel,
        order: 110,
      },
    ],
  },
};
