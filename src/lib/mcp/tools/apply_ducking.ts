import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { mcpCtx } from "../ctx";
import { applyDucking } from "@/lib/director/handlers.server";

export default defineTool({
  name: "apply_ducking",
  title: "Apply ducking",
  description:
    "Automatic ducking: while the source track (default Audio) plays, the target track (default Music) drops by attenuation_db with a smooth attack/release. Call once after placing voice + music.",
  inputSchema: {
    project_id: z.string(),
    source_track: z.enum(["Audio", "Music", "SFX"]).optional(),
    target_track: z.enum(["Audio", "Music", "SFX"]).optional(),
    attenuation_db: z.number().min(-40).max(0).optional(),
    attack_ms: z.number().int().min(0).max(2000).optional(),
    release_ms: z.number().int().min(0).max(4000).optional(),
  },
  annotations: { readOnlyHint: false },
  handler: async ({ project_id, ...rest }, ctx: ToolContext) => {
    const c = await mcpCtx(ctx, project_id);
    const row = await applyDucking(c, rest);
    return {
      content: [{ type: "text", text: JSON.stringify(row) }],
      structuredContent: { ducking: row },
    };
  },
});
