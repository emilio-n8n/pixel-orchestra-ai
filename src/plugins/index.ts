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
import { directorPlugin } from "./director/manifest";

export const builtinPlugins: PluginManifest[] = [
  directorPlugin,
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
];
