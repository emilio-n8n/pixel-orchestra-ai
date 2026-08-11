import type { PluginManifest } from "@/kernel";
import { libraryPlugin } from "./library/manifest";
import { viewerImagePlugin } from "./viewer-image/manifest";
import { viewerVideoPlugin } from "./viewer-video/manifest";
import { viewerAudioPlugin } from "./viewer-audio/manifest";
import { viewerHtmlPlugin } from "./viewer-html/manifest";
import { connectorGradioPlugin } from "./connector-gradio";
import { connectorsPanelPlugin } from "./connectors-panel/manifest";
import { uiJobsPlugin } from "./ui-jobs/manifest";
import { uiTimelinePlugin } from "./ui-timeline/manifest";
import { connectorComfyuiPlugin } from "./connector-comfyui";
import { nodePrimitivesPlugin } from "./node-primitives/manifest";
import { nodeAssetPlugin } from "./node-asset/manifest";
import { nodeCapabilityPlugin } from "./node-capability/manifest";
import { nodeExporterPlugin } from "./node-exporter/manifest";
import { uiStoryboardPlugin } from "./ui-storyboard/manifest";
import { uiNodeGraphPlugin } from "./ui-node-graph/manifest";
import { uiCharactersPlugin } from "./ui-characters/manifest";
import { uiVersionsPlugin } from "./ui-versions/manifest";
import { uiLineagePlugin } from "./ui-lineage/manifest";

export const builtinPlugins: PluginManifest[] = [
  libraryPlugin,
  uiTimelinePlugin,
  connectorsPanelPlugin,
  uiJobsPlugin,
  viewerImagePlugin,
  viewerVideoPlugin,
  viewerAudioPlugin,
  viewerHtmlPlugin,
  connectorGradioPlugin,
  connectorComfyuiPlugin,
  // Node executors — must be registered so the node graph has types to run.
  nodePrimitivesPlugin,
  nodeAssetPlugin,
  nodeCapabilityPlugin,
  nodeExporterPlugin,
  // Creative panels (phases 5-8, previously dormant).
  uiStoryboardPlugin,
  uiNodeGraphPlugin,
  uiCharactersPlugin,
  uiVersionsPlugin,
  uiLineagePlugin,
];
