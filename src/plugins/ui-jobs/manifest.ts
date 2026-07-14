import type { PluginManifest } from "@/kernel";
import { JobsPanel } from "./JobsPanel";

export const uiJobsPlugin: PluginManifest = {
  id: "com.lilium.builtin.ui-jobs",
  name: "Jobs",
  version: "0.1.0",
  engines: { lilium: "^0.1.0" },
  description: "Live job queue — recent graph runs, statuses, stats.",
  contributes: {
    panels: [{ id: "jobs.center", title: "Jobs", slot: "center", component: JobsPanel, order: 70 }],
  },
};
