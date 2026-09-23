import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { mcpCtx } from "../ctx";
import { setClipKeyframes } from "@/lib/director/handlers.server";

export default defineTool({
  name: "set_clip_keyframes",
  title: "Animate a clip transform",
  description:
    "Animate a clip transform (scale / normalized center position / opacity) over its own time. t_ms is CLIP-LOCAL (0 = clip start); omitted properties keep the static transform. reset:true removes the animation.",
  inputSchema: {
    project_id: z.string(),
    clip_id: z.string(),
    keyframes: z
      .array(
        z.object({
          t_ms: z.number().int().min(0),
          scale: z.number().min(0.05).max(4).optional(),
          x: z.number().min(-1).max(2).optional(),
          y: z.number().min(-1).max(2).optional(),
          opacity: z.number().min(0).max(1).optional(),
        }),
      )
      .max(50)
      .optional(),
    reset: z.boolean().optional(),
  },
  annotations: { readOnlyHint: false },
  handler: async ({ project_id, ...rest }, ctx: ToolContext) => {
    const c = await mcpCtx(ctx, project_id);
    const row = await setClipKeyframes(c, rest);
    return {
      content: [{ type: "text", text: JSON.stringify(row) }],
      structuredContent: { clip: row },
    };
  },
});
