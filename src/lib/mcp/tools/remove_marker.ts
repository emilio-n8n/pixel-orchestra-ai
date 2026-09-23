import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { mcpCtx } from "../ctx";
import { removeMarker } from "@/lib/director/handlers.server";

export default defineTool({
  name: "remove_marker",
  title: "Remove a marker",
  description: "Remove a timeline marker by its id (see list_markers).",
  inputSchema: { project_id: z.string(), marker_id: z.string() },
  annotations: { readOnlyHint: false },
  handler: async ({ project_id, marker_id }, ctx: ToolContext) => {
    const c = await mcpCtx(ctx, project_id);
    const row = await removeMarker(c, marker_id);
    return {
      content: [{ type: "text", text: JSON.stringify(row) }],
      structuredContent: { marker: row },
    };
  },
});
