import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLibrary } from "@/plugins/library/store";
import type { AssetKind, AssetRow } from "@/plugins/library/types";
import { getLineage, type LineageAsset, type LineageView } from "./server";
import { UI_LABELS, jobStatusLabel } from "@/lib/ui/labels";
import { ErrorBlock } from "@/components/ui/error-block";
import { ConnPill } from "@/lib/realtime/ConnPill";
import type { ConnState } from "@/lib/realtime/channel";
import { isOfflineError, nextBackoff, useOnlineStatus } from "@/lib/realtime/online";

const MAX_DEPTH_SHOWN = 3;
const MAX_PER_LEVEL = 10;

const KIND_GLYPH: Record<string, string> = {
  image: "▢",
  video: "▶",
  audio: "♪",
  html: "</>",
  doc: "▤",
  other: "·",
  pending: "⏳",
};

function toSelectable(a: LineageAsset, projectId: string): AssetRow {
  return {
    id: a.id,
    projectId,
    kind: (a.kind as AssetKind) ?? "other",
    name: a.name,
    mime: null,
    sizeBytes: 0,
    blobHash: null,
    thumbnailHash: null,
    createdAt: a.createdAt,
    updatedAt: a.createdAt,
    status: "ready",
  };
}

function DagNode({ asset, onOpen }: { asset: LineageAsset; onOpen: (a: LineageAsset) => void }) {
  return (
    <button
      onClick={() => onOpen(asset)}
      title={`${asset.name} — ${UI_LABELS.library.voirOrigine}`}
      className="mono flex w-full items-center gap-1.5 truncate rounded border border-[var(--line)] bg-[var(--surface-2)] px-1.5 py-1 text-left text-[var(--text-muted)] transition-colors hover:border-[var(--line-strong)] hover:text-[var(--text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
    >
      <span className="shrink-0 text-[var(--text-dim)]">{KIND_GLYPH[asset.kind] ?? "·"}</span>
      <span className="min-w-0 flex-1 truncate" title={asset.id}>
        {asset.name}
      </span>
      <span className="shrink-0 text-[var(--text-dim)]">d{asset.depth}</span>
    </button>
  );
}

export function LineagePanel() {
  const selected = useLibrary((s) => s.selected);
  const setSelected = useLibrary((s) => s.setSelected);
  const online = useOnlineStatus();
  const [lineage, setLineage] = useState<LineageView | null>(null);
  const [busy, setBusy] = useState(false);
  // True only while a failed load backs off silently — nav refetches
  // (busy) never flash the pill (ConnPill contract: never in normal op).
  const [retrying, setRetrying] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const attempt = useRef(0);
  const timer = useRef<number | null>(null);
  const assetId = selected?.id;

  const load = useCallback(() => {
    if (!assetId) return;
    if (timer.current != null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    setBusy(true);
    getLineage({ data: { assetId } })
      .then((r) => {
        attempt.current = 0;
        setError(null);
        setRetrying(false);
        setLineage(r as unknown as LineageView);
        setBusy(false);
      })
      .catch((e) => {
        setBusy(false);
        // Offline → silent, stale DAG stays, online event retries.
        if (isOfflineError(e)) return;
        // Real error → keep stale DAG (stale-while-reconnect), one compact
        // ErrorBlock, silent backoff retry (no error storm).
        setError(e);
        setRetrying(true);
        const delay = nextBackoff(attempt.current++);
        timer.current = window.setTimeout(() => {
          timer.current = null;
          load();
        }, delay);
      });
  }, [assetId]);

  useEffect(() => {
    if (!assetId) {
      setLineage(null);
      setError(null);
      return;
    }
    attempt.current = 0;
    setError(null);
    load();
    return () => {
      if (timer.current != null) window.clearTimeout(timer.current);
    };
  }, [assetId, load]);

  const wasOnline = useRef(online);
  useEffect(() => {
    const back = online && !wasOnline.current;
    wasOnline.current = online;
    if (back && assetId) {
      attempt.current = 0;
      load();
    }
  }, [online, assetId, load]);

  const conn: ConnState = !online
    ? "offline"
    : error || (retrying && lineage)
      ? "reconnecting"
      : "live";

  const parents = useMemo(
    () =>
      (lineage?.ancestors ?? [])
        .filter((a) => a.depth <= MAX_DEPTH_SHOWN)
        .sort((a, b) => a.depth - b.depth)
        .slice(0, MAX_PER_LEVEL),
    [lineage],
  );
  const children = useMemo(
    () =>
      (lineage?.descendants ?? [])
        .filter((d) => d.depth <= MAX_DEPTH_SHOWN)
        .sort((a, b) => a.depth - b.depth)
        .slice(0, MAX_PER_LEVEL),
    [lineage],
  );
  const hiddenParents = (lineage?.ancestors.length ?? 0) - parents.length;
  const hiddenChildren = (lineage?.descendants.length ?? 0) - children.length;

  const openAsset = useCallback(
    (a: LineageAsset) => {
      const projectId = selected?.projectId;
      if (!projectId) return;
      setSelected(toSelectable(a, projectId));
    },
    [selected?.projectId, setSelected],
  );

  if (!selected) return null;
  if (busy && !lineage && conn === "live") {
    return (
      <div className="border-b border-[var(--line)] p-3 text-[10px] text-[var(--text-dim)]">
        {UI_LABELS.lineage.chargement}
      </div>
    );
  }
  if (!lineage) {
    // Nothing stale to show: offline → quiet pill only; real error → diagnostics.
    if (!online || (!error && busy)) {
      return (
        <div className="flex items-center gap-2 border-b border-[var(--line)] p-3">
          <ConnPill state={conn} />
        </div>
      );
    }
    if (error) {
      return (
        <div className="border-b border-[var(--line)] p-3">
          <ErrorBlock
            message={UI_LABELS.lineage.erreur}
            error={error}
            context="lineage.getLineage"
            compact
          />
        </div>
      );
    }
    return null;
  }

  return (
    <div className="border-b border-[var(--line)] p-3 text-[10px] text-[var(--text-muted)]">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="text-[10px] font-medium uppercase tracking-[0.16em] text-[var(--text-dim)]">
          {UI_LABELS.lineage.titre}
        </div>
        <div className="flex items-center gap-2">
          <ConnPill state={conn} />
          <span className="mono text-[9px] text-[var(--text-dim)]">
            {lineage.ancestors.length}↑ · {lineage.descendants.length}↓
          </span>
        </div>
      </div>

      {error ? (
        <div className="mb-2">
          <ErrorBlock
            message={UI_LABELS.lineage.erreur}
            error={error}
            context="lineage.getLineage"
            compact
          />
        </div>
      ) : null}

      {/* DAG: parents → seed → descendants. Depth ≤3, click-through to Library. */}
      <div className="space-y-1.5">
        {parents.length > 0 ? (
          <div className="space-y-1">
            <div className="text-[9px] uppercase tracking-widest text-[var(--text-dim)]">
              {UI_LABELS.lineage.ancetres} ({lineage.ancestors.length})
            </div>
            {parents.map((a) => (
              <DagNode key={a.id} asset={a} onOpen={openAsset} />
            ))}
            {hiddenParents > 0 ? (
              <div className="mono text-center text-[9px] text-[var(--text-dim)]">
                +{hiddenParents}…
              </div>
            ) : null}
            <div className="flex justify-center text-[var(--text-dim)]" aria-hidden>
              ↓
            </div>
          </div>
        ) : (
          <div className="text-[var(--text-dim)]">{UI_LABELS.lineage.racine}</div>
        )}

        <div className="rounded border border-[var(--accent)]/50 bg-[var(--accent-quiet)] px-1.5 py-1">
          <div className="mono truncate text-[var(--text)]" title={lineage.seed.id}>
            {KIND_GLYPH[lineage.seed.kind] ?? "·"} {lineage.seed.name}
          </div>
          {lineage.nodeRun ? (
            <div className="mono truncate text-[9px] text-[var(--text-dim)]">
              {UI_LABELS.lineage.noeudProducteur} · {lineage.nodeRun.nodeId} ·{" "}
              {jobStatusLabel(lineage.nodeRun.status)}
            </div>
          ) : null}
          {lineage.capabilities.length > 0 ? (
            <div
              className="mono truncate text-[9px] text-[var(--text-dim)]"
              title={lineage.capabilities[0].id}
            >
              {UI_LABELS.lineage.moteur} · {lineage.capabilities[0].id}
            </div>
          ) : null}
        </div>

        {children.length > 0 ? (
          <div className="space-y-1">
            <div className="flex justify-center text-[var(--text-dim)]" aria-hidden>
              ↓
            </div>
            <div className="text-[9px] uppercase tracking-widest text-[var(--text-dim)]">
              {UI_LABELS.lineage.descendants} ({lineage.descendants.length})
            </div>
            {children.map((d) => (
              <DagNode key={d.id} asset={d} onOpen={openAsset} />
            ))}
            {hiddenChildren > 0 ? (
              <div className="mono text-center text-[9px] text-[var(--text-dim)]">
                +{hiddenChildren}…
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

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
