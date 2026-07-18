import { generateText } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getStorage } from "@/kernel/storage";
import { getDb } from "@/kernel/db";
import { getKernel } from "@/kernel";

const HTML_SYSTEM =
  "You are generating a SINGLE fullscreen HTML element to be embedded as a 1920x1080 video frame.\n" +
  "Return ONE root element (e.g. <div>, <section>) with inline styles. " +
  "Use vw/vh/% units (NEVER px for layout). " +
  "display:flex; align-items:center; justify-content:center. " +
  "Solid color or gradient background. " +
  "Bold cinematic typography.\n" +
  "Do NOT output <html>, <head>, <body>, <script>, or <style> tags. " +
  "Do NOT output markdown, code fences, or commentary. Just the root element.";

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
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .trim();
  return `<div style="position:fixed;inset:0;width:100vw;height:100vh;overflow:hidden;background:#000;display:flex;align-items:center;justify-content:center;color:#fff;">${cleaned}</div>`;
}

export async function generateHtmlCard(
  ctx: { supabase: SupabaseClient; userId: string; projectId: string },
  model: Parameters<typeof generateText>[0]["model"],
  brief: string,
) {
  const { text } = await generateText({
    model,
    system: HTML_SYSTEM,
    prompt: brief,
  });

  const wrapped = wrapFullscreen(text);
  const bytes = new TextEncoder().encode(wrapped);

  // Store in Supabase (timeline / MCP)
  const storedUrl = await uploadBinaryAsset(ctx.supabase, ctx.userId, ctx.projectId, bytes, "text/html", "html");
  const supabaseRow = await insertAsset(ctx.supabase, ctx.userId, ctx.projectId, {
    kind: "html",
    mime: "text/html",
    url: storedUrl,
    prompt: brief,
  });

  // Also store in local kernel (Library / CenterView)
  try {
    const storage = getStorage();
    const db = getDb();
    const ref = await storage.put(bytes);
    const id = uid("dir_html");
    const now = Date.now();
    db.prepare(
      `INSERT INTO assets (id, project_id, kind, name, mime, size_bytes, blob_hash, meta_json, created_at, updated_at)
       VALUES (?, ?, 'html', ?, 'text/html', ?, ?, '{}', ?, ?)`,
    ).run(id, ctx.projectId, `Director HTML Card — ${brief.slice(0, 40)}`, ref.size, ref.hash, now, now);
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

  return supabaseRow;
}
