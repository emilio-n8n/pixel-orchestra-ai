import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { mcpCtx } from "../ctx";
import { insertSilenceClip } from "@/lib/director/handlers.server";

export default defineTool({
  name: "insert_silence_clip",
  title: "Insert silence clip",
  description:
    "Insert a native SILENCE clip on an audio track (Audio, Music, SFX). A pause with no asset — it occupies space so nothing plays during its duration. Use for pacing instead of computing start_ms gaps by hand.",
  inputSchema: {
    project_id: z.string(),
    duration_ms: z.number().int().positive(),
    track: z.enum(["Audio", "Music", "SFX"]),
    start_ms: z.number().int().min(0).optional(),
  },
  annotations: { readOnlyHint: false },
  handler: async ({ project_id, ...rest }, ctx: ToolContext) => {
    const c = await mcpCtx(ctx, project_id);
    const row = await insertSilenceClip(c, rest);
    return { content: [{ type: "text", text: JSON.stringify(row) }], structuredContent: { clip: row } };
  },
});
