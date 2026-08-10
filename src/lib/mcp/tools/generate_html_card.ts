import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { mcpCtx } from "../ctx";
import { generateHtmlCard } from "@/lib/director/handlers.server";

export default defineTool({
  name: "generate_html_card",
  title: "Generate HTML title card",
  description:
    "Generate an ANIMATED HTML card (title, lower third, credits, transition) — ships with CSS keyframes (entrance + ambient motion) that become real video motion at export. Pass the text, vibe, colors and the motion in the brief.",
  inputSchema: { project_id: z.string(), brief: z.string().min(1) },
  annotations: { readOnlyHint: false },
  handler: async ({ project_id, brief }, ctx: ToolContext) => {
    const c = await mcpCtx(ctx, project_id);
    const row = await generateHtmlCard(c, brief);
    return { content: [{ type: "text", text: JSON.stringify(row) }], structuredContent: { asset: row } };
  },
});