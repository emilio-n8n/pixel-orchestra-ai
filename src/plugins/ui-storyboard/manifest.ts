import type { PluginManifest } from "@/kernel";
import { StoryboardPanel } from "./StoryboardPanel";

export const uiStoryboardPlugin: PluginManifest = {
  id: "com.lilium.builtin.ui-storyboard",
  name: "Scènes",
  version: "0.1.0",
  engines: { lilium: "^0.1.0" },
  description: "Scènes et plans — la structure narrative du projet.",
  contributes: {
    panels: [
      {
        id: "storyboard.center",
        title: "Scènes",
        slot: "center",
        component: StoryboardPanel,
        order: 20,
      },
    ],
  },
};
