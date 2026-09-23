import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { mcpCtx } from "../ctx";
import { addMarker } from "@/lib/director/handlers.server";

export default defineTool({
  name: "add_marker",
  title: "Add a timeline marker / chapter",
  description:
    "Add a marker (YouTube chapter) at t_ms with a short label. list_markers returns the ready-to-paste chapter text.",
  inputSchema: {
    project_id: z.string(),
    t_ms: z.number().int().min(0),
    label: z.string().optional(),
  },
  annotations: { readOnlyHint: false },
  handler: async ({ project_id, ...rest }, ctx: ToolContext) => {
    const c = await mcpCtx(ctx, project_id);
    const row = await addMarker(c, rest);
    return {
      content: [{ type: "text", text: JSON.stringify(row) }],
      structuredContent: { marker: row },
    };
  },
});
