// Server-side functions for the library panel. Backed by the kernel's
// DB + blob storage. Called from the client via TanStack Start's
// createServerFn, which serializes args + result over the wire.
//
// Assets are dual-write: the kernel SQLite DB is the Library's source of
// truth, and every import/fulfill/replace is also mirrored to Supabase
// (storage + row) so the Director agent and the timeline can use them.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getDb } from "@/kernel/db";
import { getStorage } from "@/kernel/storage";
import { getKernel } from "@/kernel";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { measureMp3DurationMs } from "@/lib/director/audio-duration";
import type { AssetKind, AssetRow } from "./types";

function kindFromMime(mime: string): AssetKind {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  if (mime === "text/html" || mime === "application/xhtml+xml") return "html";
  if (mime === "application/pdf" || mime.startsWith("text/") || mime === "application/json")
    return "doc";
  return "other";
}

function uid(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
}

type RawRow = {
  id: string;
  project_id: string;
  kind: string;
  name: string;
  mime: string | null;
  size_bytes: number;
  blob_hash: string | null;
  thumbnail_hash: string | null;
  meta_json: string;
  created_at: number;
  updated_at: number;
};

function parseMeta(metaJson: string): Record<string, unknown> {
  try {
    const m = JSON.parse(metaJson) as Record<string, unknown>;
    return m ?? {};
  } catch {
    return {};
  }
}

function rowToAsset(r: RawRow): AssetRow {
  const meta = parseMeta(r.meta_json);
  const base: AssetRow = {
    id: r.id,
    projectId: r.project_id,
    kind: r.kind as AssetKind,
    name: r.name,
    mime: r.mime,
    sizeBytes: r.size_bytes,
    blobHash: r.blob_hash,
    thumbnailHash: r.thumbnail_hash,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    meta: meta as AssetRow["meta"],
  };
  if (r.kind === "pending") {
    base.status = "pending";
    base.pendingKind = (meta.pending_kind as AssetKind) ?? "image";
    base.prompt = typeof meta.prompt === "string" ? meta.prompt : "";
  } else {
    base.status = "ready";
    if (typeof meta.supabase_id === "string") base.supabaseId = meta.supabase_id;
  }
  return base;
}

function cloudRowToAsset(r: {
  id: string;
  project_id: string;
  kind: string;
  mime: string | null;
  url: string;
  prompt: string | null;
  meta: unknown;
  created_at: string;
}): AssetRow {
  const meta = (r.meta && typeof r.meta === "object" ? r.meta : {}) as Record<string, unknown>;
  const createdAt = Date.parse(r.created_at);
  return {
    id: r.id,
    projectId: r.project_id,
    kind: r.kind as AssetKind,
    name:
      (typeof meta.name === "string" && meta.name) ||
      r.prompt ||
      `${r.kind} asset`,
    mime: r.mime,
    sizeBytes: typeof meta.size_bytes === "number" ? meta.size_bytes : 0,
    blobHash: null,
    thumbnailHash: null,
    createdAt: Number.isFinite(createdAt) ? createdAt : Date.now(),
    updatedAt: Number.isFinite(createdAt) ? createdAt : Date.now(),
    status: "ready",
    supabaseId: r.id,
    url: r.url,
    meta: r.meta as AssetRow["meta"],
  };
}

/** Upload bytes to Supabase storage + insert a row. Returns the row id + url. */
async function syncToSupabase(
  supabase: SupabaseClient,
  userId: string,
  projectId: string,
  kind: string,
  mime: string,
  bytes: Uint8Array,
  prompt: string | null,
  extraMeta?: Record<string, unknown>,
): Promise<{ id: string; url: string; storagePath: string }> {
  const ext = mime.split("/")[1] ?? "bin";
  const filename = `${userId}/${projectId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from("assets").upload(filename, bytes, {
    contentType: mime,
    upsert: false,
  });
  if (error) throw new Error(`storage upload failed: ${error.message}`);
  const { data: urlData, error: signErr } = await supabase.storage
    .from("assets")
    .createSignedUrl(filename, 60 * 60 * 24 * 365);
  if (signErr || !urlData?.signedUrl) {
    console.warn(`[library] createSignedUrl failed (${signErr?.message ?? "empty"}) — storing raw filename`);
  }
  const url = urlData?.signedUrl ?? filename;
  const { data, error: rowErr } = await supabase
    .from("assets")
    .insert({
      owner_id: userId,
      project_id: projectId,
      kind,
      mime,
      url,
      prompt,
      meta: { ...(extraMeta ?? {}), storage_path: filename },
    })
    .select("id")
    .single();
  if (rowErr) throw new Error(`supabase insert failed: ${rowErr.message}`);
  return { id: data.id, url, storagePath: filename };
}

function emitImported(projectId: string, id: string, kind: string, name: string, size: number, hash: string | null) {
  try {
    getKernel().events.emit({
      type: "AssetImported",
      assetId: id,
      projectId,
      kind,
      name,
      sizeBytes: size,
      blobHash: hash,
    });
  } catch {
    /* kernel not ready (tests) */
  }
}

// ---------------------------------------------------------------------------
// Import (drag & drop) — local + Supabase sync
// ---------------------------------------------------------------------------

export const importAsset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    z.object({
      projectId: z.string(),
      name: z.string().min(1),
      mime: z.string(),
      bytesBase64: z.string(),
    }),
  )
  .handler(async ({ data, context }) => {
    const db = getDb();
    const storage = getStorage();
    const bytes = Uint8Array.from(atob(data.bytesBase64), (c) => c.charCodeAt(0));
    const ref = await storage.put(bytes);
    const id = uid("ast");
    const now = Date.now();
    const kind = kindFromMime(data.mime);

    let supabaseId: string | null = null;
    let storagePath: string | null = null;
    try {
      const meta: Record<string, unknown> = { name: data.name, size_bytes: bytes.byteLength };
      const prompt = data.name;
      const sb = await syncToSupabase(
        context.supabase,
        context.userId,
        data.projectId,
        kind,
        data.mime,
        bytes,
        prompt,
        meta,
      );
      supabaseId = sb.id;
      storagePath = sb.storagePath;
    } catch (e) {
      console.warn("[library] Supabase sync failed (asset stays local):", e);
    }

    db.prepare(
      `INSERT INTO assets (id, project_id, kind, name, mime, size_bytes, blob_hash, thumbnail_hash, meta_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)`,
    ).run(
      id,
      data.projectId,
      kind,
      data.name,
      data.mime,
      ref.size,
      ref.hash,
      JSON.stringify({
        supabase_id: supabaseId,
        storage_path: storagePath,
        prompt: data.name,
      }),
      now,
      now,
    );
    const row = db.prepare("SELECT * FROM assets WHERE id = ?").get<RawRow>(id);
    if (!row) throw new Error("asset insert failed");
    const asset = rowToAsset(row);
    emitImported(data.projectId, id, kind, data.name, ref.size, ref.hash);
    return { asset };
  });

// ---------------------------------------------------------------------------
// Pending assets (user-assisted generation)
// ---------------------------------------------------------------------------

export const createPendingAsset = createServerFn({ method: "POST" })
  .validator(
    z.object({
      projectId: z.string(),
      kind: z.enum(["image", "video", "audio"]),
      prompt: z.string().min(1),
    }),
  )
  .handler(async ({ data }) => {
    const db = getDb();
    const id = uid("pend");
    const now = Date.now();
    db.prepare(
      `INSERT INTO assets (id, project_id, kind, name, mime, size_bytes, blob_hash, thumbnail_hash, meta_json, created_at, updated_at)
       VALUES (?, ?, 'pending', ?, NULL, 0, NULL, NULL, ?, ?, ?)`,
    ).run(
      id,
      data.projectId,
      `Pending ${data.kind} — ${data.prompt.slice(0, 40)}`,
      JSON.stringify({ pending_kind: data.kind, prompt: data.prompt, status: "pending" }),
      now,
      now,
    );
    emitImported(data.projectId, id, "pending", data.prompt.slice(0, 40), 0, null);
    const row = db.prepare("SELECT * FROM assets WHERE id = ?").get<RawRow>(id);
    return { asset: row ? rowToAsset(row) : null };
  });

export const fulfillPendingAsset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    z.object({
      assetId: z.string(),
      mime: z.string(),
      bytesBase64: z.string(),
    }),
  )
  .handler(async ({ data, context }) => {
    const db = getDb();
    const storage = getStorage();
    const pending = db.prepare("SELECT * FROM assets WHERE id = ? AND kind = 'pending'").get<RawRow>(data.assetId);
    if (!pending) throw new Error("pending asset not found");
    const meta = parseMeta(pending.meta_json);
    const bytes = Uint8Array.from(atob(data.bytesBase64), (c) => c.charCodeAt(0));
    const ref = await storage.put(bytes);
    const kind = kindFromMime(data.mime);
    const now = Date.now();

    // Mirror to Supabase so the Director can place it on the timeline.
    let supabaseId: string | null = null;
    let storagePath: string | null = null;
    try {
      const sb = await syncToSupabase(
        context.supabase,
        context.userId,
        pending.project_id,
        kind,
        data.mime,
        bytes,
        typeof meta.prompt === "string" ? meta.prompt : null,
        { pending_kind: meta.pending_kind },
      );
      supabaseId = sb.id;
      storagePath = sb.storagePath;
    } catch (e) {
      console.warn("[library] Supabase sync failed during fulfill:", e);
    }

    // The pending row keeps its id — kind/blob/meta are updated in place so
    // wait_for_user_assets can find it as "ready".
    db.prepare(
      `UPDATE assets SET kind = ?, name = ?, mime = ?, size_bytes = ?, blob_hash = ?, meta_json = ?, updated_at = ?
       WHERE id = ?`,
    ).run(
      kind,
      data.assetId.includes("pend") ? pending.name.replace(/^Pending \w+ — /, "") : pending.name,
      data.mime,
      ref.size,
      ref.hash,
      JSON.stringify({ ...meta, supabase_id: supabaseId, storage_path: storagePath, status: "ready" }),
      now,
      data.assetId,
    );
    const row = db.prepare("SELECT * FROM assets WHERE id = ?").get<RawRow>(data.assetId);
    const asset = row ? rowToAsset(row) : null;
    if (asset) emitImported(pending.project_id, data.assetId, kind, asset.name, ref.size, ref.hash);
    return { asset };
  });

// ---------------------------------------------------------------------------
// Replace / edit existing assets
// ---------------------------------------------------------------------------

async function applyReplaceLocalAsync(
  assetId: string,
  kind: string,
  mime: string,
  bytes: Uint8Array,
  extraMeta: Record<string, unknown>,
): Promise<RawRow | undefined> {
  const db = getDb();
  const storage = getStorage();
  const existing = db.prepare("SELECT * FROM assets WHERE id = ?").get<RawRow>(assetId);
  if (!existing) throw new Error("asset not found");
  const ref = await storage.put(bytes);
  const prevMeta = parseMeta(existing.meta_json);
  db.prepare(
    `UPDATE assets SET kind = ?, mime = ?, size_bytes = ?, blob_hash = ?, meta_json = ?, updated_at = ?
     WHERE id = ?`,
  ).run(
    kind,
    mime,
    ref.size,
    ref.hash,
    JSON.stringify({ ...prevMeta, ...extraMeta }),
    Date.now(),
    assetId,
  );
  return db.prepare("SELECT * FROM assets WHERE id = ?").get<RawRow>(assetId);
}

export const replaceAsset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    z.object({
      assetId: z.string(),
      mime: z.string(),
      bytesBase64: z.string(),
    }),
  )
  .handler(async ({ data, context }) => {
    const db = getDb();
    const existing = db.prepare("SELECT * FROM assets WHERE id = ?").get<RawRow>(data.assetId);
    if (!existing) throw new Error("asset not found");
    const prevMeta = parseMeta(existing.meta_json);
    const bytes = Uint8Array.from(atob(data.bytesBase64), (c) => c.charCodeAt(0));
    const kind = kindFromMime(data.mime);

    // Re-measure audio duration when the file changed.
    const extraMeta: Record<string, unknown> = {};
    if (kind === "audio" && (data.mime.includes("mp3") || data.mime.includes("mpeg"))) {
      const d = measureMp3DurationMs(bytes);
      if (d > 0) extraMeta.duration_ms = d;
    }

    // Mirror to Supabase: update existing row if we have its id, else create.
    try {
      const sbId = typeof prevMeta.supabase_id === "string" ? prevMeta.supabase_id : null;
      if (sbId) {
        const { error } = await context.supabase
          .from("assets")
          .update({
            mime: data.mime,
            meta: { ...prevMeta, ...extraMeta } as unknown as Record<string, never>,
          })
          .eq("id", sbId);
        if (error) throw error;
        if (typeof prevMeta.storage_path === "string") {
          await context.supabase.storage.from("assets").remove([prevMeta.storage_path]);
          const ext = data.mime.split("/")[1] ?? "bin";
          const filename = `${context.userId}/${existing.project_id}/${crypto.randomUUID()}.${ext}`;
          const { error: upErr } = await context.supabase.storage
            .from("assets")
            .upload(filename, bytes, { contentType: data.mime, upsert: false });
          if (!upErr) {
            const { data: urlData, error: signErr } = await context.supabase.storage
              .from("assets")
              .createSignedUrl(filename, 60 * 60 * 24 * 365);
            if (signErr || !urlData?.signedUrl) {
              console.warn(`[library] replace: createSignedUrl failed (${signErr?.message ?? "empty"})`);
            }
            extraMeta.storage_path = filename;
            await context.supabase.from("assets").update({ url: urlData?.signedUrl ?? filename }).eq("id", sbId);
          }
        }
      } else {
        const sb = await syncToSupabase(
          context.supabase,
          context.userId,
          existing.project_id,
          kind,
          data.mime,
          bytes,
          existing.name,
          { ...extraMeta },
        );
        extraMeta.supabase_id = sb.id;
        extraMeta.storage_path = sb.storagePath;
      }
    } catch (e) {
      console.warn("[library] Supabase replace sync failed (local updated):", e);
    }

    const row = await applyReplaceLocalAsync(data.assetId, kind, data.mime, bytes, extraMeta);
    const asset = row ? rowToAsset(row) : undefined;
    try {
      getKernel().events.emit({ type: "AssetUpdated", assetId: data.assetId });
    } catch { /* kernel not ready */ }
    return { asset };
  });

export const updateHtmlAsset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ assetId: z.string(), html: z.string() }))
  .handler(async ({ data, context }) => {
    const db = getDb();
    const existing = db.prepare("SELECT * FROM assets WHERE id = ?").get<RawRow>(data.assetId);
    if (!existing) throw new Error("asset not found");
    const prevMeta = parseMeta(existing.meta_json);
    const bytes = new TextEncoder().encode(data.html);

    try {
      const sbId = typeof prevMeta.supabase_id === "string" ? prevMeta.supabase_id : null;
      if (sbId && typeof prevMeta.storage_path === "string") {
        await context.supabase.storage.from("assets").update(prevMeta.storage_path, bytes, {
          contentType: "text/html",
        });
        await context.supabase.from("assets").update({ prompt: data.html.slice(0, 200) }).eq("id", sbId);
      }
    } catch (e) {
      console.warn("[library] Supabase html update failed (local updated):", e);
    }

    const row = await applyReplaceLocalAsync(data.assetId, "html", "text/html", bytes, {
      ...prevMeta,
    });
    const asset = row ? rowToAsset(row) : undefined;
    try {
      getKernel().events.emit({ type: "AssetUpdated", assetId: data.assetId });
    } catch { /* kernel not ready */ }
    return { asset };
  });

// ---------------------------------------------------------------------------
// Listing / bytes
// ---------------------------------------------------------------------------

export const listAssets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator(
    z.object({
      projectId: z.string(),
      offset: z.number().int().min(0).optional().default(0),
      limit: z.number().int().min(1).max(200).optional().default(50),
    }),
  )
  .handler(async ({ data, context }) => {
    const from = data.offset;
    const to = data.offset + data.limit - 1;
    const { data: rows, error, count } = await context.supabase
      .from("assets")
      .select("id, project_id, kind, mime, url, prompt, meta, created_at", { count: "exact" })
      .eq("owner_id", context.userId)
      .eq("project_id", data.projectId)
      .order("created_at", { ascending: false })
      .range(from, to);
    if (error) throw new Error(`Unable to load assets: ${error.message}`);

    const cloud = (rows ?? []).map(cloudRowToAsset);

    // Zero-duplicate merge (dedupe keys: supabase_id, then blob hash).
    // Local rows win over their cloud twins so a pending→ready fulfill
    // keeps the SAME card id in place (no ghost duplicate, no jump):
    //  - pending rows always come from local (cloud never has them)
    //  - local ready rows with a supabase_id replace the matching cloud row
    //    (enriched with the durable URL) and the cloud twin is dropped
    //  - legacy local rows without supabase_id dedupe cloud rows by blob hash
    //  - everything else from the cloud passes through untouched
    let merged: AssetRow[] = [];
    let extraLocal = 0;
    try {
      const db = getDb();
      const locals = db
        .prepare("SELECT * FROM assets WHERE project_id = ? ORDER BY created_at DESC")
        .all<RawRow>(data.projectId);

      const pending: AssetRow[] = [];
      const legacy: AssetRow[] = [];
      const localReadyBySupabase = new Map<string, AssetRow>();
      const localHashes = new Set<string>();
      for (const l of locals) {
        const meta = parseMeta(l.meta_json);
        const supabaseId = typeof meta.supabase_id === "string" ? meta.supabase_id : null;
        const asset = rowToAsset(l);
        if (l.blob_hash) localHashes.add(l.blob_hash);
        // Cloud meta may carry the hash for rows created before local sync.
        const metaHash = typeof meta.blob_hash === "string" ? meta.blob_hash : null;
        if (metaHash) localHashes.add(metaHash);
        if (l.kind === "pending") {
          pending.push(asset);
        } else if (supabaseId) {
          localReadyBySupabase.set(supabaseId, asset);
        } else {
          legacy.push(asset);
        }
      }

      const cloudFiltered: AssetRow[] = [];
      for (const c of cloud) {
        // 1) supabase_id match → local wins (same logical asset).
        if (c.supabaseId && localReadyBySupabase.has(c.supabaseId)) {
          const local = localReadyBySupabase.get(c.supabaseId)!;
          // Enrich local with the durable cloud URL when local has none.
          if (!local.url && c.url) local.url = c.url;
          continue;
        }
        // 2) blob-hash match (legacy local without supabase_id) → local wins.
        if (c.blobHash && localHashes.has(c.blobHash)) continue;
        cloudFiltered.push(c);
      }

      // Local ready rows (fulfilled pendings + Director mirrors) keep their
      // stable local ids and carry the cloud URL — shown in place.
      const localReady: AssetRow[] = [];
      for (const [, asset] of localReadyBySupabase) {
        const twin = cloud.find((c) => c.supabaseId && c.supabaseId === asset.supabaseId);
        if (twin?.url && !asset.url) asset.url = twin.url;
        localReady.push(asset);
      }

      // Pending first (actionable), then everything by recency.
      const byDate = (a: AssetRow, b: AssetRow) => b.createdAt - a.createdAt;
      pending.sort(byDate);
      localReady.sort(byDate);
      legacy.sort(byDate);
      cloudFiltered.sort(byDate);
      merged = [...pending, ...localReady, ...legacy, ...cloudFiltered];
      // Total = cloud total + truly-local rows (pending + legacy). Local
      // ready rows are cloud twins, not extras.
      extraLocal = pending.length + legacy.length;
    } catch {
      /* local kernel DB unavailable — cloud only */
      merged = cloud;
    }

    return {
      assets: merged,
      total: (count ?? rows?.length ?? 0) + extraLocal,
    };
  });

export const getAssetBytes = createServerFn({ method: "GET" })
  .validator(z.object({ hash: z.string() }))
  .handler(async ({ data }) => {
    const storage = getStorage();
    const bytes = await storage.get(data.hash);
    let bin = "";
    for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]);
    return { bytesBase64: btoa(bin), size: bytes.byteLength };
  });

// ---------------------------------------------------------------------------
// Take switching — swap the asset of an existing clip in place.
// The clip keeps its position; audio clips resize to the real duration.
// Used by the Inspector's A/B take comparison (one-click "Utiliser").
// ---------------------------------------------------------------------------

export const replaceClipAsset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ clipId: z.string(), newAssetId: z.string() }))
  .handler(async ({ data, context }) => {
    const { data: asset, error: assetErr } = await context.supabase
      .from("assets")
      .select("id, kind, meta")
      .eq("id", data.newAssetId)
      .eq("owner_id", context.userId)
      .maybeSingle();
    if (assetErr || !asset) throw new Error("média introuvable");
    const meta = (asset.meta ?? {}) as Record<string, unknown>;
    const patch: { asset_id: string; duration_ms?: number } = { asset_id: data.newAssetId };
    if (asset.kind === "audio" && typeof meta.duration_ms === "number" && meta.duration_ms > 0) {
      patch.duration_ms = meta.duration_ms;
    }
    const { data: clip, error } = await context.supabase
      .from("timeline_clips")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update(patch as any)
      .eq("id", data.clipId)
      .eq("owner_id", context.userId)
      .select("id, track, start_ms, duration_ms, asset_id")
      .single();
    if (error) throw new Error(error.message);
    try {
      getKernel().events.emit({ type: "AssetUpdated", assetId: data.newAssetId });
    } catch {
      /* kernel not ready */
    }
    return { clip };
  });

// ---------------------------------------------------------------------------
// Provenance summary for Library cards — tool label + parent count.
// Reads Supabase asset_provenance (Director) and the local kernel table
// (node graph) so every card can show its lineage at a glance.
// ---------------------------------------------------------------------------

export const getAssetsProvenance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ assetIds: z.array(z.string()).max(200) }))
  .handler(async ({ data, context }) => {
    const out: Record<string, { tool: string | null; parentCount: number }> = {};
    if (data.assetIds.length === 0) return { provenance: out };

    // Map local ids → supabase ids so Director provenance (keyed by cloud
    // id) resolves for locally-mirrored rows.
    const supabaseIds: string[] = [];
    const localToSupabase = new Map<string, string>();
    try {
      const db = getDb();
      for (const id of data.assetIds) {
        try {
          const row = db
            .prepare("SELECT meta_json FROM assets WHERE id = ?")
            .get<{ meta_json: string }>(id);
          if (row) {
            const meta = parseMeta(row.meta_json);
            if (typeof meta.supabase_id === "string") {
              localToSupabase.set(id, meta.supabase_id);
              supabaseIds.push(meta.supabase_id);
            }
          }
        } catch {
          /* row missing — still query cloud by raw id */
        }
      }
    } catch {
      /* local DB unavailable */
    }

    const queryIds = [...new Set([...data.assetIds, ...supabaseIds])];
    try {
      const { data: rows } = await context.supabase
        .from("asset_provenance")
        .select("asset_id, tool, source_asset_ids")
        .in("asset_id", queryIds);
      const byId = new Map<string, { tool: string | null; parentCount: number }>();
      for (const r of (rows ?? []) as Array<{
        asset_id: string;
        tool: string | null;
        source_asset_ids: string[] | null;
      }>) {
        byId.set(r.asset_id, {
          tool: r.tool,
          parentCount: Array.isArray(r.source_asset_ids) ? r.source_asset_ids.length : 0,
        });
      }
      for (const id of data.assetIds) {
        if (byId.has(id)) out[id] = byId.get(id)!;
        else if (localToSupabase.has(id) && byId.has(localToSupabase.get(id)!)) {
          out[id] = byId.get(localToSupabase.get(id)!)!;
        }
      }
    } catch {
      /* best-effort — cards simply hide the lineage row */
    }

    // Local node-graph provenance (capability_id) for rows without a
    // Director entry.
    try {
      const db = getDb();
      for (const id of data.assetIds) {
        if (out[id]) continue;
        try {
          const prov = db
            .prepare("SELECT capability_id, source_asset_ids_json FROM asset_provenance WHERE asset_id = ?")
            .get<{ capability_id: string | null; source_asset_ids_json: string }>(id);
          if (prov) {
            let parentCount = 0;
            try {
              const ids = JSON.parse(prov.source_asset_ids_json) as string[];
              parentCount = Array.isArray(ids) ? ids.length : 0;
            } catch {
              /* empty */
            }
            out[id] = { tool: prov.capability_id, parentCount };
          }
        } catch {
          /* no local provenance */
        }
      }
    } catch {
      /* local DB unavailable */
    }
    return { provenance: out };
  });
