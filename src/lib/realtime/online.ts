import { useEffect, useState } from "react";

/**
 * Shared realtime helpers (WS6 — Jobs, Realtime & Robustness).
 *
 * Plugin-first: the kernel knows nothing about Supabase. Panels that need
 * live data share these tiny hooks instead of each re-implementing
 * online/offline + backoff + silent retries (which is how fetch storms and
 * console spam happen).
 */

/** True when the failure looks like "no network" — always swallowed silently. */
export function isOfflineError(e: unknown): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  const msg =
    e instanceof Error
      ? `${e.name}: ${e.message}`
      : typeof e === "string"
        ? e
        : (() => {
            try {
              return JSON.stringify(e);
            } catch {
              return String(e);
            }
          })();
  return (
    /failed to fetch|networkerror|err_internet_disconnected|err_network|load failed|network request failed|offline/i.test(
      msg,
    ) || /typeerror.*fetch/i.test(msg)
  );
}

/** Exponential backoff: 1s → 2s → 4s … capped at 30s. */
export function nextBackoff(attempt: number): number {
  return Math.min(1000 * 2 ** Math.max(0, attempt), 30_000);
}

/**
 * Tracks window online/offline. Initial value honours navigator.onLine so a
 * cold start without network renders the offline pill immediately instead
 * of firing a storm of failing fetches first.
 */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState<boolean>(() =>
    typeof navigator === "undefined" ? true : navigator.onLine !== false,
  );
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
}
