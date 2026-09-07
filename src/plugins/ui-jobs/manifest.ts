import type { PluginManifest } from "@/kernel";
import { JobsPanel } from "./JobsPanel";

export const uiJobsPlugin: PluginManifest = {
  id: "com.lilium.builtin.ui-jobs",
  name: "Rendus",
  version: "0.1.0",
  engines: { lilium: "^0.1.0" },
  description: "File des rendus — derniers flux exécutés, statuts, statistiques.",
  contributes: {
    panels: [{ id: "jobs.center", title: "Rendus", slot: "center", component: JobsPanel, order: 70 }],
  },
};
