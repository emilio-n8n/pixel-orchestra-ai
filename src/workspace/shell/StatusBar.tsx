import { useKernel, useKernelEvents } from "@/kernel/react";
import { usePanelStore } from "@/stores/panels";

export function StatusBar() {
  const { host, scheduler } = useKernel();
  const events = useKernelEvents(1);
  const last = events[events.length - 1];
  const toggle = usePanelStore((s) => s.toggle);
  const bottomCollapsed = usePanelStore((s) => s.bottomCollapsed);
  const inspectorCollapsed = usePanelStore((s) => s.inspectorCollapsed);

  const isJobEvent =
    last?.type === "JobQueued" ||
    last?.type === "JobStarted" ||
    last?.type === "JobProgress" ||
    last?.type === "JobFinished" ||
    last?.type === "JobFailed";
  const jobNote = isJobEvent ? last : null;

  return (
    <div className="flex h-6 shrink-0 items-center justify-between border-t border-[var(--line)] bg-[var(--rail)] px-2 text-[11px] text-[var(--text-dim)]">
      <div className="flex items-center gap-3">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--status-ok)]" />
          Kernel ready
        </span>
        <span className="mono">Plugins: {host.count()}</span>
        <span className="mono">Executors: {scheduler.count()}</span>
        {jobNote ? (
          <span className="mono">
            <span className="text-[var(--accent)]">{jobNote.type}</span>
            {jobNote.type === "JobProgress" && "progress" in jobNote
              ? ` ${Math.round((jobNote as unknown as { progress: number }).progress * 100)}%`
              : null}
          </span>
        ) : last ? (
          <span className="mono">
            {new Date(last.ts).toLocaleTimeString()} · {last.type}
          </span>
        ) : (
          <span className="mono">no events</span>
        )}
      </div>
      <div className="flex items-center gap-1">
        <StatusToggle label="Bottom" on={!bottomCollapsed} onClick={() => toggle("bottom")} />
        <StatusToggle
          label="Inspector"
          on={!inspectorCollapsed}
          onClick={() => toggle("inspector")}
        />
      </div>
    </div>
  );
}

function StatusToggle({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`rounded px-1.5 py-0.5 text-[10px] uppercase tracking-widest hover:bg-[var(--surface-3)] ${
        on ? "text-[var(--text-muted)]" : "text-[var(--text-dim)]"
      }`}
    >
      {label}
    </button>
  );
}
