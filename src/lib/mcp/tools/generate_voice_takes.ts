import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { mcpCtx } from "../ctx";
import { generateVoiceTakes } from "@/lib/director/handlers.server";

export default defineTool({
  name: "generate_voice_takes",
  title: "Generate voice takes",
  description:
    "Generate n (default 3) variations of the SAME line so the user can pick the best one. Takes share a take_group id; the Library/Inspector groups them for A/B.",
  inputSchema: {
    project_id: z.string(),
    text: z.string().min(1),
    voice: z.enum(["alloy", "echo", "fable", "onyx", "nova", "shimmer"]).optional(),
    n: z.number().int().min(1).max(5).optional(),
  },
  annotations: { readOnlyHint: false },
  handler: async ({ project_id, text, voice, n }, ctx: ToolContext) => {
    const c = await mcpCtx(ctx, project_id);
    const row = await generateVoiceTakes(c, text, voice, n);
    return { content: [{ type: "text", text: JSON.stringify(row) }], structuredContent: { takes: row } };
  },
});
