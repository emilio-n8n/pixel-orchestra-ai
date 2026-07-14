import { useRegistrySnapshot } from "@/kernel/react";
import { usePanelStore } from "@/stores/panels";

export function CenterView() {
  const registry = useRegistrySnapshot();
  const active = usePanelStore((s) => s.activeModule);
  const panels = registry.panelsForSlot("center");
  const first = panels[0];

  // Placeholder titles for modules not yet backed by a plugin panel.
  const moduleLabels: Record<string, string> = {
    library: "Library",
    storyboard: "Storyboard",
    timeline: "Timeline",
    graph: "Node Graph",
    characters: "Characters",
    connectors: "Connectors",
    jobs: "Jobs",
    settings: "Project settings",
  };

  if (active === "library" && first) {
    const Comp = first.component;
    return (
      <div className="h-full min-h-0 bg-[var(--surface-1)]">
        <Comp />
      </div>
    );
  }

  return (
    <div className="flex h-full items-center justify-center bg-[var(--surface-1)] p-8">
      <div className="max-w-md text-center">
        <div className="text-[11px] uppercase tracking-[0.18em] text-[var(--text-dim)]">Module</div>
        <h2 className="mt-1 text-lg font-medium text-[var(--text)]">{moduleLabels[active]}</h2>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          This module ships in a later phase. The workspace shell is fully driven by plugins — once the
          module's plugin is registered, its panel renders here.
        </p>
      </div>
    </div>
  );
}