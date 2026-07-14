import type { PluginManifest } from "@/kernel";
import { StoryboardPanel } from "./StoryboardPanel";

export const uiStoryboardPlugin: PluginManifest = {
  id: "com.lilium.builtin.ui-storyboard",
  name: "Storyboard",
  version: "0.1.0",
  engines: { lilium: "^0.1.0" },
  description: "Scenes and shots — the narrative structure of the project.",
  contributes: {
    panels: [
      {
        id: "storyboard.center",
        title: "Storyboard",
        slot: "center",
        component: StoryboardPanel,
        order: 20,
      },
    ],
  },
};
