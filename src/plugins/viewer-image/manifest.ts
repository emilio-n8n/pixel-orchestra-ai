import type { PluginManifest } from "@/kernel";
import { ImageViewer } from "./ImageViewer";

export const viewerImagePlugin: PluginManifest = {
  id: "com.lilium.builtin.viewer-image",
  name: "Viewer — Image",
  version: "0.1.0",
  engines: { lilium: "^0.1.0" },
  contributes: {
    viewers: [{ id: "viewer-image", accepts: ["image"], component: ImageViewer, priority: 10 }],
  },
};
