import { useRegistrySnapshot } from "@/kernel/react";
import { usePanelStore } from "@/stores/panels";

export function Inspector() {
  const registry = useRegistrySnapshot();
  const panels = registry.panelsForSlot("inspector");

  if (panels.length === 0) {
    return (
      <div className="flex h-full flex-col overflow-hidden bg-[var(--surface-2)]">
        <Header />
        <div className="flex-1 overflow-auto p-4 text-sm text-[var(--text-muted)]">
          <div className="rounded-md border border-dashed border-[var(--line)] p-4 text-center text-xs text-[var(--text-dim)]">
            Nothing selected.
            <br />
            Pick an asset, clip, node or job to inspect.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[var(--surface-2)]">
      <Header />
      <div className="flex-1 overflow-hidden">
        {panels.map((p) => {
          const Comp = p.component;
          return <Comp key={p.id} />;
        })}
      </div>
    </div>
  );
}

function Header() {
  return (
    <div className="flex h-9 shrink-0 items-center border-b border-[var(--line)] px-3">
      <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--text-dim)]">
        Inspector
      </div>
    </div>
  );
}
