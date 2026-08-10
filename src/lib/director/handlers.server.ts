// Server-only Director tool handlers. Shared by /api/director (AI SDK tools)
// and the MCP server. Every handler takes an authenticated Supabase client
// bound to a specific user and their project id.

import type { SupabaseClient } from "@supabase/supabase-js";
import { getStorage } from "@/kernel/storage";
import { getDb } from "@/kernel/db";
import { getKernel } from "@/kernel";
import { measureMp3DurationMs } from "./audio-duration";
import { generateImageCloudflare, generateImageLovable, transcribeAudioGroq, type ModelCreds } from "@/lib/models/providers.server";
import type { DirectorModel } from "@/lib/models/catalog";

function uid(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
}

async function storeInLocalKernel(
  projectId: string,
  kind: string,
  name: string,
  mime: string | null,
  bytes: Uint8Array,
  prompt: string,
  meta?: Record<string, unknown>,
) {
  try {
    const storage = getStorage();
    const db = getDb();
    const ref = await storage.put(bytes);
    const id = uid(`dir_${kind}`);
    const now = Date.now();
    db.prepare(
      `INSERT INTO assets (id, project_id, kind, name, mime, size_bytes, blob_hash, meta_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, projectId, kind, name, mime ?? "application/octet-stream", ref.size, ref.hash, JSON.stringify(meta ?? {}), now, now);
    try {
      getKernel().events.emit({
        type: "AssetImported",
        assetId: id,
        projectId,
        kind,
        name,
        sizeBytes: ref.size,
        blobHash: ref.hash,
      });
    } catch { /* kernel not ready */ }
  } catch { /* local kernel not available */ }
}

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
): Promise<{ url: string; storagePath: string }> {
  const filename = `${userId}/${projectId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from("assets").upload(filename, bytes, {
    contentType: mime,
    upsert: false,
  });
  if (error) throw new Error(`upload failed: ${error.message}`);
  const { data, error: signErr } = await supabase.storage.from("assets").createSignedUrl(filename, 60 * 60 * 24 * 365);
  if (signErr || !data?.signedUrl) {
    console.warn(`[director] createSignedUrl failed (${signErr?.message ?? "empty"}) — storing raw filename, timeline will skip it`);
  }
  return { url: data?.signedUrl ?? filename, storagePath: filename };
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
    .select("id, kind, url, mime, prompt, created_at, meta")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export interface DirectorCtx {
  supabase: SupabaseClient;
  userId: string;
  projectId: string;
  /** Unified model catalogue available to this request (user's models). */
  models?: DirectorModel[];
  /** Provider credentials sent from the client. */
  creds?: ModelCreds;
}

// -------- image ----------
/**
 * Generate an image. If `modelId` is provided and matches a catalogued
 * Cloudflare image model, use Cloudflare Workers AI; otherwise fall back
 * to the Lovable AI Gateway (Gemini).
 */
export async function generateImage(
  ctx: DirectorCtx,
  prompt: string,
  modelId?: string,
) {
  const models = ctx.models ?? [];
  const creds = ctx.creds ?? {};
  const preferred = modelId
    ? models.find((m) => m.id === modelId || m.modelId === modelId)
    : undefined;
  const cfModel = preferred?.provider === "cloudflare" ? preferred : undefined;

  let mime: string;
  let bytes: Uint8Array;
  if (cfModel && creds.cloudflareAccountId && creds.cloudflareApiKey) {
    const out = await generateImageCloudflare(cfModel, prompt, creds);
    mime = out.mime;
    bytes = out.bytes;
  } else {
    const out = await generateImageLovable(prompt);
    mime = out.mime;
    bytes = out.bytes;
  }
  const ext = mime.split("/")[1] ?? "png";
  const { url: storedUrl, storagePath } = await uploadBinaryAsset(ctx.supabase, ctx.userId, ctx.projectId, bytes, mime, ext);
  const row = await insertAsset(ctx.supabase, ctx.userId, ctx.projectId, {
    kind: "image",
    mime,
    url: storedUrl,
    prompt,
    meta: { storage_path: storagePath },
  });
  storeInLocalKernel(ctx.projectId, "image", `Director Image — ${prompt.slice(0, 40)}`, mime, bytes, prompt, { storage_path: storagePath });
  return row;
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
  const durationMs = measureMp3DurationMs(bytes);
  const meta = { voice, duration_ms: durationMs };
  const { url: storedUrl, storagePath } = await uploadBinaryAsset(
    ctx.supabase,
    ctx.userId,
    ctx.projectId,
    bytes,
    "audio/mpeg",
    "mp3",
  );
  const row = await insertAsset(ctx.supabase, ctx.userId, ctx.projectId, {
    kind: "audio",
    mime: "audio/mpeg",
    url: storedUrl,
    prompt: text,
    meta: { ...meta, storage_path: storagePath },
  });
  storeInLocalKernel(ctx.projectId, "audio", `Director Voice — ${text.slice(0, 40)}`, "audio/mpeg", bytes, text, { ...meta, storage_path: storagePath });
  return row;
}

// -------- subtitles / transcription (Groq whisper) ----------
/**
 * Transcribe an audio asset with Groq (whisper-large-v3) and place the
 * result as a Subtitles clip on the timeline, sized to the real audio
 * duration. Returns the transcript + the created asset + clip.
 */
export async function transcribeAudio(ctx: DirectorCtx, assetId: string) {
  const groqApiKey = ctx.creds?.groqApiKey;
  if (!groqApiKey) throw new Error("Groq API key not configured (Director settings → Groq)");

  const { data: asset, error: assetErr } = await ctx.supabase
    .from("assets")
    .select("id, kind, mime, url, meta")
    .eq("id", assetId)
    .maybeSingle();
  if (assetErr || !asset) throw new Error("asset not found");
  const mime = asset.mime ?? "audio/mpeg";
  if (!asset.url || !/^https?:\/\//i.test(asset.url)) {
    throw new Error("asset has no usable url (signed url missing) — replace the file or regenerate the voice");
  }
  const res = await fetch(asset.url);
  if (!res.ok) throw new Error(`failed to fetch audio: ${res.status}`);
  const bytes = new Uint8Array(await res.arrayBuffer());

  const { text } = await transcribeAudioGroq(bytes, mime, groqApiKey);
  if (!text) throw new Error("transcription returned empty text");

  // Store the transcript as an asset (kind html so the viewer can open it).
  const transcriptBytes = new TextEncoder().encode(text);
  const { url: storedUrl, storagePath } = await uploadBinaryAsset(
    ctx.supabase,
    ctx.userId,
    ctx.projectId,
    transcriptBytes,
    "text/html",
    "html",
  );
  const assetRow = await insertAsset(ctx.supabase, ctx.userId, ctx.projectId, {
    kind: "html",
    mime: "text/html",
    url: storedUrl,
    prompt: text,
    meta: { storage_path: storagePath },
  });
  storeInLocalKernel(ctx.projectId, "html", `Subtitles — ${text.slice(0, 40)}`, "text/html", transcriptBytes, text, { storage_path: storagePath });

  // Place on the Subtitles track with the audio's real duration.
  const meta = (asset.meta ?? {}) as Record<string, unknown>;
  const durationMs = typeof meta.duration_ms === "number" && meta.duration_ms > 0 ? meta.duration_ms : 3000;
  const clip = await addToTimeline(ctx, {
    asset_id: assetRow.id,
    track: "Subtitles",
    duration_ms: durationMs,
  });

  return { transcript: text, asset: assetRow, clip };
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
  const wrapped = `<div style="position:fixed;inset:0;width:100vw;height:100vh;overflow:hidden;background:#000;display:flex;align-items:center;justify-content:center;color:#fff;">${cleaned}</div>`;
  const wrappedBytes = new TextEncoder().encode(wrapped);
  const { url: storedUrl, storagePath } = await uploadBinaryAsset(
    ctx.supabase,
    ctx.userId,
    ctx.projectId,
    wrappedBytes,
    "text/html",
    "html",
  );
  const row = await insertAsset(ctx.supabase, ctx.userId, ctx.projectId, {
    kind: "html",
    mime: "text/html",
    url: storedUrl,
    prompt: brief,
    meta: { storage_path: storagePath },
  });
  storeInLocalKernel(ctx.projectId, "html", `Director HTML Card — ${brief.slice(0, 40)}`, "text/html", wrappedBytes, brief, { storage_path: storagePath });
  return row;
}

// -------- timeline ops ----------
export async function addToTimeline(
  ctx: DirectorCtx,
  args: { asset_id: string; track: string; start_ms?: number; duration_ms?: number },
) {
  const desiredStart = args.start_ms ?? 0;

  // Fetch the asset's real duration from metadata (if it's an audio file)
  let realDurationMs: number | null = null;
  const { data: assetRow } = await ctx.supabase
    .from("assets")
    .select("kind, meta")
    .eq("id", args.asset_id)
    .maybeSingle();
  if (assetRow) {
    const meta = (assetRow.meta ?? {}) as Record<string, unknown>;
    if (typeof meta.duration_ms === "number" && meta.duration_ms > 0) {
      realDurationMs = meta.duration_ms;
    }
  }

  // Use the real duration for overlap detection — never underestimate audio.
  // If the caller provided a shorter duration, keep the real one (clip would be truncated).
  let durationWarning: string | null = null;
  let desiredDuration: number;
  if (realDurationMs != null) {
    if (args.duration_ms != null && args.duration_ms >= realDurationMs) {
      desiredDuration = args.duration_ms;
    } else {
      desiredDuration = realDurationMs;
      if (args.duration_ms != null && args.duration_ms < realDurationMs) {
        durationWarning = `⚠️ The audio file is ${(realDurationMs / 1000).toFixed(1)}s long but you requested ${(args.duration_ms / 1000).toFixed(1)}s — the clip would be truncated. Using the real duration ${(realDurationMs / 1000).toFixed(1)}s instead.`;
      }
    }
  } else {
    desiredDuration = args.duration_ms ?? 3000;
  }

  // Get all existing clips on this track to detect gaps
  const { data: existing } = await ctx.supabase
    .from("timeline_clips")
    .select("start_ms,duration_ms")
    .eq("owner_id", ctx.userId)
    .eq("project_id", ctx.projectId)
    .eq("track", args.track)
    .order("start_ms", { ascending: true });

  // Compute an overlap-free start time
  let start = desiredStart;
  let overlapDetected = false;
  let overlapCount = 0;
  for (const clip of existing ?? []) {
    const clipStart = clip.start_ms ?? 0;
    const clipEnd = clipStart + (clip.duration_ms ?? 3000);
    const candidateEnd = start + desiredDuration;
    if (start < clipEnd && candidateEnd > clipStart) {
      overlapDetected = true;
      overlapCount++;
      // Overlap detected — push start to after this clip
      start = clipEnd;
    }
  }

  const { data, error } = await ctx.supabase
    .from("timeline_clips")
    .insert({
      owner_id: ctx.userId,
      project_id: ctx.projectId,
      track: args.track,
      asset_id: args.asset_id,
      start_ms: start,
      duration_ms: desiredDuration,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  const overlapWarning = overlapDetected
    ? `⚠️ WARNING: clip overlapped with ${overlapCount} existing clip(s) on track "${args.track}". Start time was automatically shifted to ${start}ms (from requested ${desiredStart}ms). Consider using the remove_from_timeline tool to clear space, or use different tracks (Audio for voiceover, Music for background, SFX for effects) to layer sounds intentionally.`
    : null;

  const warning = [durationWarning, overlapWarning].filter(Boolean).join(" ") || null;

  return { ...data, duration_ms: desiredDuration, _warning: warning };
}

export async function removeFromTimeline(ctx: DirectorCtx, clipId: string) {
  const { data, error } = await ctx.supabase
    .from("timeline_clips")
    .delete()
    .eq("id", clipId)
    .eq("owner_id", ctx.userId)
    .eq("project_id", ctx.projectId)
    .select("id")
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
    .select("id, kind, url, prompt, created_at, meta")
    .eq("owner_id", ctx.userId)
    .eq("project_id", ctx.projectId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);
  return data;
}

// -------- pending assets (user-assisted generation) ----------
type PendingRow = {
  id: string;
  project_id: string;
  kind: string;
  name: string;
  meta_json: string;
};

export async function createPendingAsset(
  ctx: DirectorCtx,
  kind: "image" | "video" | "audio",
  prompt: string,
) {
  const db = getDb();
  const id = uid("pend");
  const now = Date.now();
  db.prepare(
    `INSERT INTO assets (id, project_id, kind, name, mime, size_bytes, blob_hash, thumbnail_hash, meta_json, created_at, updated_at)
     VALUES (?, ?, 'pending', ?, NULL, 0, NULL, NULL, ?, ?, ?)`,
  ).run(
    id,
    ctx.projectId,
    `Pending ${kind} — ${prompt.slice(0, 40)}`,
    JSON.stringify({ pending_kind: kind, prompt, status: "pending" }),
    now,
    now,
  );
  try {
    getKernel().events.emit({ type: "AssetImported", assetId: id, projectId: ctx.projectId, kind: "pending", name: prompt.slice(0, 40), sizeBytes: 0, blobHash: null });
  } catch { /* kernel not ready */ }
  return { id, kind, prompt, status: "pending" };
}

export async function listPendingAssets(ctx: DirectorCtx) {
  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM assets WHERE project_id = ? AND kind = 'pending' ORDER BY created_at DESC")
    .all<PendingRow>(ctx.projectId);
  return rows.map((r) => {
    let meta: Record<string, unknown> = {};
    try { meta = JSON.parse(r.meta_json) as Record<string, unknown>; } catch { /* empty */ }
    return {
      id: r.id,
      kind: meta.pending_kind ?? "image",
      prompt: typeof meta.prompt === "string" ? meta.prompt : "",
      status: "pending",
    };
  });
}

/** Check whether pending assets have been fulfilled by the user. */
export async function waitForUserAssets(ctx: DirectorCtx, assetIds: string[]) {
  const db = getDb();
  const results: Array<{
    id: string;
    status: "pending" | "ready" | "missing";
    kind?: string;
    prompt?: string;
    url?: string | null;
    duration_ms?: number | null;
    supabase_id?: string | null;
  }> = [];
  for (const id of assetIds) {
    const row = db.prepare("SELECT * FROM assets WHERE id = ?").get<PendingRow & { blob_hash: string | null }>(id);
    if (!row) {
      results.push({ id, status: "missing" });
      continue;
    }
    let meta: Record<string, unknown> = {};
    try { meta = JSON.parse(row.meta_json) as Record<string, unknown>; } catch { /* empty */ }
    if (row.kind === "pending") {
      results.push({
        id,
        status: "pending",
        kind: typeof meta.pending_kind === "string" ? meta.pending_kind : undefined,
        prompt: typeof meta.prompt === "string" ? meta.prompt : undefined,
      });
      continue;
    }
    // Fulfilled: the local row keeps the pending id; meta holds the Supabase id.
    const supabaseId = typeof meta.supabase_id === "string" ? meta.supabase_id : null;
    let url: string | null = null;
    let durationMs: number | null = null;
    if (supabaseId) {
      const { data: sbRow } = await ctx.supabase
        .from("assets")
        .select("id, url, meta")
        .eq("id", supabaseId)
        .maybeSingle();
      if (sbRow) {
        url = sbRow.url;
        const sbMeta = (sbRow.meta ?? {}) as Record<string, unknown>;
        if (typeof sbMeta.duration_ms === "number") durationMs = sbMeta.duration_ms;
      }
    }
    results.push({ id, status: "ready", kind: row.kind, url, duration_ms: durationMs, supabase_id: supabaseId });
  }
  return results;
}