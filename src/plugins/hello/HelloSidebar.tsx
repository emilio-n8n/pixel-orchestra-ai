import { useKernelEvents } from "@/kernel/react";

export function HelloSidebar() {
  const events = useKernelEvents(50);
  const last = events[events.length - 1];

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[var(--rail)]">
      <div className="border-b border-[var(--line)] px-3 py-2 text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--text-dim)]">
        Hello (sidebar)
      </div>
      <div className="flex-1 overflow-auto p-3 text-[11px] text-[var(--text-muted)]">
        <p>
          This panel is contributed by the <span className="mono text-[var(--accent)]">hello</span>{" "}
          plugin (slot: <span className="mono">sidebar</span>). Sidebar modules are driven by{" "}
          <span className="mono">registry.panelsForSlot('sidebar')</span> — no hardcoded list.
        </p>
        <div className="mt-3 border-t border-[var(--line)] pt-2">
          <div className="text-[10px] uppercase tracking-widest text-[var(--text-dim)]">
            Last event
          </div>
          <div className="mono mt-1 text-[11px]">
            {last ? (
              <>
                <span className="text-[var(--text-dim)]">
                  {new Date(last.ts).toLocaleTimeString()}
                </span>{" "}
                <span className="text-[var(--accent)]">{last.type}</span>
              </>
            ) : (
              <span className="text-[var(--text-dim)]">—</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
