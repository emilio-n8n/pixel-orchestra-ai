// Shared types between client and server for the asset API.

export type AssetKind = "image" | "video" | "audio" | "html" | "doc" | "other" | "pending";

/** Anything JSON-serializable. TanStack Start's createServerFn rejects
 *  `Record<string, unknown>` because `unknown` may include functions, etc. */
export type JsonObject = {
  [k: string]:
    | string
    | number
    | boolean
    | null
    | JsonObject
    | JsonObject[]
    | string[]
    | number[]
    | boolean[]
    | null[];
};

/**
 * Wire-safe asset row. `meta` carries the wire-safe subset (voice takes
 * via take_group/take_index, duration_ms, supabase_id, blob_hash…).
 */
export interface AssetRow {
  id: string;
  projectId: string;
  kind: AssetKind;
  name: string;
  mime: string | null;
  sizeBytes: number;
  blobHash: string | null;
  thumbnailHash: string | null;
  createdAt: number;
  updatedAt: number;
  /** "pending" when the asset is waiting for the user to provide the file. */
  status?: "pending" | "ready";
  /** For pending assets: the kind being waited on (image/video/audio). */
  pendingKind?: AssetKind;
  /** For pending assets: the generation prompt the user should follow. */
  prompt?: string;
  /** The matching row id in Supabase (synced assets). */
  supabaseId?: string | null;
  /** Durable signed URL used by published builds and remote viewers. */
  url?: string | null;
  /** Wire-safe subset of the asset metadata (voice takes, duration_ms…). */
  meta?: JsonObject | null;
}

export interface ImportAssetInput {
  projectId: string;
  name: string;
  mime: string;
  /** base64-encoded bytes. The server decodes and stores. */
  bytesBase64: string;
}

export interface ImportAssetOutput {
  asset: AssetRow;
}

/** Voice-take grouping written by generate_voice_takes (shared take_group + 0-based take_index). */
export function takeGroupOf(a: Pick<AssetRow, "meta">): string | null {
  const m = a.meta as Record<string, unknown> | null | undefined;
  return m && typeof m.take_group === "string" ? m.take_group : null;
}

export function takeIndexOf(a: Pick<AssetRow, "meta">): number | null {
  const m = a.meta as Record<string, unknown> | null | undefined;
  return m && typeof m.take_index === "number" ? m.take_index : null;
}

/** A/B/C… label for a 0-based take index (A–E, then 6, 7…). */
export function takeLabel(index: number): string {
  return ["A", "B", "C", "D", "E"][index] ?? `${index + 1}`;
}

export function durationMsOf(a: Pick<AssetRow, "meta">): number | null {
  const m = a.meta as Record<string, unknown> | null | undefined;
  return m && typeof m.duration_ms === "number" && m.duration_ms > 0 ? m.duration_ms : null;
}

/** Dedupe key for the local+cloud merge: supabase_id first, then blob hash. */
export function dedupeKeyOf(a: Pick<AssetRow, "supabaseId" | "blobHash" | "id">): string {
  if (a.supabaseId) return `sb:${a.supabaseId}`;
  if (a.blobHash) return `hash:${a.blobHash}`;
  return `id:${a.id}`;
}

/** Client-side safety net: drop duplicates by supabase_id, then blob hash. */
export function dedupeAssets<T extends Pick<AssetRow, "supabaseId" | "blobHash" | "id">>(
  assets: T[],
): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const a of assets) {
    const k = dedupeKeyOf(a);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(a);
  }
  return out;
}
