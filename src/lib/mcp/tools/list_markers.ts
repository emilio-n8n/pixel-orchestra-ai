import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { mcpCtx } from "../ctx";
import { listMarkers } from "@/lib/director/handlers.server";

export default defineTool({
  name: "list_markers",
  title: "List markers and YouTube chapters",
  description:
    "List timeline markers ordered by time, plus the chapter text ready to paste in a YouTube description.",
  inputSchema: { project_id: z.string() },
  annotations: { readOnlyHint: true },
  handler: async ({ project_id }, ctx: ToolContext) => {
    const c = await mcpCtx(ctx, project_id);
    const row = await listMarkers(c);
    return {
      content: [{ type: "text", text: JSON.stringify(row) }],
      structuredContent: { markers: row.markers, chapters: row.chapters },
    };
  },
});
