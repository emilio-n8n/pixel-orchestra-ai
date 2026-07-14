// Blob storage contract. Backed by a `FsBlobStore` in dev, ready to be swapped
// for an S3-compatible adapter in prod (phase 9). The kernel and plugins only
// ever see this interface — never a concrete client.

import type { DBAdapter } from "../db/types";

export interface BlobRef {
  /** Content-addressed hash (sha256 hex of the bytes). */
  hash: string;
  /** Byte length. */
  size: number;
}

export interface BlobStore {
  /** Store `bytes` and return its content-address. Idempotent by hash. */
  put(bytes: Uint8Array): Promise<BlobRef>;
  /** Read back the bytes for a given hash. Throws if absent. */
  get(hash: string): Promise<Uint8Array>;
  /** Does a blob with this hash exist? */
  has(hash: string): Promise<boolean>;
  /** Where the bytes live (for asset rows: blob URI). */
  uri(hash: string): string;
}
