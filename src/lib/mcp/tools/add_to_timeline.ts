import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { mcpCtx } from "../ctx";
import { addToTimeline } from "@/lib/director/handlers.server";

export default defineTool({
  name: "add_to_timeline",
  title: "Add asset to timeline",
  description: "Place an existing asset on a timeline track.",
  inputSchema: {
    project_id: z.string(),
    asset_id: z.string(),
    track: z.enum(["Video", "Audio", "Music", "SFX", "Subtitles"]),
    start_ms: z.number().int().optional(),
    duration_ms: z.number().int().optional(),
  },
  annotations: { readOnlyHint: false },
  handler: async ({ project_id, ...rest }, ctx: ToolContext) => {
    const c = await mcpCtx(ctx, project_id);
    const row = await addToTimeline(c, rest);
    return { content: [{ type: "text", text: JSON.stringify(row) }], structuredContent: { clip: row } };
  },
});