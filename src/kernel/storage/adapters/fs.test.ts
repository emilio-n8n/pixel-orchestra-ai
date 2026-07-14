import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createFsBlobStore } from "../adapters/fs";

describe("fs blob store", () => {
  let dir: string;
  let store: ReturnType<typeof createFsBlobStore>;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "lilium-blob-"));
    store = createFsBlobStore(dir);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("puts a blob and reads it back by hash", async () => {
    const bytes = new TextEncoder().encode("hello world");
    const ref = await store.put(bytes);
    expect(ref.size).toBe(11);
    expect(ref.hash).toHaveLength(64); // sha256 hex
    const back = await store.get(ref.hash);
    expect(new TextDecoder().decode(back)).toBe("hello world");
  });

  it("is idempotent on identical content (content-addressed)", async () => {
    const bytes = new TextEncoder().encode("dup");
    const a = await store.put(bytes);
    const b = await store.put(bytes);
    expect(a.hash).toBe(b.hash);
    expect(a.size).toBe(b.size);
  });

  it("shards files in subdirectories by hash prefix", async () => {
    const bytes = new TextEncoder().encode("x");
    const ref = await store.put(bytes);
    const shard = ref.hash.slice(0, 2);
    const onDisk = join(dir, shard, ref.hash);
    expect(existsSync(onDisk)).toBe(true);
    expect(readFileSync(onDisk).toString()).toBe("x");
  });

  it("has() reflects whether a blob exists", async () => {
    const ref = await store.put(new TextEncoder().encode("a"));
    expect(await store.has(ref.hash)).toBe(true);
    expect(
      await store.has("0000000000000000000000000000000000000000000000000000000000000000"),
    ).toBe(false);
  });

  it("throws on missing blob", async () => {
    await expect(
      store.get("0000000000000000000000000000000000000000000000000000000000000000"),
    ).rejects.toThrow("blob not found");
  });

  it("uri() returns a stable lilium-blob:// scheme", async () => {
    const ref = await store.put(new TextEncoder().encode("u"));
    expect(store.uri(ref.hash)).toBe(`lilium-blob://${ref.hash}`);
  });

  it("roundtrips binary content (non-text)", async () => {
    const bytes = new Uint8Array(1024);
    for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 7) & 0xff;
    const ref = await store.put(bytes);
    const back = await store.get(ref.hash);
    expect(back.byteLength).toBe(1024);
    for (let i = 0; i < back.length; i++) expect(back[i]).toBe((i * 7) & 0xff);
  });
});
