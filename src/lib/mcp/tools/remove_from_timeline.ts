import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { mcpCtx } from "../ctx";
import { removeFromTimeline } from "@/lib/director/handlers.server";

export default defineTool({
  name: "remove_from_timeline",
  title: "Remove from timeline",
  description: "Remove a clip from the timeline by its id.",
  inputSchema: { project_id: z.string(), clip_id: z.string() },
  annotations: { readOnlyHint: false },
  handler: async ({ project_id, clip_id }, ctx: ToolContext) => {
    const c = await mcpCtx(ctx, project_id);
    const row = await removeFromTimeline(c, clip_id);
    return { content: [{ type: "text", text: JSON.stringify(row) }], structuredContent: { removed: row } };
  },
});
