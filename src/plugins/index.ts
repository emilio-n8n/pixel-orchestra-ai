import type { PluginManifest } from "@/kernel";
import { helloPlugin } from "./hello/manifest";
import { libraryPlugin } from "./library/manifest";
import { viewerImagePlugin } from "./viewer-image/manifest";
import { viewerVideoPlugin } from "./viewer-video/manifest";
import { viewerAudioPlugin } from "./viewer-audio/manifest";
import { viewerHtmlPlugin } from "./viewer-html/manifest";
import { connectorGradioPlugin } from "./connector-gradio";
import { connectorsPanelPlugin } from "./connectors-panel/manifest";
import { nodePrimitivesPlugin } from "./node-primitives/manifest";
import { nodeCapabilityPlugin } from "./node-capability/manifest";
import { nodeAssetPlugin } from "./node-asset/manifest";
import { nodeExporterPlugin } from "./node-exporter/manifest";
import { uiNodeGraphPlugin } from "./ui-node-graph/manifest";
import { uiJobsPlugin } from "./ui-jobs/manifest";

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
  nodePrimitivesPlugin,
  nodeCapabilityPlugin,
  nodeAssetPlugin,
  nodeExporterPlugin,
  uiNodeGraphPlugin,
  uiJobsPlugin,
];
