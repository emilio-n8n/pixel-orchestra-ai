// Storage singleton. Server-only — the browser bundle never imports `node:fs`.
// Picks the right adapter for the runtime (FS for now, S3 in phase 9).

import type { BlobStore } from "./types";
import { createFsBlobStore } from "./adapters/fs";

let _store: BlobStore | null = null;
let _initPromise: Promise<BlobStore> | null = null;

async function init(): Promise<BlobStore> {
  if (typeof window !== "undefined") {
    throw new Error("Lilium blob storage is server-only.");
  }
  const { createFsBlobStore: create } = await import("./adapters/fs");
  return create();
}

export async function initStorage(): Promise<BlobStore> {
  if (_store) return _store;
  if (!_initPromise) _initPromise = init();
  return _initPromise;
}

export function getStorage(): BlobStore {
  if (_store) return _store;
  throw new Error("Storage not initialized. Call await initStorage() first.");
}

export function __setStorageForTests(s: BlobStore | null): void {
  _store = s;
  _initPromise = null;
}

export type { BlobStore, BlobRef } from "./types";
export { createFsBlobStore } from "./adapters/fs";
