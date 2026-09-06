import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { mcpCtx } from "../ctx";
import { editSubtitles } from "@/lib/director/handlers.server";

export default defineTool({
  name: "edit_subtitles",
  title: "Edit subtitles",
  description:
    "Edit a subtitle clip's text and/or style (font, size, color, position). The timeline renders subtitles from the clip meta.",
  inputSchema: {
    project_id: z.string(),
    clip_id: z.string(),
    text: z.string(),
    style: z
      .object({
        font: z.string().optional(),
        size: z.number().int().min(10).max(120).optional(),
        color: z.string().optional(),
        position: z.enum(["bottom", "center", "top"]).optional(),
      })
      .optional(),
  },
  annotations: { readOnlyHint: false },
  handler: async ({ project_id, clip_id, text, style }, ctx: ToolContext) => {
    const c = await mcpCtx(ctx, project_id);
    const row = await editSubtitles(c, clip_id, text, style);
    return { content: [{ type: "text", text: JSON.stringify(row) }], structuredContent: { clip: row } };
  },
});
