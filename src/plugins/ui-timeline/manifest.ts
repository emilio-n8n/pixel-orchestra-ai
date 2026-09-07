import type { PluginManifest } from "@/kernel";
import { TimelinePanel } from "./TimelinePanel";

export const uiTimelinePlugin: PluginManifest = {
  id: "com.lilium.builtin.ui-timeline",
  name: "Éditeur",
  version: "0.1.0",
  engines: { lilium: "^0.1.0" },
  description: "Timeline multi-pistes pour monter image, voix, musique, effets et texte.",
  contributes: {
    panels: [
      {
        id: "timeline.center",
        title: "Éditeur",
        slot: "center",
        component: TimelinePanel,
        order: 30,
      },
    ],
  },
};
