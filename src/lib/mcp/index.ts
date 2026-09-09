import { auth, defineMcp } from "@lovable.dev/mcp-js";
import generateImageTool from "./tools/generate_image";
import generateVoiceTool from "./tools/generate_voice";
import generateHtmlCardTool from "./tools/generate_html_card";
import addToTimelineTool from "./tools/add_to_timeline";
import removeFromTimelineTool from "./tools/remove_from_timeline";
import insertSilenceClipTool from "./tools/insert_silence_clip";
import editSubtitlesTool from "./tools/edit_subtitles";
import generateVoiceTakesTool from "./tools/generate_voice_takes";
import applyDuckingTool from "./tools/apply_ducking";
import setClipTransitionsTool from "./tools/set_clip_transitions";
import listTimelineTool from "./tools/list_timeline";
import listAssetsTool from "./tools/list_assets";

const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "lilium-studio-mcp",
  title: "Lilium Studio",
  version: "0.1.0",
  instructions:
    "Lilium Studio: generate images, voices (single or A/B takes), and HTML title cards, place them on a project's timeline, and edit it (silence clips, editable subtitles, automatic ducking, crossfade transitions, ripple delete). Every tool takes a project_id — obtain it from the URL after /p/ in the Lilium workspace.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [
    generateImageTool,
    generateVoiceTool,
    generateVoiceTakesTool,
    generateHtmlCardTool,
    addToTimelineTool,
    removeFromTimelineTool,
    insertSilenceClipTool,
    editSubtitlesTool,
    applyDuckingTool,
    setClipTransitionsTool,
    listTimelineTool,
    listAssetsTool,
  ],
});
