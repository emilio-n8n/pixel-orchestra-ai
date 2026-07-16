import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { mcpCtx } from "../ctx";
import { generateVoice } from "@/lib/director/handlers.server";

export default defineTool({
  name: "generate_voice",
  title: "Generate voiceover",
  description: "Generate a TTS voiceover (mp3) for the given text.",
  inputSchema: {
    project_id: z.string(),
    text: z.string().min(1),
    voice: z.enum(["alloy", "echo", "fable", "onyx", "nova", "shimmer"]).optional(),
  },
  annotations: { readOnlyHint: false },
  handler: async ({ project_id, text, voice }, ctx: ToolContext) => {
    const c = await mcpCtx(ctx, project_id);
    const row = await generateVoice(c, text, voice);
    return { content: [{ type: "text", text: JSON.stringify(row) }], structuredContent: { asset: row } };
  },
});