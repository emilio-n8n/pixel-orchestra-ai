import { useMemo } from "react";
import { useRegistrySnapshot } from "@/kernel/react";
import { usePanelStore } from "@/stores/panels";
import { useLibrary } from "@/plugins/library/store";
import type { ViewerAsset } from "@/kernel";

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
  const selected = useLibrary((s) => s.selected);
  const setSelected = useLibrary((s) => s.setSelected);
  const centerPanels = registry.panelsForSlot("center");

  // Resolution order for the panel mode (computed unconditionally):
  //   1. A panel whose id === active module id
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

  // Viewer mode: an asset is selected → find the highest-priority viewer
  // matching its kind and render it.
  if (selected) {
    const viewer = registry.viewerFor(selected.kind);
    if (viewer) {
      const Comp = viewer.component;
      const asset: ViewerAsset = {
        id: selected.id,
        kind: selected.kind,
        name: selected.name,
        mime: selected.mime,
        sizeBytes: selected.sizeBytes,
        blobHash: selected.blobHash,
      };
      return (
        <div className="flex h-full min-h-0 flex-col bg-[var(--surface-1)]">
          <div className="flex h-9 shrink-0 items-center justify-between border-b border-[var(--line)] px-3">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--text-dim)]">
                {selected.kind}
              </span>
              <span className="truncate text-[12px] text-[var(--text-muted)]" title={selected.name}>
                {selected.name}
              </span>
            </div>
            <button
              onClick={() => setSelected(null)}
              className="rounded px-2 py-1 text-[10px] uppercase tracking-widest text-[var(--text-dim)] hover:bg-[var(--surface-3)] hover:text-[var(--text-muted)]"
            >
              ← Back
            </button>
          </div>
          <div className="flex-1 min-h-0">
            <Comp asset={asset} />
          </div>
        </div>
      );
    }
    // No viewer for this kind — fall through to the resolved panel below.
  }

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
