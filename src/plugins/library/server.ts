// Server-side functions for the library panel. Backed by the kernel's
// DB + blob storage. Called from the client via TanStack Start's
// createServerFn, which serializes args + result over the wire.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getDb } from "@/kernel/db";
import { getStorage } from "@/kernel/storage";
import { getKernel } from "@/kernel";
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

function rowToAsset(r: RawRow): AssetRow {
  return {
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
  };
}

export const importAsset = createServerFn({ method: "POST" })
  .validator(
    z.object({
      projectId: z.string(),
      name: z.string().min(1),
      mime: z.string(),
      bytesBase64: z.string(),
    }),
  )
  .handler(async ({ data }) => {
    const db = getDb();
    const storage = getStorage();
    const bytes = Uint8Array.from(atob(data.bytesBase64), (c) => c.charCodeAt(0));
    const ref = await storage.put(bytes);
    const id = uid("ast");
    const now = Date.now();
    const kind = kindFromMime(data.mime);
    db.prepare(
      `INSERT INTO assets (id, project_id, kind, name, mime, size_bytes, blob_hash, thumbnail_hash, meta_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NULL, '{}', ?, ?)`,
    ).run(id, data.projectId, kind, data.name, data.mime, ref.size, ref.hash, now, now);
    const row = db.prepare("SELECT * FROM assets WHERE id = ?").get<RawRow>(id);
    if (!row) throw new Error("asset insert failed");
    const asset = rowToAsset(row);
    try {
      getKernel().events.emit({
        type: "AssetImported",
        assetId: id,
        projectId: data.projectId,
        kind,
        name: data.name,
        sizeBytes: ref.size,
        blobHash: ref.hash,
      });
    } catch {
      /* kernel not ready (tests) */
    }
    return { asset };
  });

export const listAssets = createServerFn({ method: "GET" })
  .validator(z.object({ projectId: z.string() }))
  .handler(async ({ data }) => {
    const db = getDb();
    const rows = db
      .prepare("SELECT * FROM assets WHERE project_id = ? ORDER BY created_at DESC")
      .all<RawRow>(data.projectId);
    return { assets: rows.map(rowToAsset) };
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
