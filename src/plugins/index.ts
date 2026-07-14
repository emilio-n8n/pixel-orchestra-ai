import type { PluginManifest } from "@/kernel";
import { helloPlugin } from "./hello/manifest";
import { libraryPlugin } from "./library/manifest";
import { viewerImagePlugin } from "./viewer-image/manifest";
import { viewerVideoPlugin } from "./viewer-video/manifest";
import { viewerAudioPlugin } from "./viewer-audio/manifest";
import { viewerHtmlPlugin } from "./viewer-html/manifest";
import { connectorGradioPlugin } from "./connector-gradio";
import { connectorsPanelPlugin } from "./connectors-panel/manifest";

// Static list of builtin plugins loaded at boot.
export const builtinPlugins: PluginManifest[] = [
  helloPlugin,
  libraryPlugin,
  viewerImagePlugin,
  viewerVideoPlugin,
  viewerAudioPlugin,
  viewerHtmlPlugin,
  connectorGradioPlugin,
  connectorsPanelPlugin,
];
