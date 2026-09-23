import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { mcpCtx } from "../ctx";
import { setClipTransform } from "@/lib/director/handlers.server";

export default defineTool({
  name: "set_clip_transform",
  title: "Transform a clip",
  description:
    "Static transform of a clip: scale, normalized center position (0.5,0.5 = centered) and opacity. Use for PiP / split-screen / B-roll overlays. reset:true clears it.",
  inputSchema: {
    project_id: z.string(),
    clip_id: z.string(),
    scale: z.number().min(0.05).max(4).optional(),
    x: z.number().min(-1).max(2).optional(),
    y: z.number().min(-1).max(2).optional(),
    opacity: z.number().min(0).max(1).optional(),
    reset: z.boolean().optional(),
  },
  annotations: { readOnlyHint: false },
  handler: async ({ project_id, ...rest }, ctx: ToolContext) => {
    const c = await mcpCtx(ctx, project_id);
    const row = await setClipTransform(c, rest);
    return {
      content: [{ type: "text", text: JSON.stringify(row) }],
      structuredContent: { clip: row },
    };
  },
});
