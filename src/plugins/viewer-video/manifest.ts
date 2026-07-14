import type { PluginManifest } from "@/kernel";
import { VideoViewer } from "./VideoViewer";

export const viewerVideoPlugin: PluginManifest = {
  id: "com.lilium.builtin.viewer-video",
  name: "Viewer — Video",
  version: "0.1.0",
  engines: { lilium: "^0.1.0" },
  contributes: {
    viewers: [{ id: "viewer-video", accepts: ["video"], component: VideoViewer, priority: 10 }],
  },
};
