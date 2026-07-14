import type { PluginManifest } from "@/kernel";
import { TimelinePanel } from "./TimelinePanel";

export const uiTimelinePlugin: PluginManifest = {
  id: "com.lilium.builtin.ui-timeline",
  name: "Timeline",
  version: "0.1.0",
  engines: { lilium: "^0.1.0" },
  description: "Multi-track timeline (phase 7 preview — basic clip list).",
  contributes: {
    panels: [
      {
        id: "timeline.center",
        title: "Timeline",
        slot: "center",
        component: TimelinePanel,
        order: 30,
      },
    ],
  },
};
