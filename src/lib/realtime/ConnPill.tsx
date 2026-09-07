import { CONN_LABELS } from "@/lib/ui/labels";
import type { ConnState } from "./channel";

/**
 * Single connection-status pill (WS6). Rendered only while reconnecting or
 * offline — never during normal operation, never one per error. Stale data
 * stays visible underneath (stale-while-reconnect).
 */
export function ConnPill({ state }: { state: ConnState }) {
  if (state === "live") return null;
  const offline = state === "offline";
  return (
    <span
      role="status"
      title={offline ? CONN_LABELS.offline : CONN_LABELS.reconnecting}
      className={`mono inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-px text-[9px] ${
        offline
          ? "border-[var(--status-err)]/40 text-[var(--status-err)]"
          : "border-[var(--status-warn)]/40 text-[var(--status-warn)] animate-pulse"
      }`}
    >
      <span
        className={`inline-block h-1 w-1 rounded-full ${
          offline ? "bg-[var(--status-err)]" : "bg-[var(--status-warn)]"
        }`}
      />
      {offline ? "Hors ligne" : "Reconnexion…"}
    </span>
  );
}
