import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { mcpCtx } from "../ctx";
import { listAssets } from "@/lib/director/handlers.server";

export default defineTool({
  name: "list_assets",
  title: "List assets",
  description: "List recent assets in a project.",
  inputSchema: { project_id: z.string() },
  annotations: { readOnlyHint: true, idempotentHint: true },
  handler: async ({ project_id }, ctx: ToolContext) => {
    const c = await mcpCtx(ctx, project_id);
    const rows = await listAssets(c);
    return { content: [{ type: "text", text: JSON.stringify(rows) }], structuredContent: { assets: rows } };
  },
});