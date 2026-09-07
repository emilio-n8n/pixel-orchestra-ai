import { useEffect, useState } from "react";
import { useLibrary } from "@/plugins/library/store";
import { getLineage, type LineageView } from "./server";
import { UI_LABELS } from "@/lib/ui/labels";
import { ErrorBlock } from "@/components/ui/error-block";

export function LineagePanel() {
  const selected = useLibrary((s) => s.selected);
  const [lineage, setLineage] = useState<LineageView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (!selected) {
      setLineage(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setBusy(true);
    setError(null);
    getLineage({ data: { assetId: selected.id } })
      .then((r) => {
        if (!cancelled) setLineage(r as unknown as LineageView);
      })
      .catch((e) => {
        if (!cancelled) {
          setLineage(null);
          setError(e);
        }
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
        {UI_LABELS.lineage.chargement}
      </div>
    );
  }
  if (error && !lineage) {
    return (
      <div className="border-b border-[var(--line)] p-3">
        <ErrorBlock message={UI_LABELS.lineage.erreur} error={error} context="lineage.getLineage" compact />
      </div>
    );
  }
  if (!lineage) return null;

  return (
    <div className="border-b border-[var(--line)] p-3 text-[10px] text-[var(--text-muted)]">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-[10px] font-medium uppercase tracking-[0.16em] text-[var(--text-dim)]">
          {UI_LABELS.lineage.titre}
        </div>
        <span className="mono text-[9px] text-[var(--text-dim)]">
          {lineage.ancestors.length}↑ · {lineage.descendants.length}↓
        </span>
      </div>

      {lineage.nodeRun ? (
        <div className="mb-2">
          <div className="text-[9px] uppercase tracking-widest text-[var(--text-dim)]">
            {UI_LABELS.lineage.noeudProducteur}
          </div>
          <div className="mono">
            {lineage.nodeRun.nodeId} · {lineage.nodeRun.status}
          </div>
        </div>
      ) : null}

      {lineage.capabilities.length > 0 ? (
        <div className="mb-2">
          <div className="text-[9px] uppercase tracking-widest text-[var(--text-dim)]">
            {UI_LABELS.lineage.moteur}
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
            {UI_LABELS.lineage.sourcesDirectes(lineage.directSources.length)}
          </div>
          {lineage.directSources.map((s) => (
            <div key={s.id} className="mono truncate" title={s.id}>
              ↑ {s.name} <span className="text-[var(--text-dim)]">{s.id.slice(0, 10)}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="mb-2 text-[var(--text-dim)]">{UI_LABELS.lineage.racine}</div>
      )}

      {lineage.ancestors.length > 0 ? (
        <div className="mb-2">
          <div className="text-[9px] uppercase tracking-widest text-[var(--text-dim)]">
            {UI_LABELS.lineage.ancetres}
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
            {UI_LABELS.lineage.descendants}
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
          title={UI_LABELS.lineage.astuceRejouer}
          className="rounded border border-[var(--line)] px-2 py-0.5 text-[9px] uppercase tracking-widest text-[var(--text-dim)] opacity-50"
        >
          {UI_LABELS.lineage.rejouer}
        </button>
        <button
          disabled
          title={UI_LABELS.lineage.astuceDupliquer}
          className="rounded border border-[var(--line)] px-2 py-0.5 text-[9px] uppercase tracking-widest text-[var(--text-dim)] opacity-50"
        >
          {UI_LABELS.lineage.dupliquer}
        </button>
        <button
          disabled
          title={UI_LABELS.lineage.astuceComparer}
          className="rounded border border-[var(--line)] px-2 py-0.5 text-[9px] uppercase tracking-widest text-[var(--text-dim)] opacity-50"
        >
          {UI_LABELS.lineage.comparer}
        </button>
      </div>
    </div>
  );
}
