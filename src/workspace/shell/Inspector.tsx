import { useRegistrySnapshot } from "@/kernel/react";
import { useLibrary } from "@/plugins/library/store";

export function Inspector() {
  const registry = useRegistrySnapshot();
  const panels = registry.panelsForSlot("inspector");
  const selected = useLibrary((s) => s.selected);
  const setSelected = useLibrary((s) => s.setSelected);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[var(--surface-2)]">
      <Header />
      <div className="flex-1 overflow-auto">
        {selected ? <AssetInspector asset={selected} onClose={() => setSelected(null)} /> : null}
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

function AssetInspector({
  asset,
  onClose,
}: {
  asset: ReturnType<typeof useLibrary.getState>["selected"] & object;
  onClose: () => void;
}) {
  if (!asset) return null;
  return (
    <div className="border-b border-[var(--line)] p-3 text-xs text-[var(--text-muted)]">
      <div className="flex items-center justify-between">
        <div className="text-[10px] font-medium uppercase tracking-[0.16em] text-[var(--text-dim)]">
          Selected asset
        </div>
        <button
          onClick={onClose}
          className="text-[10px] uppercase tracking-widest text-[var(--text-dim)] hover:text-[var(--text-muted)]"
        >
          clear
        </button>
      </div>
      <div className="mt-2 space-y-1">
        <Row k="id" v={asset.id} />
        <Row k="name" v={asset.name} />
        <Row k="kind" v={asset.kind} />
        <Row k="mime" v={asset.mime ?? "—"} />
        <Row k="size" v={formatBytes(asset.sizeBytes)} />
        <Row k="hash" v={asset.blobHash ?? "—"} />
        <Row k="created" v={new Date(asset.createdAt).toLocaleString()} />
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-[10px] uppercase tracking-widest text-[var(--text-dim)]">{k}</span>
      <span className="mono truncate text-right text-[11px] text-[var(--text)]" title={v}>
        {v}
      </span>
    </div>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
