import { useCallback, useEffect, useState } from "react";
import { useKernelEvents } from "@/kernel/react";
import { useLibrary } from "./store";
import { useLibraryProject } from "./project";
import { importAsset, listAssets } from "./server";
import type { AssetRow } from "./types";

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

export function LibraryPanel() {
  const projectId = useLibraryProject();
  const setSelected = useLibrary((s) => s.setSelected);
  const [assets, setAssets] = useState<AssetRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  // Refetch on AssetImported events.
  const lastImport = useKernelEvents(1)
    .filter((e) => e.type === "AssetImported")
    .slice(-1)[0];
  useEffect(() => {
    if (!projectId) return;
    listAssets({ data: { projectId } })
      .then((r) => setAssets(r.assets))
      .catch(() => setAssets([]));
  }, [projectId, lastImport]);

  const onFiles = useCallback(
    async (files: FileList | File[]) => {
      if (!projectId) return;
      setBusy(true);
      try {
        for (const f of Array.from(files)) {
          const buf = new Uint8Array(await f.arrayBuffer());
          await importAsset({
            data: {
              projectId,
              name: f.name,
              mime: f.type || "application/octet-stream",
              bytesBase64: bytesToBase64(buf),
            },
          });
        }
      } finally {
        setBusy(false);
      }
    },
    [projectId],
  );

  if (!projectId) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-sm text-[var(--text-muted)]">
        No project open.{" "}
        <a href="/" className="ml-2 text-[var(--accent)] underline">
          Pick a workspace
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
          if (e.dataTransfer.files.length) onFiles(e.dataTransfer.files);
        }}
        className={`m-4 flex shrink-0 items-center justify-center rounded-md border border-dashed p-6 text-center text-xs transition-colors ${
          dragOver
            ? "border-[var(--accent)] bg-[var(--accent-quiet)] text-[var(--text)]"
            : "border-[var(--line)] text-[var(--text-dim)]"
        }`}
      >
        <label className="cursor-pointer">
          <span className="block text-sm text-[var(--text-muted)]">
            Drop files here or <span className="text-[var(--accent)] underline">browse</span>
          </span>
          <span className="mono mt-1 block text-[10px] uppercase tracking-widest">
            images · videos · audio · html · docs
          </span>
          <input
            type="file"
            multiple
            className="hidden"
            onChange={(e) => e.target.files && onFiles(e.target.files)}
            disabled={busy}
          />
        </label>
      </div>
      <div className="flex-1 overflow-auto px-4 pb-4">
        {assets.length === 0 ? (
          <div className="text-center text-xs text-[var(--text-dim)]">
            No assets yet. Import something above.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {assets.map((a) => (
              <AssetCard key={a.id} asset={a} onOpen={() => setSelected(a)} />
            ))}
          </div>
        )}
        {busy ? (
          <div className="mt-3 text-center text-[11px] text-[var(--text-dim)]">Importing…</div>
        ) : null}
      </div>
    </div>
  );
}

function AssetCard({ asset, onOpen }: { asset: AssetRow; onOpen: () => void }) {
  return (
    <button
      onClick={onOpen}
      className="group flex flex-col gap-1 rounded-md border border-[var(--line)] bg-[var(--surface-2)] p-2 text-left transition-colors hover:border-[var(--line-strong)]"
    >
      <div className="flex aspect-square items-center justify-center overflow-hidden rounded bg-[var(--surface-3)]">
        <KindPreview asset={asset} />
      </div>
      <div className="truncate text-[11px] text-[var(--text)]" title={asset.name}>
        {asset.name}
      </div>
      <div className="mono text-[9px] uppercase tracking-widest text-[var(--text-dim)]">
        {asset.kind} · {formatBytes(asset.sizeBytes)}
      </div>
    </button>
  );
}

function KindPreview({ asset }: { asset: AssetRow }) {
  if (asset.kind === "image" && asset.blobHash) {
    return <ImageThumb hash={asset.blobHash} alt={asset.name} />;
  }
  return <KindGlyph kind={asset.kind} />;
}

function KindGlyph({ kind }: { kind: AssetRow["kind"] }) {
  const glyph: Record<AssetRow["kind"], string> = {
    image: "▢",
    video: "▶",
    audio: "♪",
    html: "</>",
    doc: "▤",
    other: "·",
  };
  return <span className="text-2xl text-[var(--text-dim)]">{glyph[kind]}</span>;
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
  if (!src) return <KindGlyph kind="image" />;
  return <img src={src} alt={alt} className="h-full w-full object-cover" />;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
