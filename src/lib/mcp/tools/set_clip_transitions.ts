import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { mcpCtx } from "../ctx";
import { setClipTransitions } from "@/lib/director/handlers.server";

export default defineTool({
  name: "set_clip_transitions",
  title: "Crossfade clips",
  description:
    "Crossfade two clips on the SAME track: clip B is pulled to overlap the tail of clip A by ms. Video → dissolve, audio → volume cross-fade.",
  inputSchema: {
    project_id: z.string(),
    clip_a_id: z.string(),
    clip_b_id: z.string(),
    ms: z.number().int().min(50).max(5000),
  },
  annotations: { readOnlyHint: false },
  handler: async ({ project_id, clip_a_id, clip_b_id, ms }, ctx: ToolContext) => {
    const c = await mcpCtx(ctx, project_id);
    const row = await setClipTransitions(c, { clip_a_id, clip_b_id, ms });
    return { content: [{ type: "text", text: JSON.stringify(row) }], structuredContent: { transition: row } };
  },
});
