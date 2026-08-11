import { useEffect, useState } from "react";
import { Clock, FileText, Film, Image as ImageIcon, Music, Sparkles, Type as TypeIcon } from "lucide-react";
import { Waveform } from "./waveform";
import { kindLabel } from "@/lib/ui/labels";

export interface AssetCardData {
  id: string;
  name: string;
  kind: string;
  url?: string | null;
  thumbnailUrl?: string | null;
  durationMs?: number | null;
  ai?: boolean;
  pending?: boolean;
}

const KIND_ICON: Record<string, typeof ImageIcon> = {
  image: ImageIcon,
  video: Film,
  audio: Music,
  html: TypeIcon,
  doc: FileText,
};

export function formatDuration(ms?: number | null): string | null {
  if (!ms || ms <= 0) return null;
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function AssetCard({
  asset,
  selected,
  onOpen,
  onDragStart,
  thumbnailLoader,
}: {
  asset: AssetCardData;
  selected?: boolean;
  onOpen?: () => void;
  onDragStart?: (e: React.DragEvent) => void;
  /** Optional async resolver used when the asset has no direct URL. */
  thumbnailLoader?: () => Promise<string | null>;
}) {
  const Icon = KIND_ICON[asset.kind] ?? FileText;
  const [lazySrc, setLazySrc] = useState<string | null>(null);
  const src = asset.thumbnailUrl ?? (asset.kind === "image" ? asset.url : null) ?? lazySrc;

  useEffect(() => {
    if (src || !thumbnailLoader) return;
    let cancelled = false;
    thumbnailLoader()
      .then((r) => !cancelled && setLazySrc(r))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asset.id]);

  const duration = formatDuration(asset.durationMs);

  return (
    <button
      onClick={onOpen}
      draggable={Boolean(onDragStart)}
      onDragStart={onDragStart}
      className={`group relative flex flex-col overflow-hidden rounded-xl border bg-[var(--surface-2)] text-left transition-all duration-150 ease-out hover:-translate-y-[1px] hover:border-[var(--line-strong)] hover:shadow-[0_10px_24px_-16px_oklch(0_0_0/0.9)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${
        selected ? "border-[var(--accent)]" : "border-[var(--line)]"
      }`}
    >
      <div className="relative flex aspect-[4/3] items-center justify-center overflow-hidden bg-[var(--surface-3)]">
        {src ? (
          <img
            src={src}
            alt={asset.name}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.03]"
          />
        ) : asset.kind === "audio" ? (
          <div className="h-8 w-4/5">
            <Waveform seed={asset.id} bars={28} />
          </div>
        ) : asset.pending ? (
          <Clock size={18} className="text-[var(--status-warn)]" />
        ) : (
          <Icon size={18} strokeWidth={1.6} className="text-[var(--text-dim)]" />
        )}

        {asset.ai ? (
          <span className="absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded-full bg-[var(--surface-0)]/70 px-1.5 py-0.5 text-[9.5px] font-medium text-[var(--accent-strong)] backdrop-blur">
            <Sparkles size={9} /> IA
          </span>
        ) : null}
        {duration ? (
          <span className="absolute bottom-1.5 right-1.5 rounded bg-[var(--surface-0)]/75 px-1.5 py-0.5 text-[9.5px] tabular-nums text-[var(--text)] backdrop-blur">
            {duration}
          </span>
        ) : null}
      </div>

      <div className="flex flex-col gap-0.5 px-2.5 py-2">
        <span className="truncate text-[12px] leading-tight text-[var(--text)]" title={asset.name}>
          {asset.name}
        </span>
        <span className="text-[10.5px] text-[var(--text-dim)]">
          {asset.pending ? "En attente de fichier" : kindLabel(asset.kind)}
        </span>
      </div>
    </button>
  );
}