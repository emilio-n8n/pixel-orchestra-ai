import type { PluginManifest } from "@/kernel";
import { CharactersPanel } from "./CharactersPanel";

export const uiCharactersPlugin: PluginManifest = {
  id: "com.lilium.builtin.ui-characters",
  name: "Characters",
  version: "0.1.0",
  engines: { lilium: "^0.1.0" },
  description: "AI context — manage characters, styles, voices for the project.",
  contributes: {
    panels: [
      {
        id: "characters.center",
        title: "Characters",
        slot: "center",
        component: CharactersPanel,
        order: 50,
      },
      {
        id: "characters.inspector",
        title: "Characters",
        slot: "inspector",
        component: CharactersPanel,
        order: 90,
      },
    ],
  },
};
