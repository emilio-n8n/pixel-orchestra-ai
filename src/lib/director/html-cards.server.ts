import { generateText } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getStorage } from "@/kernel/storage";
import { getDb } from "@/kernel/db";
import { getKernel } from "@/kernel";

const HTML_SYSTEM =
  "You are generating a SINGLE fullscreen animated HTML element to be embedded as a 1920x1080 video frame.\n" +
  "Return ONE root element (e.g. <div>, <section>) with inline styles. " +
  "Include a <style> tag INSIDE the root element defining all your @keyframes. " +
  "Use vw/vh/% units (NEVER px for layout). " +
  "display:flex; align-items:center; justify-content:center. " +
  "Bold cinematic typography, solid color or gradient background.\n" +
  "THE CARD MUST BE ANIMATED — this is motion graphics, not a static image:\n" +
  "- A strong ENTRANCE animation (fadeIn + slideUp / zoomIn / letterSpacing / typewriter) with animation-fill-mode: forwards.\n" +
  "- Continuous AMBIENT motion so the card never freezes (slow gradient shift, floating, pulsing glow, subtle ken-burns zoom, shimmer).\n" +
  "- Define every animation with @keyframes in the <style> tag; use the animation shorthand with explicit durations (1.5s-4s) and ease/ease-out timing.\n" +
  "- Animate transform and opacity only (cheap); add will-change: transform,opacity to animated elements.\n" +
  "Do NOT output <html>, <head>, <body>, or <script> tags. " +
  "Do NOT output markdown, code fences, or commentary. Just the root element (with its inner <style>).";

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
    .select("id, kind, url, mime, prompt, created_at")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

function uid(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
}

function wrapFullscreen(html: string): string {
  let cleaned = html
    .replace(/^```html\s*/i, "")
    .replace(/```\s*$/i, "")
    .replace(/<!DOCTYPE[^>]*>/gi, "")
    .replace(/<\/?html[^>]*>/gi, "")
    .replace(/<head[^>]*>[\s\S]*?<\/head>/gi, "")
    .replace(/<\/?body[^>]*>/gi, "")
    // <style> is allowed (CSS keyframes drive the animations); scripts are not.
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .trim();
  return `<div style="position:fixed;inset:0;width:100vw;height:100vh;overflow:hidden;background:#000;display:flex;align-items:center;justify-content:center;color:#fff;">${cleaned}</div>`;
}

export async function generateHtmlCard(
  ctx: { supabase: SupabaseClient; userId: string; projectId: string },
  model: Parameters<typeof generateText>[0]["model"],
  brief: string,
) {
  // Mirror the director's job/provenance recording for this generation.
  const loose = ctx.supabase as unknown as SupabaseClient<any>;
  let jobId: string | null = null;
  try {
    const { data } = await loose
      .from("director_jobs")
      .insert({ owner_id: ctx.userId, project_id: ctx.projectId, kind: "generate_html_card", status: "queued", prompt: brief })
      .select("id")
      .single();
    jobId = data?.id ?? null;
  } catch { /* best-effort */ }

  try {
    const { text } = await generateText({
      model,
      system: HTML_SYSTEM,
      prompt: brief,
    });

    const wrapped = wrapFullscreen(text);
    const bytes = new TextEncoder().encode(wrapped);

    // Store in Supabase (timeline / MCP)
    const { url: storedUrl, storagePath } = await uploadBinaryAsset(ctx.supabase, ctx.userId, ctx.projectId, bytes, "text/html", "html");
    const supabaseRow = await insertAsset(ctx.supabase, ctx.userId, ctx.projectId, {
      kind: "html",
      mime: "text/html",
      url: storedUrl,
      prompt: brief,
      meta: { storage_path: storagePath },
    });
    try {
      await loose.from("asset_provenance").insert({
        owner_id: ctx.userId,
        project_id: ctx.projectId,
        asset_id: supabaseRow.id,
        tool: "director.generate_html_card",
        params: { brief },
        source_asset_ids: [],
      });
    } catch { /* best-effort */ }

    // Also store in local kernel (Library / CenterView)
    try {
      const storage = getStorage();
      const db = getDb();
      const ref = await storage.put(bytes);
      const id = uid("dir_html");
      const now = Date.now();
      db.prepare(
        `INSERT INTO assets (id, project_id, kind, name, mime, size_bytes, blob_hash, meta_json, created_at, updated_at)
         VALUES (?, ?, 'html', ?, 'text/html', ?, ?, ?, ?, ?)`,
      ).run(id, ctx.projectId, `Director HTML Card — ${brief.slice(0, 40)}`, ref.size, ref.hash, JSON.stringify({ storage_path: storagePath, supabase_id: supabaseRow.id }), now, now);
      try {
        getKernel().events.emit({
          type: "AssetImported",
          assetId: id,
          projectId: ctx.projectId,
          kind: "html",
          name: `Director HTML Card — ${brief.slice(0, 40)}`,
          sizeBytes: ref.size,
          blobHash: ref.hash,
        });
      } catch { /* kernel not ready */ }
    } catch { /* local kernel not available */ }

    try {
      if (jobId) await loose.from("director_jobs").update({ status: "completed", finished_at: new Date().toISOString() }).eq("id", jobId);
    } catch { /* best-effort */ }
    return supabaseRow;
  } catch (e) {
    try {
      if (jobId) await loose.from("director_jobs").update({ status: "failed", error: (e as Error).message ?? String(e), finished_at: new Date().toISOString() }).eq("id", jobId);
    } catch { /* best-effort */ }
    throw e;
  }
}
