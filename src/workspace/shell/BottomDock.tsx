import { usePanelStore } from "@/stores/panels";

export function BottomDock() {
  const active = usePanelStore((s) => s.activeModule);
  return (
    <div className="flex h-full flex-col overflow-hidden bg-[var(--surface-2)]">
      <div className="flex h-8 shrink-0 items-center gap-1 border-b border-[var(--line)] px-2">
        <Tab label="Library" active={active === "library"} />
        <Tab label="Timeline" active={active === "timeline"} />
        <Tab label="Jobs" active={active === "jobs"} />
      </div>
      <div className="flex-1 overflow-auto p-4 text-xs text-[var(--text-dim)]">
        <div className="mono">
          {active === "library" && "Drop files here to import — phase 2."}
          {active === "timeline" && "Multi-track timeline — phase 7."}
          {active === "jobs" && "Live job queue — phase 4."}
          {!["library", "timeline", "jobs"].includes(active) && "Bottom dock idle."}
        </div>
      </div>
    </div>
  );
}

function Tab({ label, active }: { label: string; active: boolean }) {
  return (
    <div
      className={`rounded-md px-2 py-1 text-[11px] ${
        active
          ? "bg-[var(--surface-3)] text-[var(--text)]"
          : "text-[var(--text-dim)] hover:text-[var(--text-muted)]"
      }`}
    >
      {label}
    </div>
  );
}