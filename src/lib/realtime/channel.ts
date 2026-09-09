import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { nextBackoff } from "./online";

export type ConnState = "live" | "reconnecting" | "offline";

type ChannelLike = {
  subscribe: (cb?: (status: string) => void) => unknown;
};

/**
 * Subscribe to a Supabase realtime channel with lovable.dev-grade
 * robustness (WS6):
 *
 * - cleanup always via `supabase.removeChannel` (never the mock unsubscribe)
 * - CHANNEL_ERROR / CLOSED / TIMED_OUT → silent exponential-backoff resubscribe
 * - offline → single "offline" state, no retry storm; online → immediate resubscribe + flush
 * - stale-while-reconnect: panel data is never cleared here; the caller keeps
 *   the last payload and renders a pill from the returned state
 * - zero console spam: failures are swallowed by design
 */
export function useSupabaseChannel(opts: {
  /** Null while the project id (or auth) is not ready — no subscription. */
  name: string | null;
  /**
   * Build the channel: supabase.channel(name).on(…). Do NOT subscribe here.
   * Call `signal` from postgres_changes callbacks — bursts are coalesced
   * into a single reload (100-jobs flood → 1 load).
   */
  build: (signal: () => void) => ChannelLike;
  /** Reload callback (storm-guarded, owns its own .catch). */
  onEvent: () => void;
  enabled?: boolean;
}): ConnState {
  const { name, enabled = true } = opts;
  const [conn, setConn] = useState<ConnState>("live");
  const onEventRef = useRef(opts.onEvent);
  const buildRef = useRef(opts.build);
  // Ref writes belong in an effect (concurrent-mode safe), not render.
  useEffect(() => {
    onEventRef.current = opts.onEvent;
    buildRef.current = opts.build;
  });

  useEffect(() => {
    if (!name || !enabled) return;
    let disposed = false;
    let channel: ChannelLike | null = null;
    let retryTimer: number | null = null;
    let attempt = 0;
    let stormTimer: number | null = null;

    const onlineNow = () => (typeof navigator === "undefined" ? true : navigator.onLine !== false);

    function clearRetry() {
      if (retryTimer != null) {
        window.clearTimeout(retryTimer);
        retryTimer = null;
      }
    }

    /** Coalesce postgres_changes bursts (100-jobs flood) into one reload. */
    function fire() {
      if (disposed) return;
      if (stormTimer != null) return;
      stormTimer = window.setTimeout(() => {
        stormTimer = null;
        if (!disposed) {
          try {
            onEventRef.current();
          } catch {
            /* load() owns its own .catch */
          }
        }
      }, 250);
    }

    function teardown() {
      clearRetry();
      if (stormTimer != null) {
        window.clearTimeout(stormTimer);
        stormTimer = null;
      }
      if (channel) {
        const ch = channel;
        channel = null;
        try {
          void supabase.removeChannel(ch as never);
        } catch {
          /* already gone */
        }
      }
    }

    function scheduleRetry() {
      if (disposed || !onlineNow()) return;
      clearRetry();
      const delay = nextBackoff(attempt++);
      retryTimer = window.setTimeout(() => {
        retryTimer = null;
        if (!disposed) subscribe();
      }, delay);
    }

    function subscribe() {
      if (disposed) return;
      if (!onlineNow()) {
        setConn("offline");
        return;
      }
      teardown();
      let ch: ChannelLike;
      try {
        ch = buildRef.current(fire);
      } catch {
        scheduleRetry();
        return;
      }
      channel = ch;
      try {
        ch.subscribe((status: string) => {
          if (disposed) return;
          if (status === "SUBSCRIBED") {
            attempt = 0;
            setConn(onlineNow() ? "live" : "offline");
          } else if (status === "CHANNEL_ERROR" || status === "CLOSED" || status === "TIMED_OUT") {
            setConn(onlineNow() ? "reconnecting" : "offline");
            scheduleRetry();
          }
        });
      } catch {
        setConn("reconnecting");
        scheduleRetry();
      }
    }

    const onOnline = () => {
      if (disposed) return;
      attempt = 0;
      setConn("reconnecting");
      subscribe();
      fire();
    };
    const onOffline = () => {
      if (disposed) return;
      setConn("offline");
      teardown();
    };

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    if (!onlineNow()) {
      setConn("offline");
    } else {
      subscribe();
    }

    return () => {
      disposed = true;
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      teardown();
    };
    // `name` scopes the channel; callbacks flow through refs (no resub loop).
  }, [name, enabled]);

  return conn;
}
