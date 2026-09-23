import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { mcpCtx } from "../ctx";
import { trimClip } from "@/lib/director/handlers.server";

export default defineTool({
  name: "trim_clip",
  title: "Trim a clip edge (frame-accurate)",
  description:
    "Frame-accurate trim of one clip edge (30 fps). edge:'out' moves the tail, edge:'in' moves the head. snap magnetises to nearby clip edges, ripple shifts later clips to close the gap.",
  inputSchema: {
    project_id: z.string(),
    clip_id: z.string(),
    edge: z.enum(["in", "out"]).optional(),
    delta_ms: z.number().optional(),
    delta_frames: z.number().int().optional(),
    ripple: z.boolean().optional(),
    snap: z.boolean().optional(),
  },
  annotations: { readOnlyHint: false },
  handler: async ({ project_id, ...rest }, ctx: ToolContext) => {
    const c = await mcpCtx(ctx, project_id);
    const row = await trimClip(c, rest);
    return {
      content: [{ type: "text", text: JSON.stringify(row) }],
      structuredContent: { clip: row },
    };
  },
});
