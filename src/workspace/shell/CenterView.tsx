import { useMemo } from "react";
import { useRegistrySnapshot } from "@/kernel/react";
import { usePanelStore } from "@/stores/panels";

const MODULE_TITLES: Record<string, string> = {
  library: "Library",
  storyboard: "Storyboard",
  timeline: "Timeline",
  graph: "Node Graph",
  characters: "Characters",
  connectors: "Connectors",
  jobs: "Jobs",
  settings: "Project settings",
};

export function CenterView() {
  const registry = useRegistrySnapshot();
  const active = usePanelStore((s) => s.activeModule);
  const centerPanels = registry.panelsForSlot("center");

  // Resolution order:
  //   1. A panel whose id === active module id (e.g. "library" → "library.center")
  //   2. A panel whose id starts with the active module id
  //   3. The lowest-order center panel (default welcome)
  const resolved = useMemo(() => {
    if (centerPanels.length === 0) return undefined;
    const exact = centerPanels.find((p) => p.id === active || p.id === `${active}.center`);
    if (exact) return exact;
    const prefix = centerPanels.find((p) => p.id.startsWith(`${active}.`));
    if (prefix) return prefix;
    return centerPanels[0];
  }, [centerPanels, active]);

  if (resolved) {
    const Comp = resolved.component;
    return (
      <div className="h-full min-h-0 bg-[var(--surface-1)]">
        <Comp />
      </div>
    );
  }

  const title = MODULE_TITLES[active] ?? active;

  return (
    <div className="flex h-full items-center justify-center bg-[var(--surface-1)] p-8">
      <div className="max-w-md text-center">
        <div className="text-[11px] uppercase tracking-[0.18em] text-[var(--text-dim)]">Module</div>
        <h2 className="mt-1 text-lg font-medium text-[var(--text)]">{title}</h2>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          This module ships in a later phase. Once its plugin is registered, its
          <code className="mono mx-1 rounded bg-[var(--surface-3)] px-1 py-0.5 text-[11px]">
            center
          </code>
          panel renders here.
        </p>
      </div>
    </div>
  );
}
