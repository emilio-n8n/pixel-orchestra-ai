import type { PluginManifest } from "@/kernel";
import { LibraryPanel } from "./LibraryPanel";
import { UI_LABELS } from "@/lib/ui/labels";

export const libraryPlugin: PluginManifest = {
  id: "com.lilium.builtin.library",
  name: "Médias",
  version: "0.1.0",
  engines: { lilium: "^0.1.0" },
  description:
    "Médiathèque. Glisser-déposer, stockage par contenu, vue grille, ouvre les visionneuses au clic.",
  contributes: {
    panels: [
      { id: "library.center", title: "Médias", slot: "center", component: LibraryPanel, order: 5 },
    ],
    commands: [
      {
        id: "library.refresh",
        title: "Médias : Actualiser",
        category: "Médias",
        run: (ctx) => {
          ctx.events.emit({ type: "Custom.library.refresh" });
          ctx.ui.notify(UI_LABELS.toasts.biblioActualisee, "info");
        },
      },
    ],
  },
};
