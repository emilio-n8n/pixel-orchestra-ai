import { auth, defineMcp } from "@lovable.dev/mcp-js";
import generateImageTool from "./tools/generate_image";
import generateVoiceTool from "./tools/generate_voice";
import generateHtmlCardTool from "./tools/generate_html_card";
import addToTimelineTool from "./tools/add_to_timeline";
import listTimelineTool from "./tools/list_timeline";
import listAssetsTool from "./tools/list_assets";

const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "lilium-studio-mcp",
  title: "Lilium Studio",
  version: "0.1.0",
  instructions:
    "Lilium Studio: generate images, voices, and HTML title cards, and place them on a project's timeline. Every tool takes a project_id — obtain it from the URL after /p/ in the Lilium workspace.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [
    generateImageTool,
    generateVoiceTool,
    generateHtmlCardTool,
    addToTimelineTool,
    listTimelineTool,
    listAssetsTool,
  ],
});