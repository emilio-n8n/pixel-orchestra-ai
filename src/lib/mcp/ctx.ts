// Build an authenticated DirectorCtx from an MCP ToolContext.
// The MCP OAuth verifier stashes the caller's Supabase user id on the token.

import type { ToolContext } from "@lovable.dev/mcp-js";
import type { DirectorCtx } from "@/lib/director/handlers.server";
import { CATALOG } from "@/lib/models/catalog";

export async function mcpCtx(ctx: ToolContext, projectId: string): Promise<DirectorCtx> {
  if (!ctx.isAuthenticated()) throw new Error("Not authenticated");
  const userId = ctx.getUserId();
  const token = ctx.getToken();
  if (!userId || !token) throw new Error("Missing user or token");
  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  // MCP has no per-request client credentials (no Cloudflare/Groq keys):
  // expose the builtin catalogue so list_models works; image falls back
  // to Lovable, transcription fails clean in French (Groq key missing).
  return { supabase, userId, projectId, models: [...CATALOG], creds: {} };
}
