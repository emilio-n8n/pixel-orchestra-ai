// Server-only Director tool handlers. Shared by /api/director (AI SDK tools)
// and the MCP server. Every handler takes an authenticated Supabase client
// bound to a specific user and their project id.

import type { SupabaseClient } from "@supabase/supabase-js";
import { getStorage } from "@/kernel/storage";
import { getDb } from "@/kernel/db";
import { getKernel } from "@/kernel";
import { measureMp3DurationMs } from "./audio-duration";
import { computeDuckingCurve } from "./ducking";
import {
  generateImageCloudflare,
  generateImageLovable,
  transcribeAudioGroq,
  type ModelCreds,
} from "@/lib/models/providers.server";
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
    ).run(
      id,
      projectId,
      kind,
      name,
      mime ?? "application/octet-stream",
      ref.size,
      ref.hash,
      JSON.stringify(meta ?? {}),
      now,
      now,
    );
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
    } catch {
      /* kernel not ready */
    }
  } catch {
    /* local kernel not available */
  }
}

const LOVABLE_AI_URL = "https://ai.gateway.lovable.dev/v1";

function requireKey() {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("Clé Lovable non configurée (LOVABLE_API_KEY manquante)");
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
  if (error) throw new Error(`Envoi du média impossible — ${error.message}`);
  const { data, error: signErr } = await supabase.storage
    .from("assets")
    .createSignedUrl(filename, 60 * 60 * 24 * 365);
  if (signErr || !data?.signedUrl) {
    console.warn(
      `[director] createSignedUrl failed (${signErr?.message ?? "empty"}) — storing raw filename, timeline will skip it`,
    );
  }
  return { url: data?.signedUrl ?? filename, storagePath: filename };
}

async function insertAsset(
  supabase: SupabaseClient,
  userId: string,
  projectId: string,
  row: {
    kind: string;
    mime: string | null;
    url: string;
    prompt: string | null;
    meta?: Record<string, unknown>;
  },
) {
  const { data, error } = await supabase
    .from("assets")
    .insert({ owner_id: userId, project_id: projectId, ...row, meta: row.meta ?? {} })
    .select("id, kind, url, mime, prompt, created_at, meta")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

// -------- jobs + provenance (agent operations) ----------
// director_jobs / asset_provenance aren't in the generated Database type yet —
// cast to a loosely-typed client for those tables.
function looseSupabase(ctx: DirectorCtx) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ctx.supabase as unknown as SupabaseClient<any>;
}

/**
 * Record an agent operation as a job (queued → running → completed/failed)
 * and run it. Best-effort: a job recording failure never blocks the tool.
 */
async function recordJob(
  ctx: DirectorCtx,
  kind: string,
  prompt: string | null,
  run: () => Promise<unknown>,
) {
  const sb = looseSupabase(ctx);
  let jobId: string | null = null;
  try {
    const { data } = await sb
      .from("director_jobs")
      .insert({ owner_id: ctx.userId, project_id: ctx.projectId, kind, status: "queued", prompt })
      .select("id")
      .single();
    jobId = data?.id ?? null;
  } catch (error) {
    console.error("[director] failed to create job", error);
  }
  try {
    if (jobId) await sb.from("director_jobs").update({ status: "running" }).eq("id", jobId);
  } catch (error) {
    console.error("[director] failed to mark job running", error);
  }
  try {
    const result = await run();
    try {
      if (jobId) {
        await sb
          .from("director_jobs")
          .update({ status: "completed", result, finished_at: new Date().toISOString() })
          .eq("id", jobId);
      }
    } catch (error) {
      console.error("[director] failed to complete job", error);
    }
    return result;
  } catch (e) {
    try {
      if (jobId) {
        await sb
          .from("director_jobs")
          .update({
            status: "failed",
            error: (e as Error).message ?? String(e),
            finished_at: new Date().toISOString(),
          })
          .eq("id", jobId);
      }
    } catch (jobError) {
      console.error("[director] failed to mark job failed", jobError);
    }
    throw e;
  }
}

/** Link an agent-generated asset to its provenance (tool, params, sources). */
async function recordProvenance(
  ctx: DirectorCtx,
  assetId: string,
  tool: string,
  params: Record<string, unknown> = {},
  sourceAssetIds: string[] = [],
) {
  try {
    await looseSupabase(ctx).from("asset_provenance").insert({
      owner_id: ctx.userId,
      project_id: ctx.projectId,
      asset_id: assetId,
      tool,
      params,
      source_asset_ids: sourceAssetIds,
    });
  } catch {
    /* best-effort */
  }
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
export async function generateImage(ctx: DirectorCtx, prompt: string, modelId?: string) {
  return recordJob(ctx, "generate_image", prompt, async () => {
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
    const { url: storedUrl, storagePath } = await uploadBinaryAsset(
      ctx.supabase,
      ctx.userId,
      ctx.projectId,
      bytes,
      mime,
      ext,
    );
    const row = await insertAsset(ctx.supabase, ctx.userId, ctx.projectId, {
      kind: "image",
      mime,
      url: storedUrl,
      prompt,
      meta: { storage_path: storagePath },
    });
    recordProvenance(ctx, row.id, "director.generate_image", {
      prompt,
      model_id: modelId ?? null,
      provider: cfModel ? "cloudflare" : "lovable",
    });
    storeInLocalKernel(
      ctx.projectId,
      "image",
      `Director Image — ${prompt.slice(0, 40)}`,
      mime,
      bytes,
      prompt,
      { storage_path: storagePath, supabase_id: row.id },
    );
    return row;
  });
}

// -------- tts / voice ----------
async function generateVoiceInner(
  ctx: DirectorCtx,
  text: string,
  voice: string = "alloy",
  opts: { takeGroup?: string; takeIndex?: number } = {},
) {
  const { takeGroup, takeIndex } = opts;
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
  if (!res.ok) {
    const body = (await res.text()).slice(0, 500);
    throw new Error(`Lovable (voix) a répondu HTTP ${res.status} — ${body}`);
  }
  const bytes = new Uint8Array(await res.arrayBuffer());
  const durationMs = measureMp3DurationMs(bytes);
  const meta: Record<string, unknown> = { voice, duration_ms: durationMs };
  if (takeGroup) meta.take_group = takeGroup;
  if (takeIndex != null) meta.take_index = takeIndex;
  meta.name = takeIndex != null ? `Director Take ${takeIndex + 1} — ${text.slice(0, 24)}` : null;
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
  recordProvenance(
    ctx,
    row.id,
    takeIndex != null ? "director.generate_voice_take" : "director.generate_voice",
    { text, voice, take_index: takeIndex ?? null, take_group: takeGroup ?? null },
  );
  const localMeta: Record<string, unknown> = {
    ...meta,
    storage_path: storagePath,
    supabase_id: row.id,
  };
  delete localMeta.name;
  storeInLocalKernel(
    ctx.projectId,
    "audio",
    `Director Voice — ${text.slice(0, 40)}`,
    "audio/mpeg",
    bytes,
    text,
    localMeta,
  );
  return row;
}

export async function generateVoice(ctx: DirectorCtx, text: string, voice: string = "alloy") {
  return recordJob(ctx, "generate_voice", text, () => generateVoiceInner(ctx, text, voice));
}

/**
 * Generate n variations (takes) of the same line. All takes share a
 * take_group id and carry take_index 0..n-1 — the Library/Inspector groups
 * them so the user can A/B them and swap the chosen one onto the clip.
 */
export async function generateVoiceTakes(
  ctx: DirectorCtx,
  text: string,
  voice: string = "alloy",
  n: number = 3,
) {
  return recordJob(ctx, "generate_voice_takes", text, async () => {
    const count = Math.max(1, Math.min(5, Math.floor(n)));
    const takeGroup = `takes_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const takes = [];
    for (let i = 0; i < count; i++) {
      takes.push(await generateVoiceInner(ctx, text, voice, { takeGroup, takeIndex: i }));
    }
    return {
      text,
      voice,
      take_group: takeGroup,
      takes: takes.map((t) => ({
        id: t.id,
        take_index: t.meta?.take_index ?? 0,
        duration_ms: t.meta?.duration_ms ?? null,
        url: t.url,
      })),
    };
  });
}

// -------- subtitles / transcription (Groq whisper) ----------
/**
 * Transcribe an audio asset with Groq (whisper-large-v3) and place the
 * result as a Subtitles clip on the timeline, sized to the real audio
 * duration. Returns the transcript + the created asset + clip.
 */
export async function transcribeAudio(ctx: DirectorCtx, assetId: string) {
  return recordJob(ctx, "generate_subtitles", null, async () => {
    const groqApiKey = ctx.creds?.groqApiKey;
    if (!groqApiKey) throw new Error("Clé Groq non configurée (Réglages de l’Assistant → Groq)");

    const { data: asset, error: assetErr } = await ctx.supabase
      .from("assets")
      .select("id, kind, mime, url, meta")
      .eq("id", assetId)
      .maybeSingle();
    if (assetErr || !asset)
      throw new Error("Média introuvable — vérifiez l’identifiant puis réessayez");
    const mime = asset.mime ?? "audio/mpeg";
    if (!asset.url || !/^https?:\/\//i.test(asset.url)) {
      throw new Error("Média sans URL signée — régénérez la voix ou réimportez le fichier");
    }
    const res = await fetch(asset.url);
    if (!res.ok) {
      const body = (await res.text()).slice(0, 500);
      throw new Error(`Téléchargement audio impossible — HTTP ${res.status} — ${body}`);
    }
    const bytes = new Uint8Array(await res.arrayBuffer());

    const { text } = await transcribeAudioGroq(bytes, mime, groqApiKey);
    if (!text)
      throw new Error("Transcription vide — l’audio est peut-être silencieux ou illisible");

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
    recordProvenance(ctx, assetRow.id, "director.generate_subtitles", { audio_asset_id: assetId }, [
      assetId,
    ]);
    storeInLocalKernel(
      ctx.projectId,
      "html",
      `Subtitles — ${text.slice(0, 40)}`,
      "text/html",
      transcriptBytes,
      text,
      { storage_path: storagePath, supabase_id: assetRow.id },
    );

    // Place on the Subtitles track with the audio's real duration.
    const meta = (asset.meta ?? {}) as Record<string, unknown>;
    const durationMs =
      typeof meta.duration_ms === "number" && meta.duration_ms > 0 ? meta.duration_ms : 3000;
    const clip = await addToTimeline(ctx, {
      asset_id: assetRow.id,
      track: "Subtitles",
      duration_ms: durationMs,
    });

    return { transcript: text, asset: assetRow, clip };
  });
}

// -------- html card (MCP only — uses LOVABLE_API_KEY) ----------
export async function generateHtmlCard(ctx: DirectorCtx, brief: string) {
  return recordJob(ctx, "generate_html_card", brief, async () => {
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
              "Return ONE complete HTML fragment (no <html> or <body>) styled inline for a 1920x1080 broadcast card. Bold typography, cinematic.\n" +
              "THE CARD MUST BE ANIMATED — motion graphics, not a static image. Include a <style> tag inside the fragment with @keyframes: a strong entrance (fadeIn + slideUp/zoomIn/letterSpacing/typewriter, animation-fill-mode: forwards) and continuous ambient motion (gradient shift, floating, pulsing glow, ken-burns). Use animation shorthand with explicit 1.5s-4s durations and ease timing; animate transform/opacity only, add will-change: transform,opacity. Use vw/vh/% units (never px for layout).\n" +
              "No <script>, no <html>, no <body>, no commentary. HTML only.",
          },
          { role: "user", content: brief },
        ],
      }),
    });
    if (!res.ok) {
      const body = (await res.text()).slice(0, 500);
      throw new Error(`Lovable (carte titre) a répondu HTTP ${res.status} — ${body}`);
    }
    const data = await res.json();
    const html: string = data?.choices?.[0]?.message?.content ?? "";
    const cleaned = html
      .replace(/^```html\n?/i, "")
      .replace(/```\s*$/i, "")
      .trim();
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
    recordProvenance(ctx, row.id, "director.generate_html_card", { brief });
    storeInLocalKernel(
      ctx.projectId,
      "html",
      `Director HTML Card — ${brief.slice(0, 40)}`,
      "text/html",
      wrappedBytes,
      brief,
      { storage_path: storagePath, supabase_id: row.id },
    );
    return row;
  });
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

/**
 * Remove a clip. With `ripple`, every later clip on the same track is shifted
 * left by the removed clip's duration (closing the gap).
 */
export async function removeFromTimeline(
  ctx: DirectorCtx,
  clipId: string,
  opts: { ripple?: boolean } = {},
) {
  const { data: existing, error: getErr } = await ctx.supabase
    .from("timeline_clips")
    .select("id, track, start_ms, duration_ms")
    .eq("id", clipId)
    .eq("owner_id", ctx.userId)
    .eq("project_id", ctx.projectId)
    .maybeSingle();
  if (getErr || !existing) throw new Error("Plan introuvable — vérifiez l’identifiant du clip");

  const { data, error } = await ctx.supabase
    .from("timeline_clips")
    .delete()
    .eq("id", clipId)
    .eq("owner_id", ctx.userId)
    .eq("project_id", ctx.projectId)
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  if (opts.ripple) {
    const removedEnd = (existing.start_ms ?? 0) + (existing.duration_ms ?? 0);
    const { data: later } = await ctx.supabase
      .from("timeline_clips")
      .select("id, start_ms")
      .eq("owner_id", ctx.userId)
      .eq("project_id", ctx.projectId)
      .eq("track", existing.track)
      .gte("start_ms", removedEnd);
    for (const c of later ?? []) {
      await ctx.supabase
        .from("timeline_clips")
        .update({ start_ms: Math.max(0, (c.start_ms ?? 0) - (existing.duration_ms ?? 0)) })
        .eq("id", c.id)
        .eq("owner_id", ctx.userId)
        .eq("project_id", ctx.projectId);
    }
  }
  return data;
}

/**
 * Insert a native silence clip on any track. No asset is involved — the clip
 * holds `meta.silence = true` and simply occupies space (and mutes audio)
 * for its duration. Overlapping clips on the same track shift it right, same
 * as add_to_timeline.
 */
export async function insertSilenceClip(
  ctx: DirectorCtx,
  args: { duration_ms: number; track: string; start_ms?: number },
) {
  return recordJob(ctx, "insert_silence_clip", `silence ${args.duration_ms}ms`, async () => {
    if (!(args.duration_ms > 0)) throw new Error("La durée doit être positive (duration_ms > 0)");
    const desiredStart = args.start_ms ?? 0;

    const { data: existing } = await ctx.supabase
      .from("timeline_clips")
      .select("start_ms, duration_ms")
      .eq("owner_id", ctx.userId)
      .eq("project_id", ctx.projectId)
      .eq("track", args.track)
      .order("start_ms", { ascending: true });

    let start = desiredStart;
    let overlapDetected = false;
    for (const clip of existing ?? []) {
      const clipEnd = (clip.start_ms ?? 0) + (clip.duration_ms ?? 3000);
      if (start < clipEnd && start + args.duration_ms > clip.start_ms) {
        overlapDetected = true;
        start = clipEnd;
      }
    }

    const { data, error } = await ctx.supabase
      .from("timeline_clips")
      .insert({
        owner_id: ctx.userId,
        project_id: ctx.projectId,
        track: args.track,
        asset_id: null,
        start_ms: start,
        duration_ms: args.duration_ms,
        meta: {
          silence: true,
          prompt: `Silence — ${(args.duration_ms / 1000).toFixed(1)}s`,
        },
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    const warning = overlapDetected
      ? `⚠️ overlap detected on "${args.track}" — silence shifted to ${start}ms (from ${desiredStart}ms).`
      : null;
    return { ...data, _warning: warning };
  });
}

/**
 * Automatic ducking: while the source track (voice) plays, the target track
 * (music) drops to `attenuation_db` with a smooth attack/release. The gain
 * curve is computed server-side and stored on every target clip
 * (meta.ducking) — preview and export both honour it.
 */
export async function applyDucking(
  ctx: DirectorCtx,
  args: {
    source_track?: string;
    target_track?: string;
    attenuation_db?: number;
    attack_ms?: number;
    release_ms?: number;
  },
) {
  return recordJob(
    ctx,
    "apply_ducking",
    `duck ${args.target_track ?? "Music"} under ${args.source_track ?? "Audio"}`,
    async () => {
      const sourceTrack = args.source_track ?? "Audio";
      const targetTrack = args.target_track ?? "Music";
      const attenuationDb = args.attenuation_db ?? -12;
      const attackMs = args.attack_ms ?? 200;
      const releaseMs = args.release_ms ?? 400;
      if (attenuationDb > 0 || attenuationDb < -40) {
        throw new Error("L’atténuation doit être entre −40 et 0 dB");
      }

      const { data: all } = await ctx.supabase
        .from("timeline_clips")
        .select("id, track, start_ms, duration_ms, meta")
        .eq("owner_id", ctx.userId)
        .eq("project_id", ctx.projectId);

      const sourceClips = (all ?? []).filter((c) => c.track === sourceTrack);
      const targetClips = (all ?? []).filter((c) => c.track === targetTrack);
      if (targetClips.length === 0) {
        throw new Error(`Aucun plan sur la piste cible « ${targetTrack} » — rien à atténuer`);
      }
      const totalMs = (all ?? []).reduce(
        (m, c) => Math.max(m, (c.start_ms ?? 0) + (c.duration_ms ?? 0)),
        10000,
      );

      const curve = computeDuckingCurve({
        sourceIntervals: sourceClips.map((c) => ({
          start_ms: c.start_ms ?? 0,
          end_ms: (c.start_ms ?? 0) + (c.duration_ms ?? 3000),
        })),
        totalMs,
        attenuationDb,
        attackMs,
        releaseMs,
      });

      const ducking = {
        source_track: sourceTrack,
        attenuation_db: attenuationDb,
        attack_ms: attackMs,
        release_ms: releaseMs,
        curve,
      };
      const updated: string[] = [];
      for (const c of targetClips) {
        const { data: fresh } = await ctx.supabase
          .from("timeline_clips")
          .select("meta")
          .eq("id", c.id)
          .maybeSingle();
        const meta = {
          ...((fresh?.meta ?? {}) as Record<string, unknown>),
          ducking,
        };
        const { error } = await ctx.supabase
          .from("timeline_clips")
          .update({ meta })
          .eq("id", c.id)
          .eq("owner_id", ctx.userId)
          .eq("project_id", ctx.projectId);
        if (!error) updated.push(c.id);
      }

      return {
        source_track: sourceTrack,
        target_track: targetTrack,
        attenuation_db: attenuationDb,
        attack_ms: attackMs,
        release_ms: releaseMs,
        curve_points: curve.length,
        target_clips: updated,
      };
    },
  );
}

/**
 * Crossfade two clips on the same track: clip B is pulled to overlap the
 * tail of clip A by `ms`. For video clips this becomes a dissolve (the
 * renderer blends both while they overlap); for audio it becomes a volume
 * cross-fade via fade_out_ms/fade_in_ms. Single-clip fades to/from black
 * (video) or volume fades (audio) are done with update_timeline_clip's
 * fade_in_ms/fade_out_ms.
 */
export async function setClipTransitions(
  ctx: DirectorCtx,
  args: { clip_a_id: string; clip_b_id: string; ms: number },
) {
  return recordJob(ctx, "set_clip_transitions", `crossfade ${args.ms}ms`, async () => {
    const ms = Math.max(50, Math.floor(args.ms));
    const { data: a, error: aErr } = await ctx.supabase
      .from("timeline_clips")
      .select("id, track, start_ms, duration_ms, meta")
      .eq("id", args.clip_a_id)
      .eq("owner_id", ctx.userId)
      .eq("project_id", ctx.projectId)
      .maybeSingle();
    if (aErr || !a) throw new Error("Plan A introuvable — vérifiez son identifiant");
    const { data: b, error: bErr } = await ctx.supabase
      .from("timeline_clips")
      .select("id, track, start_ms, duration_ms, meta")
      .eq("id", args.clip_b_id)
      .eq("owner_id", ctx.userId)
      .eq("project_id", ctx.projectId)
      .maybeSingle();
    if (bErr || !b) throw new Error("Plan B introuvable — vérifiez son identifiant");
    if (a.track !== b.track) throw new Error("La transition exige deux plans sur la même piste");

    const newStart = (a.start_ms ?? 0) + (a.duration_ms ?? 0) - ms;
    if (newStart < 0)
      throw new Error(
        "Transition plus longue que le plan A — réduisez la durée ou déplacez les plans",
      );

    const isVideo = a.track === "Video";
    const aMeta = { ...((a.meta ?? {}) as Record<string, unknown>) };
    const bMeta = { ...((b.meta ?? {}) as Record<string, unknown>) };
    if (isVideo) {
      aMeta.transition_out_ms = ms;
      bMeta.transition_in_ms = ms;
    } else {
      aMeta.fade_out_ms = ms;
      bMeta.fade_in_ms = ms;
    }

    const { error: ua } = await ctx.supabase
      .from("timeline_clips")
      .update({ meta: aMeta })
      .eq("id", a.id)
      .eq("owner_id", ctx.userId)
      .eq("project_id", ctx.projectId);
    if (ua) throw new Error(ua.message);
    const { error: ub } = await ctx.supabase
      .from("timeline_clips")
      .update({ start_ms: newStart, meta: bMeta })
      .eq("id", b.id)
      .eq("owner_id", ctx.userId)
      .eq("project_id", ctx.projectId);
    if (ub) throw new Error(ub.message);

    return {
      clip_a_id: a.id,
      clip_b_id: b.id,
      ms,
      track: a.track,
      kind: isVideo ? "dissolve" : "audio crossfade",
      clip_b_start_ms: newStart,
    };
  });
}

/**
 * Edit a subtitle clip: replace its text and/or its style
 * (font, size px, color, position: bottom|center|top). Stored in the
 * clip's meta — the timeline renders it from there.
 */
export async function editSubtitles(
  ctx: DirectorCtx,
  clipId: string,
  text: string,
  style?: { font?: string; size?: number; color?: string; position?: "bottom" | "center" | "top" },
) {
  const { data: existing, error: getErr } = await ctx.supabase
    .from("timeline_clips")
    .select("id, meta")
    .eq("id", clipId)
    .eq("owner_id", ctx.userId)
    .eq("project_id", ctx.projectId)
    .maybeSingle();
  if (getErr || !existing) throw new Error("Plan introuvable — vérifiez l’identifiant du clip");

  const meta: Record<string, unknown> = {
    ...((existing.meta ?? {}) as Record<string, unknown>),
    text,
  };
  if (style) meta.style = style;
  const { data, error } = await ctx.supabase
    .from("timeline_clips")
    .update({ meta })
    .eq("id", clipId)
    .eq("owner_id", ctx.userId)
    .eq("project_id", ctx.projectId)
    .select("id, track, start_ms, duration_ms, meta")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

/**
 * Edit an existing clip: shift it (start_ms), resize it (duration_ms), move
 * it to another track, or apply volume fades (fade_in_ms / fade_out_ms,
 * stored in meta and honoured by the preview + export). Returns a _warning
 * when the new position overlaps another clip on the track.
 */
export async function updateTimelineClip(
  ctx: DirectorCtx,
  args: {
    clip_id: string;
    start_ms?: number;
    duration_ms?: number;
    track?: string;
    fade_in_ms?: number;
    fade_out_ms?: number;
  },
) {
  const { data: existing, error: getErr } = await ctx.supabase
    .from("timeline_clips")
    .select("id, track, start_ms, duration_ms, meta")
    .eq("id", args.clip_id)
    .eq("owner_id", ctx.userId)
    .eq("project_id", ctx.projectId)
    .maybeSingle();
  if (getErr || !existing) throw new Error("Plan introuvable — vérifiez l’identifiant du clip");

  const patch: Record<string, unknown> = {};
  if (args.start_ms != null) patch.start_ms = args.start_ms;
  if (args.duration_ms != null) patch.duration_ms = args.duration_ms;
  if (args.track != null) patch.track = args.track;
  const meta = (existing.meta ?? {}) as Record<string, unknown>;
  if (args.fade_in_ms != null) meta.fade_in_ms = args.fade_in_ms;
  if (args.fade_out_ms != null) meta.fade_out_ms = args.fade_out_ms;
  patch.meta = meta;

  const { data, error } = await ctx.supabase
    .from("timeline_clips")
    .update(patch)
    .eq("id", args.clip_id)
    .eq("owner_id", ctx.userId)
    .select("id, track, start_ms, duration_ms, asset_id, meta")
    .single();
  if (error) throw new Error(error.message);

  const track = args.track ?? existing.track;
  const start = args.start_ms ?? existing.start_ms;
  const duration = args.duration_ms ?? existing.duration_ms;
  let overlapWarning: string | null = null;
  const { data: others } = await ctx.supabase
    .from("timeline_clips")
    .select("start_ms, duration_ms")
    .eq("owner_id", ctx.userId)
    .eq("project_id", ctx.projectId)
    .eq("track", track)
    .neq("id", args.clip_id);
  for (const o of others ?? []) {
    const oStart = o.start_ms ?? 0;
    const oEnd = oStart + (o.duration_ms ?? 3000);
    const cEnd = start + duration;
    if (start < oEnd && cEnd > oStart) {
      overlapWarning = `⚠️ this clip now overlaps another clip on "${track}" (start ${start}ms → end ${cEnd}ms). Move or trim one of them to keep the mix clean.`;
      break;
    }
  }
  return { ...data, _warning: overlapWarning };
}

/**
 * Swap the asset of an existing clip in place (keeps its position). If the
 * new asset is audio with a known real duration, the clip is resized to it.
 */
export async function replaceClipAsset(ctx: DirectorCtx, clipId: string, newAssetId: string) {
  const { data: asset, error: assetErr } = await ctx.supabase
    .from("assets")
    .select("id, kind, meta")
    .eq("id", newAssetId)
    .eq("owner_id", ctx.userId)
    .maybeSingle();
  if (assetErr || !asset) throw new Error("Média introuvable — vérifiez son identifiant");

  const patch: Record<string, unknown> = { asset_id: newAssetId };
  const meta = (asset.meta ?? {}) as Record<string, unknown>;
  if (asset.kind === "audio" && typeof meta.duration_ms === "number" && meta.duration_ms > 0) {
    patch.duration_ms = meta.duration_ms;
  }
  const { data, error } = await ctx.supabase
    .from("timeline_clips")
    .update(patch)
    .eq("id", clipId)
    .eq("owner_id", ctx.userId)
    .eq("project_id", ctx.projectId)
    .select("id, track, start_ms, duration_ms, asset_id")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

/**
 * Lineage of an agent-generated asset (Supabase asset_provenance): its own
 * provenance row (tool + params), its parents (source assets) and its
 * descendants (assets that used it as a source).
 */
export async function getLineage(ctx: DirectorCtx, assetId: string) {
  const sb = looseSupabase(ctx);
  const { data: prov, error: provErr } = await sb
    .from("asset_provenance")
    .select("*")
    .eq("asset_id", assetId)
    .eq("owner_id", ctx.userId)
    .maybeSingle();
  if (provErr) throw new Error(provErr.message);
  if (!prov) return { asset_id: assetId, provenance: null, parents: [], descendants: [] };

  const parents = (prov.source_asset_ids ?? []) as string[];
  let parentDetails: Array<{ id: string; kind: string; prompt: string | null }> = [];
  if (parents.length > 0) {
    const { data: pd } = await ctx.supabase
      .from("assets")
      .select("id, kind, prompt")
      .in("id", parents)
      .eq("owner_id", ctx.userId);
    parentDetails = pd ?? [];
  }
  const { data: children } = await sb
    .from("asset_provenance")
    .select("asset_id, tool")
    .eq("owner_id", ctx.userId)
    .contains("source_asset_ids", [assetId]);

  return {
    asset_id: assetId,
    provenance: { tool: prov.tool, params: prov.params, created_at: prov.created_at },
    parents: parentDetails,
    descendants: (children ?? []).map((c: { asset_id: string; tool: string }) => ({
      asset_id: c.asset_id,
      tool: c.tool,
    })),
  };
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
  return recordJob(ctx, `pending_${kind}`, prompt, async () => {
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
      getKernel().events.emit({
        type: "AssetImported",
        assetId: id,
        projectId: ctx.projectId,
        kind: "pending",
        name: prompt.slice(0, 40),
        sizeBytes: 0,
        blobHash: null,
      });
    } catch {
      /* kernel not ready */
    }
    return { id, kind, prompt, status: "pending" };
  });
}

export async function listPendingAssets(ctx: DirectorCtx) {
  const db = getDb();
  const rows = db
    .prepare(
      "SELECT * FROM assets WHERE project_id = ? AND kind = 'pending' ORDER BY created_at DESC",
    )
    .all<PendingRow>(ctx.projectId);
  return rows.map((r) => {
    let meta: Record<string, unknown> = {};
    try {
      meta = JSON.parse(r.meta_json) as Record<string, unknown>;
    } catch {
      /* empty */
    }
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
    const row = db
      .prepare("SELECT * FROM assets WHERE id = ?")
      .get<PendingRow & { blob_hash: string | null }>(id);
    if (!row) {
      results.push({ id, status: "missing" });
      continue;
    }
    let meta: Record<string, unknown> = {};
    try {
      meta = JSON.parse(row.meta_json) as Record<string, unknown>;
    } catch {
      /* empty */
    }
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
    results.push({
      id,
      status: "ready",
      kind: row.kind,
      url,
      duration_ms: durationMs,
      supabase_id: supabaseId,
    });
  }
  return results;
}
