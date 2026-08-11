import type { ReactNode } from "react";

export type StatusTone = "idle" | "queued" | "running" | "done" | "failed" | "cancelled" | "ai";

const TONE: Record<StatusTone, { dot: string; text: string; bg: string }> = {
  idle: { dot: "var(--status-idle)", text: "var(--text-dim)", bg: "transparent" },
  queued: { dot: "var(--status-idle)", text: "var(--text-muted)", bg: "var(--surface-3)" },
  running: { dot: "var(--accent)", text: "var(--accent-strong)", bg: "var(--accent-quiet)" },
  done: { dot: "var(--status-ok)", text: "var(--status-ok)", bg: "transparent" },
  failed: { dot: "var(--status-err)", text: "var(--status-err)", bg: "transparent" },
  cancelled: { dot: "var(--status-idle)", text: "var(--text-dim)", bg: "transparent" },
  ai: { dot: "var(--accent)", text: "var(--accent-strong)", bg: "var(--accent-quiet)" },
};

export function StatusPill({
  tone = "idle",
  children,
  pulse,
}: {
  tone?: StatusTone;
  children: ReactNode;
  pulse?: boolean;
}) {
  const t = TONE[tone];
  return (
    <span
      className="inline-flex h-5 items-center gap-1.5 rounded-full px-2 text-[10.5px] font-medium tracking-tight"
      style={{ color: t.text, background: t.bg }}
    >
      <span
        className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${pulse ? "animate-pulse" : ""}`}
        style={{ background: t.dot }}
      />
      {children}
    </span>
  );
}