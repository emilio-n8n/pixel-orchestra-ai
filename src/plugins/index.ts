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
import { uiLineagePlugin } from "./ui-lineage/manifest";
import { uiCharactersPlugin } from "./ui-characters/manifest";
import { uiStoryboardPlugin } from "./ui-storyboard/manifest";
import { uiTimelinePlugin } from "./ui-timeline/manifest";
import { uiVersionsPlugin } from "./ui-versions/manifest";
import { agentCopilotPlugin } from "./agent-copilot/manifest";
import { connectorComfyuiPlugin } from "./connector-comfyui";
import { directorPlugin } from "./director/manifest";

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
  uiLineagePlugin,
  uiCharactersPlugin,
  uiStoryboardPlugin,
  uiTimelinePlugin,
  uiVersionsPlugin,
  agentCopilotPlugin,
  connectorComfyuiPlugin,
  directorPlugin,
];
