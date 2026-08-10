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
 * Wire-safe asset row. `meta` is intentionally absent — phase 9 will add
 * a typed metadata schema per asset kind. For now the library shows the
 * essentials: id, name, kind, mime, size, blob hash, timestamps.
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
