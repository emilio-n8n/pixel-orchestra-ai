import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { mcpCtx } from "../ctx";
import { generateImage } from "@/lib/director/handlers.server";

export default defineTool({
  name: "generate_image",
  title: "Generate image",
  description: "Generate an image from a text prompt into the given project.",
  inputSchema: {
    project_id: z.string().describe("Project id to attach the asset to."),
    prompt: z.string().min(1),
  },
  annotations: { readOnlyHint: false },
  handler: async ({ project_id, prompt }, ctx: ToolContext) => {
    const c = await mcpCtx(ctx, project_id);
    const row = await generateImage(c, prompt);
    return { content: [{ type: "text", text: JSON.stringify(row) }], structuredContent: { asset: row } };
  },
});