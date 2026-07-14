import type { PluginManifest } from "@/kernel";
import { HtmlViewer } from "./HtmlViewer";

export const viewerHtmlPlugin: PluginManifest = {
  id: "com.lilium.builtin.viewer-html",
  name: "Viewer — HTML",
  version: "0.1.0",
  engines: { lilium: "^0.1.0" },
  contributes: {
    viewers: [{ id: "viewer-html", accepts: ["html"], component: HtmlViewer, priority: 10 }],
  },
};
