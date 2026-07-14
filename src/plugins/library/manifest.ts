import type { PluginManifest } from "@/kernel";
import { LibraryPanel } from "./LibraryPanel";

export const libraryPlugin: PluginManifest = {
  id: "com.lilium.builtin.library",
  name: "Library",
  version: "0.1.0",
  engines: { lilium: "^0.1.0" },
  description:
    "Asset library. Drag & drop, content-addressed storage, grid view, opens viewers on click.",
  contributes: {
    panels: [
      { id: "library.center", title: "Library", slot: "center", component: LibraryPanel, order: 5 },
    ],
    commands: [
      {
        id: "library.refresh",
        title: "Library: Refresh",
        category: "Library",
        run: (ctx) => {
          ctx.events.emit({ type: "Custom.library.refresh" });
          ctx.ui.notify("Library refresh requested", "info");
        },
      },
    ],
  },
};
