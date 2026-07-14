import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createScopedHttp, type ScopedHttp } from "./scoped";

let originalFetch: typeof globalThis.fetch;
let lastUrl: string | null = null;

beforeEach(() => {
  originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request) => {
    lastUrl =
      typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    return new Response("{}", { status: 200 });
  }) as typeof globalThis.fetch;
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  lastUrl = null;
});

describe("scoped http", () => {
  it("lists the scoped permissions (only net: ones)", () => {
    const http = createScopedHttp(["net", "net:https://*.gradio.live", "fs:read"]);
    expect(http.permissions()).toEqual(["net", "net:https://*.gradio.live"]);
  });

  it("forbids URLs outside the allowlist", async () => {
    const http = createScopedHttp(["net:https://*.gradio.live"]);
    await expect(http.fetch({ url: "https://evil.example.com/" })).rejects.toThrow(
      "HTTP forbidden",
    );
  });

  it("allows URLs matching a wildcard host", async () => {
    const http = createScopedHttp(["net:https://*.gradio.live"]);
    await http.fetch({ url: "https://spaces.abcd.gradio.live/" });
    expect(lastUrl).toBe("https://spaces.abcd.gradio.live/");
  });

  it("allows exact-prefix matches and rejects siblings", async () => {
    const http = createScopedHttp(["net:https://api.example.com/v1"]);
    await http.fetch({ url: "https://api.example.com/v1/chat" });
    expect(lastUrl).toBe("https://api.example.com/v1/chat");
    await expect(http.fetch({ url: "https://api.example.com/v2/chat" })).rejects.toThrow();
  });

  it("'net' allows any URL", async () => {
    const http = createScopedHttp(["net"]);
    await http.fetch({ url: "https://anything.tld/path?q=1" });
    expect(lastUrl).toBe("https://anything.tld/path?q=1");
  });

  it("non-net permissions are filtered out", () => {
    const http = createScopedHttp(["fs:read", "secrets:read"]);
    expect(http.permissions()).toEqual([]);
  });

  it("forbids when the permission list contains no net: rules", async () => {
    const http = createScopedHttp(["fs:read"]);
    await expect(http.fetch({ url: "https://x.test/" })).rejects.toThrow("HTTP forbidden");
  });
});
