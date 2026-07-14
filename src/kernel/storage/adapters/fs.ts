// Filesystem blob store. Shards the on-disk directory by the first two
// characters of the hash to avoid huge flat folders. Files are immutable —
// same hash = same content, deduped automatically. `put()` is idempotent.
//
// Kept in its own file so the kernel can swap to an S3 adapter without
// touching consumers.

import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import { join } from "node:path";
import type { BlobRef, BlobStore } from "../types";

function defaultRoot(): string {
  if (typeof process !== "undefined" && process.env?.LILIUM_BLOBS_PATH) {
    return process.env.LILIUM_BLOBS_PATH;
  }
  const home = (typeof process !== "undefined" && process.env?.HOME) || ".";
  return `${home}/.lilium/blobs`;
}

function shard(hash: string): string {
  return hash.slice(0, 2);
}

function pathFor(root: string, hash: string): string {
  return join(root, shard(hash), hash);
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

export function createFsBlobStore(root: string = defaultRoot()): BlobStore {
  return {
    async put(bytes) {
      const hash = createHash("sha256").update(bytes).digest("hex");
      const p = pathFor(root, hash);
      if (!(await fileExists(p))) {
        await mkdir(join(root, shard(hash)), { recursive: true });
        await writeFile(p, bytes);
      }
      return { hash, size: bytes.byteLength };
    },
    async get(hash) {
      const p = pathFor(root, hash);
      if (!(await fileExists(p))) {
        throw new Error(`blob not found: ${hash}`);
      }
      return new Uint8Array(await readFile(p));
    },
    async has(hash) {
      return fileExists(pathFor(root, hash));
    },
    uri(hash) {
      return `lilium-blob://${hash}`;
    },
  };
}
