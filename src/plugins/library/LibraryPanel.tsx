import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Code2,
  File as FileIcon,
  FileText,
  Film,
  Hourglass,
  Image as ImageIcon,
  Library as LibraryIcon,
  Music,
  Search,
} from "lucide-react";
import { useKernel, useKernelEvents } from "@/kernel/react";
import { useLibrary } from "./store";
import { useLibraryProject } from "./project";
import { fulfillPendingAsset, getAssetsProvenance, importAsset, listAssets } from "./server";
import type { AssetRow } from "./types";
import { dedupeAssets, durationMsOf, takeGroupOf, takeIndexOf, takeLabel } from "./types";
import { KIND_LABELS, UI_LABELS, kindLabel, toolLabel } from "@/lib/ui/labels";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorBlock } from "@/components/ui/error-block";

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

const PAGE_SIZE = 50;
const KIND_FILTERS = ["all", "image", "video", "audio", "html", "doc", "pending"] as const;
const FOCUS_RING =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]";

export function LibraryPanel() {
  const projectId = useLibraryProject();
  const setSelected = useLibrary((s) => s.setSelected);
  const kernel = useKernel();
  const [assets, setAssets] = useState<AssetRow[]>([]);
  const [total, setTotal] = useState(0);
  const [initialLoading, setInitialLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [query, setQuery] = useState("");
  const [kindFilter, setKindFilter] = useState<(typeof KIND_FILTERS)[number]>("all");
  const [fulfillingId, setFulfillingId] = useState<string | null>(null);
  const [provenance, setProvenance] = useState<
    Record<string, { tool: string | null; parentCount: number }>
  >({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  const lastMutation = useKernelEvents(1)
    .filter((e) => e.type === "AssetImported" || e.type === "AssetUpdated")
    .slice(-1)[0];

  const fetchPage = useCallback(
    async (offset: number, append: boolean) => {
      if (!projectId) return;
      if (append) setLoadingMore(true);
      else setInitialLoading(true);
      setError(null);
      try {
        const r = await listAssets({ data: { projectId, offset, limit: PAGE_SIZE } });
        const clean = dedupeAssets(r.assets);
        setAssets((prev) => (append ? dedupeAssets([...prev, ...clean]) : clean));
        setTotal(r.total);
      } catch (loadError) {
        if (!append) {
          setAssets([]);
          setTotal(0);
        }
        setError(loadError);
      } finally {
        setInitialLoading(false);
        setLoadingMore(false);
      }
    },
    [projectId],
  );

  useEffect(() => {
    if (!projectId) return;
    void fetchPage(0, false);
  }, [projectId, lastMutation, fetchPage]);

  useEffect(() => {
    if (assets.length === 0) return;
    let cancelled = false;
    const ids = assets.slice(0, 100).map((a) => a.id);
    getAssetsProvenance({ data: { assetIds: ids } })
      .then((r) => {
        if (!cancelled) setProvenance(r.provenance as typeof provenance);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assets.map((a) => a.id).join(",")]);

  const onFiles = useCallback(
    async (files: FileList | File[]) => {
      if (!projectId) return;
      setBusy(true);
      setError(null);
      try {
        for (const f of Array.from(files)) {
          const buf = new Uint8Array(await f.arrayBuffer());
          const res = (await importAsset({
            data: {
              projectId,
              name: f.name,
              mime: f.type || "application/octet-stream",
              bytesBase64: bytesToBase64(buf),
            },
          })) as { deduped?: boolean };
          if (res.deduped) kernel.notify?.(UI_LABELS.library.doublonIgnore, "info");
        }
        await fetchPage(0, false);
      } catch (importError) {
        setError(importError);
      } finally {
        setBusy(false);
      }
    },
    [projectId, fetchPage, kernel],
  );

  const fulfillPending = useCallback(
    async (pendingId: string, file: File) => {
      setFulfillingId(pendingId);
      setError(null);
      try {
        const buf = new Uint8Array(await file.arrayBuffer());
        const res = await fulfillPendingAsset({
          data: {
            assetId: pendingId,
            mime: file.type || "application/octet-stream",
            bytesBase64: bytesToBase64(buf),
          },
        });
        if (res.asset) {
          setAssets((prev) => dedupeAssets(prev.map((a) => (a.id === pendingId ? res.asset! : a))));
          kernel.notify?.(UI_LABELS.library.mediaComplete, "success");
        } else {
          await fetchPage(0, false);
        }
      } catch (e) {
        setError(e);
      } finally {
        setFulfillingId(null);
      }
    },
    [fetchPage, kernel],
  );

  const loadMore = useCallback(async () => {
    if (!projectId || loadingMore) return;
    await fetchPage(assets.length, true);
  }, [projectId, loadingMore, assets.length, fetchPage]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return assets.filter((a) => {
      if (kindFilter === "pending") {
        if (a.status !== "pending") return false;
      } else if (kindFilter !== "all" && a.kind !== kindFilter) {
        if (!(a.status === "pending" && a.pendingKind === kindFilter)) return false;
      }
      if (q && !`${a.name} ${a.prompt ?? ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [assets, query, kindFilter]);

  const ordered = useMemo(() => {
    const groups = new Map<string, AssetRow[]>();
    const singles: AssetRow[] = [];
    for (const a of filtered) {
      const g = takeGroupOf(a);
      if (g && a.kind === "audio") {
        if (!groups.has(g)) groups.set(g, []);
        groups.get(g)!.push(a);
      } else {
        singles.push(a);
      }
    }
    const groupEntries = [...groups.entries()].map(([, takes]) => {
      takes.sort((x, y) => (takeIndexOf(x) ?? 0) - (takeIndexOf(y) ?? 0));
      return { takes, maxDate: Math.max(...takes.map((t) => t.createdAt)) };
    });
    groupEntries.sort((a, b) => b.maxDate - a.maxDate);
    const items: Array<{ date: number; rows: AssetRow[] }> = [
      ...singles.map((s) => ({ date: s.createdAt, rows: [s] })),
      ...groupEntries.map(({ takes, maxDate }) => ({ date: maxDate, rows: takes })),
    ];
    items.sort((a, b) => {
      const aPend = a.rows[0]?.status === "pending" ? 1 : 0;
      const bPend = b.rows[0]?.status === "pending" ? 1 : 0;
      if (aPend !== bPend) return bPend - aPend;
      return b.date - a.date;
    });
    return items.flatMap((it) => it.rows);
  }, [filtered]);

  if (!projectId) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-sm text-[var(--text-muted)]">
        {UI_LABELS.library.sansProjet}{" "}
        <a href="/" className={`ml-2 text-[var(--accent)] underline ${FOCUS_RING}`}>
          {UI_LABELS.library.choisirEspace}
        </a>
        .
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[var(--surface-1)]">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer.files.length) void onFiles(e.dataTransfer.files);
        }}
        className={`m-4 mb-2 flex shrink-0 items-center justify-center rounded-xl border border-dashed p-5 text-center transition-colors ${
          dragOver
            ? "border-[var(--accent)] bg-[var(--accent-quiet)] text-[var(--text)]"
            : "border-[var(--line)] text-[var(--text-dim)]"
        }`}
      >
        <button
          onClick={() => fileInputRef.current?.click()}
          className={`cursor-pointer ${FOCUS_RING} rounded`}
          disabled={busy}
        >
          <span className="block text-sm text-[var(--text-muted)]">
            {UI_LABELS.library.depot}{" "}
            <span className="text-[var(--accent)] underline">{UI_LABELS.library.parcourir}</span>
          </span>
          <span className="mono mt-1 block text-[10px] uppercase tracking-widest">
            {UI_LABELS.library.formats}
          </span>
          {busy ? (
            <span className="mt-1 block text-[11px]">{UI_LABELS.library.importEnCours}</span>
          ) : null}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) void onFiles(e.target.files);
            e.target.value = "";
          }}
          disabled={busy}
        />
      </div>

      <div className="flex shrink-0 items-center gap-2 px-4 pb-2">
        <div className="relative min-w-0 flex-1">
          <Search
            size={13}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-dim)]"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={UI_LABELS.library.rechercher}
            className={`h-8 w-full rounded-lg border border-[var(--line)] bg-[var(--surface-2)] pl-8 pr-2 text-[12px] text-[var(--text)] outline-none placeholder:text-[var(--text-dim)] focus:border-[var(--accent)] ${FOCUS_RING}`}
          />
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap gap-1.5 px-4 pb-3">
        {KIND_FILTERS.map((k) => (
          <button
            key={k}
            onClick={() => setKindFilter(k)}
            className={`rounded-full border px-2.5 py-1 text-[11px] transition-colors ${FOCUS_RING} ${
              kindFilter === k
                ? "border-[var(--accent)] bg-[var(--accent-quiet)] text-[var(--text)]"
                : "border-[var(--line)] text-[var(--text-dim)] hover:border-[var(--line-strong)] hover:text-[var(--text-muted)]"
            }`}
          >
            {k === "all"
              ? UI_LABELS.library.filtreTous
              : k === "pending"
                ? UI_LABELS.library.enAttente
                : kindLabel(k)}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-auto px-4 pb-4">
        {error ? (
          <div className="mb-3">
            <ErrorBlock
              message={String((error as Error)?.message ?? UI_LABELS.library.echecChargement)}
              error={error}
              context="library.list"
            />
          </div>
        ) : null}
        {initialLoading ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {Array.from({ length: 12 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        ) : assets.length === 0 ? (
          <EmptyState
            icon={LibraryIcon}
            title={UI_LABELS.library.videTitre}
            description={UI_LABELS.library.videDescription}
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className={`h-8 rounded-lg bg-[var(--accent)] px-3.5 text-[12px] font-medium text-[var(--accent-fg)] transition-colors hover:bg-[var(--accent-strong)] ${FOCUS_RING}`}
                >
                  {UI_LABELS.library.importer}
                </button>
                <button
                  onClick={() => kernel.notify?.(UI_LABELS.library.demanderDirector, "info")}
                  className={`h-8 rounded-lg border border-[var(--line)] px-3.5 text-[12px] text-[var(--text-muted)] transition-colors hover:border-[var(--line-strong)] hover:text-[var(--text)] ${FOCUS_RING}`}
                >
                  {UI_LABELS.library.demanderDirector}
                </button>
              </div>
            }
          />
        ) : filtered.length === 0 ? (
          <div className="py-10 text-center text-xs text-[var(--text-dim)]">
            Aucun résultat pour « {query} ».
            <button
              onClick={() => {
                setQuery("");
                setKindFilter("all");
              }}
              className={`ml-2 text-[var(--accent)] underline ${FOCUS_RING} rounded`}
            >
              {UI_LABELS.common.reessayer}
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {ordered.map((a) => (
              <AssetCard
                key={a.id}
                asset={a}
                provenance={provenance[a.id]}
                fulfilling={fulfillingId === a.id}
                onOpen={() => setSelected(a)}
                onFulfill={(f) => void fulfillPending(a.id, f)}
              />
            ))}
          </div>
        )}
        {assets.length < total && !initialLoading && (
          <div className="mt-3 flex justify-center pb-4">
            <button
              onClick={() => void loadMore()}
              disabled={loadingMore}
              className={`rounded-md border border-[var(--line)] bg-[var(--surface-2)] px-4 py-1.5 text-[11px] text-[var(--text-muted)] hover:border-[var(--line-strong)] hover:text-[var(--text)] disabled:opacity-50 ${FOCUS_RING}`}
            >
              {loadingMore
                ? UI_LABELS.library.chargement
                : UI_LABELS.library.chargerPlus(assets.length, total)}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="flex animate-pulse flex-col gap-2 rounded-xl border border-[var(--line)] bg-[var(--surface-2)] p-2">
      <div className="aspect-square rounded-lg bg-[var(--surface-3)]" />
      <div className="h-3 w-3/4 rounded bg-[var(--surface-3)]" />
      <div className="h-2 w-1/2 rounded bg-[var(--surface-3)]" />
    </div>
  );
}

function AssetCard({
  asset,
  provenance,
  fulfilling,
  onOpen,
  onFulfill,
}: {
  asset: AssetRow;
  provenance?: { tool: string | null; parentCount: number };
  fulfilling: boolean;
  onOpen: () => void;
  onFulfill: (f: File) => void;
}) {
  const isPending = asset.status === "pending";
  const [dragOver, setDragOver] = useState(false);
  const takeGroup = takeGroupOf(asset);
  const takeIndex = takeIndexOf(asset);
  const durationMs = durationMsOf(asset);

  return (
    <div
      onClick={onOpen}
      onDragOver={
        isPending
          ? (e) => {
              e.preventDefault();
              e.stopPropagation();
              setDragOver(true);
            }
          : undefined
      }
      onDragLeave={isPending ? () => setDragOver(false) : undefined}
      onDrop={
        isPending
          ? (e) => {
              e.preventDefault();
              e.stopPropagation();
              setDragOver(false);
              const f = e.dataTransfer.files?.[0];
              if (f && !fulfilling) onFulfill(f);
            }
          : undefined
      }
      className={`group flex cursor-pointer flex-col gap-1.5 rounded-xl border p-2 text-left transition-all hover:-translate-y-0.5 hover:shadow-[var(--shadow-pop)] ${FOCUS_RING} ${
        isPending
          ? dragOver
            ? "border-[var(--accent)] bg-[var(--accent-quiet)]"
            : "border-dashed border-[var(--status-warn)]/60 bg-[var(--status-warn)]/5 hover:border-[var(--status-warn)]"
          : "border-[var(--line)] bg-[var(--surface-2)] hover:border-[var(--line-strong)]"
      }`}
      title={isPending ? UI_LABELS.library.depotCompleter : asset.name}
    >
      <div className="relative flex aspect-square items-center justify-center overflow-hidden rounded-lg bg-[var(--surface-3)]">
        <KindPreview asset={asset} />
        {isPending ? (
          <span className="absolute left-1.5 top-1.5 flex items-center gap-1 rounded-full border border-[var(--status-warn)]/50 bg-[var(--surface-1)]/90 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-widest text-[var(--status-warn)]">
            <Hourglass size={10} />
            {UI_LABELS.library.enAttente}
          </span>
        ) : null}
        {takeGroup != null && takeIndex != null ? (
          <span className="absolute left-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-md bg-[var(--accent)] text-[10px] font-bold text-[var(--accent-fg)]">
            {takeLabel(takeIndex)}
          </span>
        ) : null}
        {fulfilling ? (
          <span className="absolute inset-0 flex items-center justify-center bg-[var(--surface-1)]/70 text-[11px] text-[var(--text)]">
            {UI_LABELS.library.depotEnCours}
          </span>
        ) : null}
      </div>
      <div className="truncate text-[11px] font-medium text-[var(--text)]" title={asset.name}>
        {asset.name}
      </div>
      <div className="mono text-[9px] uppercase tracking-widest text-[var(--text-dim)]">
        {isPending ? (
          <span className="flex items-center gap-1 normal-case tracking-normal text-[var(--status-warn)]">
            <KindIcon kind={asset.pendingKind ?? "other"} size={11} />
            {kindLabel(asset.pendingKind ?? "pending")} · {UI_LABELS.library.fichierAttendu}
          </span>
        ) : (
          <span className="flex items-center gap-1">
            <KindIcon kind={asset.kind} size={11} />
            {kindLabel(asset.kind)} · {formatBytes(asset.sizeBytes)}
            {durationMs != null ? ` · ${(durationMs / 1000).toFixed(1)}s` : null}
          </span>
        )}
      </div>
      {isPending && asset.prompt ? (
        <div
          className="line-clamp-2 text-[10px] leading-snug text-[var(--text-dim)]"
          title={asset.prompt}
        >
          {asset.prompt}
        </div>
      ) : null}
      {!isPending && provenance?.tool ? (
        <div className="flex items-center justify-between gap-1 text-[10px] text-[var(--text-dim)]">
          <span className="truncate" title={provenance.tool}>
            {toolLabel(provenance.tool)}
            {provenance.parentCount > 0
              ? ` · ${provenance.parentCount} parent${provenance.parentCount > 1 ? "s" : ""}`
              : ""}
          </span>
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              onOpen();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.stopPropagation();
                onOpen();
              }
            }}
            className="shrink-0 text-[var(--accent)] hover:underline"
            title={UI_LABELS.library.voirOrigine}
          >
            {UI_LABELS.library.origine}
          </span>
        </div>
      ) : null}
      {isPending ? (
        <label
          onClick={(e) => e.stopPropagation()}
          className="mt-0.5 flex cursor-pointer items-center justify-center rounded-md border border-dashed border-[var(--status-warn)]/40 px-2 py-1 text-[10px] text-[var(--text-muted)] transition-colors hover:border-[var(--status-warn)] hover:text-[var(--text)]"
        >
          {fulfilling ? UI_LABELS.library.depotEnCours : UI_LABELS.library.depotFichier}
          <input
            type="file"
            className="hidden"
            disabled={fulfilling}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onFulfill(f);
              e.target.value = "";
            }}
          />
        </label>
      ) : null}
    </div>
  );
}

function KindIcon({ kind, size = 14 }: { kind: string; size?: number }) {
  switch (kind) {
    case "image":
      return <ImageIcon size={size} />;
    case "video":
      return <Film size={size} />;
    case "audio":
      return <Music size={size} />;
    case "html":
      return <Code2 size={size} />;
    case "doc":
      return <FileText size={size} />;
    case "pending":
      return <Hourglass size={size} />;
    default:
      return <FileIcon size={size} />;
  }
}

function KindPreview({ asset }: { asset: AssetRow }) {
  if (asset.status === "pending") {
    return (
      <div className="flex flex-col items-center gap-1.5 p-3 text-center">
        <KindIcon kind={asset.pendingKind ?? "pending"} size={26} />
        <span className="px-2 text-[10px] leading-snug text-[var(--text-dim)]">
          {UI_LABELS.library.depotCompleter}
        </span>
      </div>
    );
  }
  if (asset.kind === "image" && asset.url) {
    return (
      <img src={asset.url} alt={asset.name} loading="lazy" className="h-full w-full object-cover" />
    );
  }
  if (asset.kind === "image" && asset.blobHash) {
    return <ImageThumb hash={asset.blobHash} alt={asset.name} />;
  }
  if (asset.kind === "audio") {
    return <AudioWaveform asset={asset} />;
  }
  return (
    <span className="text-[var(--text-dim)]">
      <KindIcon kind={asset.kind} size={26} />
    </span>
  );
}

function ImageThumb({ hash, alt }: { hash: string; alt: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    import("./server")
      .then(({ getAssetBytes }) => getAssetBytes({ data: { hash } }))
      .then((r) => {
        if (cancelled) return;
        setSrc(`data:image;base64,${r.bytesBase64}`);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [hash]);
  if (!src)
    return (
      <span className="text-[var(--text-dim)]">
        <ImageIcon size={26} />
      </span>
    );
  return <img src={src} alt={alt} className="h-full w-full object-cover" />;
}

/** Lightweight canvas waveform for audio — Web Audio decode when possible, deterministic fallback bars otherwise. */
function AudioWaveform({ asset }: { asset: AssetRow }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [audioSrc, setAudioSrc] = useState<string | null>(asset.url ?? null);

  useEffect(() => {
    setAudioSrc(asset.url ?? null);
  }, [asset.url]);

  useEffect(() => {
    let cancelled = false;
    if (!audioSrc && asset.blobHash) {
      const hash = asset.blobHash;
      const mime = asset.mime || "audio/mpeg";
      import("./server")
        .then(({ getAssetBytes }) => getAssetBytes({ data: { hash } }).catch(() => null))
        .then((r) => {
          if (cancelled || !r) return;
          setAudioSrc(`data:${mime};base64,${r.bytesBase64}`);
        })
        .catch(() => {});
    }
    return () => {
      cancelled = true;
    };
  }, [asset.blobHash, asset.mime, audioSrc]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelled = false;
    let audioCtx: AudioContext | null = null;
    const drawBars = (peaks: number[]) => {
      if (cancelled) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = canvas.clientWidth * dpr;
      const h = canvas.clientHeight * dpr;
      if (w === 0 || h === 0) return;
      canvas.width = w;
      canvas.height = h;
      ctx.clearRect(0, 0, w, h);
      const n = peaks.length;
      const step = Math.floor(w / n);
      const gap = Math.max(1, Math.floor(step / 4));
      const barW = Math.max(1, step - gap);
      const accent = getComputedStyle(canvas).getPropertyValue("--accent").trim() || "#8b5cf6";
      ctx.fillStyle = accent;
      peaks.forEach((p, i) => {
        const bh = Math.max(2, p * h * 0.9);
        const x = i * step;
        const y = (h - bh) / 2;
        ctx.globalAlpha = 0.45 + p * 0.55;
        ctx.beginPath();
        if (typeof ctx.roundRect === "function") ctx.roundRect(x, y, barW, bh, 1);
        else ctx.rect(x, y, barW, bh);
        ctx.fill();
      });
      ctx.globalAlpha = 1;
    };
    const fallbackPeaks = () => {
      const seed = [...asset.id].reduce((a, c) => a + c.charCodeAt(0), 0);
      const peaks: number[] = [];
      for (let i = 0; i < 48; i++) {
        const v = Math.abs(Math.sin(seed * 0.37 + i * 0.55) * 0.6 + Math.sin(i * 1.7 + seed) * 0.4);
        peaks.push(0.15 + Math.min(0.85, v));
      }
      drawBars(peaks);
    };
    if (!audioSrc) {
      fallbackPeaks();
      return () => {
        cancelled = true;
      };
    }
    const src = audioSrc;
    void (async () => {
      try {
        const res = await fetch(src);
        const buf = await res.arrayBuffer();
        if (cancelled) return;
        const AC =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        audioCtx = new AC();
        const decoded = await audioCtx.decodeAudioData(buf);
        if (cancelled) return;
        const ch = decoded.getChannelData(0);
        const n = 48;
        const peaks: number[] = [];
        const block = Math.max(1, Math.floor(ch.length / n));
        for (let i = 0; i < n; i++) {
          let max = 0;
          for (let j = i * block; j < (i + 1) * block && j < ch.length; j += 16) {
            const v = Math.abs(ch[j]);
            if (v > max) max = v;
          }
          peaks.push(Math.max(0.12, Math.min(1, max * 1.4)));
        }
        drawBars(peaks);
      } catch {
        if (!cancelled) fallbackPeaks();
      }
    })();
    return () => {
      cancelled = true;
      try {
        void audioCtx?.close();
      } catch {
        /* already closed */
      }
    };
  }, [asset.id, audioSrc]);

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-1 p-2">
      <canvas ref={canvasRef} className="h-12 w-full" />
      {audioSrc ? (
        <audio
          controls
          src={audioSrc}
          preload="none"
          className="h-6 w-full"
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <span className="flex items-center gap-1 text-[10px] text-[var(--text-dim)]">
          <Music size={11} />
          {KIND_LABELS.audio}
        </span>
      )}
    </div>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} o`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} Ko`;
  return `${(n / 1024 / 1024).toFixed(1)} Mo`;
}
