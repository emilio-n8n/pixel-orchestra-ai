import { generateText } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getStorage } from "@/kernel/storage";
import { getDb } from "@/kernel/db";
import { getKernel } from "@/kernel";

const HTML_SYSTEM =
  "Return ONE complete HTML fragment (no <html> or <body>) styled inline for a 1920x1080 broadcast card. Bold typography, cinematic. No commentary, HTML only.";

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

  const cleaned = text.replace(/^```html\n?/i, "").replace(/```\s*$/i, "").trim();
  const bytes = new TextEncoder().encode(cleaned);

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
