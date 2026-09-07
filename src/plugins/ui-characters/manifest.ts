import type { PluginManifest } from "@/kernel";
import { CharactersPanel } from "./CharactersPanel";

export const uiCharactersPlugin: PluginManifest = {
  id: "com.lilium.builtin.ui-characters",
  name: "Personnages",
  version: "0.1.0",
  engines: { lilium: "^0.1.0" },
  description: "Contexte IA — personnages, styles et voix du projet.",
  contributes: {
    panels: [
      {
        id: "characters.center",
        title: "Personnages",
        slot: "center",
        component: CharactersPanel,
        order: 50,
      },
      {
        id: "characters.inspector",
        title: "Personnages",
        slot: "inspector",
        component: CharactersPanel,
        order: 90,
      },
    ],
  },
};
