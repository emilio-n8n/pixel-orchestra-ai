// Server-only Director tool handlers. Shared by /api/director (AI SDK tools)
// and the MCP server. Every handler takes an authenticated Supabase client
// bound to a specific user and their project id.

import type { SupabaseClient } from "@supabase/supabase-js";

const LOVABLE_AI_URL = "https://ai.gateway.lovable.dev/v1";

function requireKey() {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("LOVABLE_API_KEY is not configured");
  return key;
}

async function uploadBinaryAsset(
  supabase: SupabaseClient,
  userId: string,
  projectId: string,
  bytes: Uint8Array,
  mime: string,
  ext: string,
): Promise<string> {
  const filename = `${userId}/${projectId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from("assets").upload(filename, bytes, {
    contentType: mime,
    upsert: false,
  });
  if (error) throw new Error(`upload failed: ${error.message}`);
  const { data } = await supabase.storage.from("assets").createSignedUrl(filename, 60 * 60 * 24 * 365);
  return data?.signedUrl ?? filename;
}

async function insertAsset(
  supabase: SupabaseClient,
  userId: string,
  projectId: string,
  row: { kind: string; mime: string | null; url: string; prompt: string | null; meta?: Record<string, unknown> },
) {
  const { data, error } = await supabase
    .from("assets")
    .insert({ owner_id: userId, project_id: projectId, ...row, meta: row.meta ?? {} })
    .select("id, kind, url, mime, prompt, created_at")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export interface DirectorCtx {
  supabase: SupabaseClient;
  userId: string;
  projectId: string;
}

// -------- image ----------
export async function generateImage(ctx: DirectorCtx, prompt: string) {
  const res = await fetch(`${LOVABLE_AI_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${requireKey()}`,
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash-image",
      messages: [{ role: "user", content: prompt }],
      modalities: ["image", "text"],
    }),
  });
  if (!res.ok) throw new Error(`image gen failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  const url: string | undefined = data?.choices?.[0]?.message?.images?.[0]?.image_url?.url;
  if (!url || !url.startsWith("data:")) throw new Error("image gen returned no image");
  const [meta, b64] = url.split(",");
  const mime = /data:([^;]+)/.exec(meta)?.[1] ?? "image/png";
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const ext = mime.split("/")[1] ?? "png";
  const storedUrl = await uploadBinaryAsset(ctx.supabase, ctx.userId, ctx.projectId, bytes, mime, ext);
  return insertAsset(ctx.supabase, ctx.userId, ctx.projectId, {
    kind: "image",
    mime,
    url: storedUrl,
    prompt,
  });
}

// -------- tts / voice ----------
export async function generateVoice(
  ctx: DirectorCtx,
  text: string,
  voice: string = "alloy",
) {
  const res = await fetch(`${LOVABLE_AI_URL}/audio/speech`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${requireKey()}`,
    },
    body: JSON.stringify({
      model: "openai/gpt-4o-mini-tts",
      voice,
      input: text,
      response_format: "mp3",
    }),
  });
  if (!res.ok) throw new Error(`tts failed: ${res.status} ${await res.text()}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  const storedUrl = await uploadBinaryAsset(
    ctx.supabase,
    ctx.userId,
    ctx.projectId,
    bytes,
    "audio/mpeg",
    "mp3",
  );
  return insertAsset(ctx.supabase, ctx.userId, ctx.projectId, {
    kind: "audio",
    mime: "audio/mpeg",
    url: storedUrl,
    prompt: text,
    meta: { voice },
  });
}

// -------- html card (MCP only — uses LOVABLE_API_KEY) ----------
export async function generateHtmlCard(ctx: DirectorCtx, brief: string) {
  const res = await fetch(`${LOVABLE_AI_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${requireKey()}`,
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        {
          role: "system",
          content:
            "Return ONE complete HTML fragment (no <html> or <body>) styled inline for a 1920x1080 broadcast card. Bold typography, cinematic. No commentary, HTML only.",
        },
        { role: "user", content: brief },
      ],
    }),
  });
  if (!res.ok) throw new Error(`html gen failed: ${res.status}`);
  const data = await res.json();
  const html: string = data?.choices?.[0]?.message?.content ?? "";
  const cleaned = html.replace(/^```html\n?/i, "").replace(/```\s*$/i, "").trim();
  const bytes = new TextEncoder().encode(cleaned);
  const storedUrl = await uploadBinaryAsset(
    ctx.supabase,
    ctx.userId,
    ctx.projectId,
    bytes,
    "text/html",
    "html",
  );
  return insertAsset(ctx.supabase, ctx.userId, ctx.projectId, {
    kind: "html",
    mime: "text/html",
    url: storedUrl,
    prompt: brief,
  });
}

// -------- timeline ops ----------
export async function addToTimeline(
  ctx: DirectorCtx,
  args: { asset_id: string; track: string; start_ms?: number; duration_ms?: number },
) {
  const { data: max } = await ctx.supabase
    .from("timeline_clips")
    .select("start_ms,duration_ms")
    .eq("owner_id", ctx.userId)
    .eq("project_id", ctx.projectId)
    .eq("track", args.track)
    .order("start_ms", { ascending: false })
    .limit(1)
    .maybeSingle();
  const start =
    typeof args.start_ms === "number"
      ? args.start_ms
      : max
        ? (max.start_ms ?? 0) + (max.duration_ms ?? 3000)
        : 0;
  const { data, error } = await ctx.supabase
    .from("timeline_clips")
    .insert({
      owner_id: ctx.userId,
      project_id: ctx.projectId,
      track: args.track,
      asset_id: args.asset_id,
      start_ms: start,
      duration_ms: args.duration_ms ?? 3000,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function listTimeline(ctx: DirectorCtx) {
  const { data, error } = await ctx.supabase
    .from("timeline_clips")
    .select("id, track, asset_id, start_ms, duration_ms, ord, assets(kind, url, prompt)")
    .eq("owner_id", ctx.userId)
    .eq("project_id", ctx.projectId)
    .order("track")
    .order("start_ms");
  if (error) throw new Error(error.message);
  return data;
}

export async function listAssets(ctx: DirectorCtx) {
  const { data, error } = await ctx.supabase
    .from("assets")
    .select("id, kind, url, prompt, created_at")
    .eq("owner_id", ctx.userId)
    .eq("project_id", ctx.projectId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);
  return data;
}