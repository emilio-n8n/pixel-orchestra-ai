import type { PluginManifest } from "@/kernel";
import { AudioViewer } from "./AudioViewer";

export const viewerAudioPlugin: PluginManifest = {
  id: "com.lilium.builtin.viewer-audio",
  name: "Viewer — Audio",
  version: "0.1.0",
  engines: { lilium: "^0.1.0" },
  contributes: {
    viewers: [{ id: "viewer-audio", accepts: ["audio"], component: AudioViewer, priority: 10 }],
  },
};
