import { Check, Loader2, X, type LucideIcon } from "lucide-react";

export type GenerationState = "idle" | "queued" | "generating" | "completed" | "failed" | "cancelled";

export function GenerationCard({
  icon: Icon,
  title,
  state,
  detail,
  progress,
  action,
}: {
  icon: LucideIcon;
  title: string;
  state: GenerationState;
  detail?: string;
  /** 0..1 — renders a determinate bar; omit for an indeterminate shimmer. */
  progress?: number;
  action?: React.ReactNode;
}) {
  const running = state === "generating" || state === "queued";
  const accent =
    state === "failed"
      ? "var(--status-err)"
      : state === "completed"
        ? "var(--status-ok)"
        : running
          ? "var(--accent)"
          : "var(--text-dim)";

  return (
    <div className="animate-fade-in rounded-lg border border-[var(--line)] bg-[var(--surface-2)] p-2.5">
      <div className="flex items-center gap-2">
        <span
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md"
          style={{ background: "var(--surface-3)", color: accent }}
        >
          {state === "completed" ? (
            <Check size={13} />
          ) : state === "failed" || state === "cancelled" ? (
            <X size={13} />
          ) : running ? (
            <Loader2 size={13} className="animate-spin" />
          ) : (
            <Icon size={13} />
          )}
        </span>
        <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-[var(--text)]">
          {title}
        </span>
        {typeof progress === "number" && running ? (
          <span className="text-[11px] tabular-nums text-[var(--text-dim)]">
            {Math.round(progress * 100)}%
          </span>
        ) : null}
      </div>

      {running ? (
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-[var(--surface-4)]">
          <div
            className={typeof progress === "number" ? "h-full rounded-full" : "h-full w-1/3 rounded-full animate-[indeterminate_1.4s_ease-in-out_infinite]"}
            style={{
              background: "var(--accent)",
              width: typeof progress === "number" ? `${Math.round(progress * 100)}%` : undefined,
              transition: "width var(--dur-slow) var(--ease-out)",
            }}
          />
        </div>
      ) : null}

      {detail ? (
        <p className="mt-1.5 line-clamp-2 text-[11px] leading-relaxed text-[var(--text-dim)]">
          {detail}
        </p>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}