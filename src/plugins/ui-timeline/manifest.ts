import type { PluginManifest } from "@/kernel";
import { TimelinePanel } from "@/workspace/studio/TimelinePanel";

/**
 * The NLE is no longer a full-screen "center" module: in Studio V2 the bottom
 * zone is always mounted by the shell, and the manifest advertises the same
 * panel on the `bottom` slot so the kernel registry (command palette, plugin
 * counts, future docking) still knows the timeline exists.
 */
export const uiTimelinePlugin: PluginManifest = {
  id: "com.lilium.builtin.ui-timeline",
  name: "Éditeur",
  version: "0.2.0",
  engines: { lilium: "^0.1.0" },
  description:
    "Timeline NLE 7 pistes : titres, stickers, composants dynamiques, vidéo, voix, SFX et musique avec ducking automatique.",
  contributes: {
    panels: [
      {
        id: "timeline.bottom",
        title: "Timeline",
        slot: "bottom",
        component: TimelinePanel,
        order: 30,
      },
    ],
  },
};
