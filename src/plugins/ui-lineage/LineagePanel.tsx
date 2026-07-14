import { useEffect, useState } from "react";
import { useLibrary } from "@/plugins/library/store";
import { getLineage, type LineageView } from "./server";

export function LineagePanel() {
  const selected = useLibrary((s) => s.selected);
  const [lineage, setLineage] = useState<LineageView | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!selected) {
      setLineage(null);
      return;
    }
    let cancelled = false;
    setBusy(true);
    getLineage({ data: { assetId: selected.id } })
      .then((r) => {
        if (!cancelled) setLineage(r as unknown as LineageView);
      })
      .catch(() => {
        if (!cancelled) setLineage(null);
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selected?.id]);

  if (!selected) return null;
  if (busy && !lineage) {
    return (
      <div className="border-b border-[var(--line)] p-3 text-[10px] text-[var(--text-dim)]">
        Loading lineage…
      </div>
    );
  }
  if (!lineage) return null;

  return (
    <div className="border-b border-[var(--line)] p-3 text-[10px] text-[var(--text-muted)]">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-[10px] font-medium uppercase tracking-[0.16em] text-[var(--text-dim)]">
          Lineage
        </div>
        <span className="mono text-[9px] text-[var(--text-dim)]">
          {lineage.ancestors.length}↑ · {lineage.descendants.length}↓
        </span>
      </div>

      {lineage.nodeRun ? (
        <div className="mb-2">
          <div className="text-[9px] uppercase tracking-widest text-[var(--text-dim)]">
            Producer node
          </div>
          <div className="mono">
            {lineage.nodeRun.nodeId} · {lineage.nodeRun.status}
          </div>
        </div>
      ) : null}

      {lineage.capabilities.length > 0 ? (
        <div className="mb-2">
          <div className="text-[9px] uppercase tracking-widest text-[var(--text-dim)]">
            Capability
          </div>
          {lineage.capabilities.map((c) => (
            <div key={c.id} className="mono truncate" title={c.id}>
              {c.id}
            </div>
          ))}
        </div>
      ) : null}

      {lineage.directSources.length > 0 ? (
        <div className="mb-2">
          <div className="text-[9px] uppercase tracking-widest text-[var(--text-dim)]">
            Direct sources ({lineage.directSources.length})
          </div>
          {lineage.directSources.map((s) => (
            <div key={s.id} className="mono truncate" title={s.id}>
              ↑ {s.name} <span className="text-[var(--text-dim)]">{s.id.slice(0, 10)}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="mb-2 text-[var(--text-dim)]">no upstream — root asset</div>
      )}

      {lineage.ancestors.length > 0 ? (
        <div className="mb-2">
          <div className="text-[9px] uppercase tracking-widest text-[var(--text-dim)]">
            Ancestors
          </div>
          {lineage.ancestors.slice(0, 10).map((a) => (
            <div key={a.id} className="mono flex justify-between gap-1 text-[var(--text-muted)]">
              <span className="truncate" title={a.id}>
                ↗ {a.name}
              </span>
              <span className="text-[var(--text-dim)]">d{a.depth}</span>
            </div>
          ))}
        </div>
      ) : null}

      {lineage.descendants.length > 0 ? (
        <div>
          <div className="text-[9px] uppercase tracking-widest text-[var(--text-dim)]">
            Descendants
          </div>
          {lineage.descendants.slice(0, 10).map((d) => (
            <div key={d.id} className="mono flex justify-between gap-1 text-[var(--text-muted)]">
              <span className="truncate" title={d.id}>
                ↘ {d.name}
              </span>
              <span className="text-[var(--text-dim)]">d{d.depth}</span>
            </div>
          ))}
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-1">
        <button
          disabled
          title="Phase 9 will wire this — re-runs the graph that produced this asset"
          className="rounded border border-[var(--line)] px-2 py-0.5 text-[9px] uppercase tracking-widest text-[var(--text-dim)] opacity-50"
        >
          Re-run
        </button>
        <button
          disabled
          title="Phase 9 — clones the asset with a new id, keeping provenance"
          className="rounded border border-[var(--line)] px-2 py-0.5 text-[9px] uppercase tracking-widest text-[var(--text-dim)] opacity-50"
        >
          Fork
        </button>
        <button
          disabled
          title="Phase 9 — shows parameter diff vs parent"
          className="rounded border border-[var(--line)] px-2 py-0.5 text-[9px] uppercase tracking-widest text-[var(--text-dim)] opacity-50"
        >
          Diff
        </button>
      </div>
    </div>
  );
}
