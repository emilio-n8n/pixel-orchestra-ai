import { useMemo } from "react";
import { ArrowLeft, Hammer } from "lucide-react";
import { useRegistrySnapshot } from "@/kernel/react";
import { usePanelStore } from "@/stores/panels";
import { useLibrary } from "@/plugins/library/store";
import { PendingAssetView } from "@/plugins/library/PendingAssetView";
import { EmptyState } from "@/components/ui/empty-state";
import { kindLabel, moduleMeta } from "@/lib/ui/labels";
import type { ViewerAsset } from "@/kernel";

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
    // Pending assets show a "drop your generated file" screen instead of a viewer.
    if (selected.status === "pending") {
      return (
        <PendingAssetView
          asset={selected}
          onFulfilled={() => setSelected(null)}
          onBack={() => setSelected(null)}
        />
      );
    }
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
        meta: selected.url ? { url: selected.url } : undefined,
      };
      return (
        <div className="flex h-full min-h-0 flex-col bg-[var(--surface-1)]">
          <div className="flex h-10 shrink-0 items-center justify-between border-b border-[var(--line)] px-3">
            <div className="flex min-w-0 items-center gap-2">
              <span className="t-meta">{kindLabel(selected.kind)}</span>
              <span className="truncate text-[12.5px] text-[var(--text)]" title={selected.name}>
                {selected.name}
              </span>
            </div>
            <button onClick={() => setSelected(null)} className="ghost-btn h-7 px-2 text-[12px]">
              <ArrowLeft size={13} />
              Retour
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

  return (
    <div className="h-full bg-[var(--surface-1)]">
      <EmptyState
        icon={Hammer}
        title={`${moduleMeta(active).label} arrive bientôt`}
        description="Cet espace de travail est en cours de préparation. Utilisez l'Éditeur et la médiathèque en attendant."
      />
    </div>
  );
}
