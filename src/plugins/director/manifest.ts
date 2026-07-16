import type { PluginManifest } from "@/kernel";
import { DirectorPanel } from "./DirectorPanel";

export const directorPlugin: PluginManifest = {
  id: "com.lilium.builtin.director",
  name: "Director",
  version: "0.1.0",
  engines: { lilium: "^0.1.0" },
  description:
    "AI Director — generate images, voices, and title cards, and drop them on the timeline.",
  contributes: {
    panels: [
      { id: "director.center", title: "Director", slot: "center", component: DirectorPanel, order: -10 },
    ],
  },
  activate: (ctx) => ctx.logger.info("director plugin activated"),
};