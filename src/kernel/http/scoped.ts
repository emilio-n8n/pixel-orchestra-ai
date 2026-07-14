// Scoped HTTP client. Enforces the `net:` permissions declared in a plugin's
// manifest. A plugin that declares `net:https://*.gradio.live` can only fetch
// URLs matching that pattern; everything else is rejected with a clear error.
//
// The matcher is a permissive glob: scheme + host + optional path prefix.
//   `net`                                  → any URL
//   `net:https://*.gradio.live`            → any https URL on a *.gradio.live host
//   `net:https://api.example.com/v1`       → that host + that path prefix
//
// Keep this in a dedicated file so the rest of the kernel never imports the
// raw `fetch` API directly.

import type { HttpRequest } from "../contracts/plugin";

export interface ScopedHttp {
  fetch(req: HttpRequest): Promise<Response>;
  /** Returns the list of permissions this client was scoped with. */
  permissions(): readonly string[];
}

function globToRegex(glob: string): RegExp {
  // Escape regex metacharacters except `*`.
  const escaped = glob.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*");
  // Match the pattern as a URL prefix. We anchor the start; the end can
  // be anything (path, query, fragment, end-of-string). This makes
  // `net:https://api.example.com/v1` match `https://api.example.com/v1/chat`
  // but not `https://api.example.com/v2/chat`.
  return new RegExp("^" + escaped + "(?:[?#/].*)?$");
}

function permissionMatches(perm: string, url: string): boolean {
  if (perm === "net" || perm === "*") return true;
  if (!perm.startsWith("net:")) return false;
  const pattern = perm.slice("net:".length);
  if (!pattern) return true;
  try {
    return globToRegex(pattern).test(url);
  } catch {
    return false;
  }
}

export function createScopedHttp(perms: readonly string[]): ScopedHttp {
  const list = perms.filter((p) => p === "net" || p.startsWith("net:"));
  return {
    permissions: () => list,
    async fetch(req: HttpRequest) {
      const ok = list.some((p) => permissionMatches(p, req.url));
      if (!ok) {
        throw new Error(
          `HTTP forbidden by plugin permissions: ${req.url} ` +
            `(allowed: ${list.length ? list.join(", ") : "<none>"})`,
        );
      }
      return globalThis.fetch(req.url, {
        method: req.method ?? "GET",
        headers: req.headers,
        body: req.body ?? undefined,
      });
    },
  };
}
