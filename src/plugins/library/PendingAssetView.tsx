import { useCallback, useState } from "react";
import {
  Code2,
  File as FileIcon,
  FileText,
  Film,
  Hourglass,
  Image as ImageIcon,
  Music,
} from "lucide-react";
import { fulfillPendingAsset } from "./server";
import { UI_LABELS, kindLabel } from "@/lib/ui/labels";
import { ErrorBlock } from "@/components/ui/error-block";
import type { AssetRow } from "./types";

function PendingKindIcon({ kind, size = 14 }: { kind: string; size?: number }) {
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
    default:
      return <FileIcon size={size} />;
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

/** Full-screen view for a pending asset: shows the prompt and a drop zone
 *  where the user can drop a file generated elsewhere. Fulfilling converts
 *  the pending asset into a real one (local + Supabase). */
export function PendingAssetView({
  asset,
  onFulfilled,
  onBack,
}: {
  asset: AssetRow;
  onFulfilled?: () => void;
  onBack?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [dragOver, setDragOver] = useState(false);

  const fulfill = useCallback(
    async (file: File) => {
      setBusy(true);
      setError(null);
      try {
        const buf = new Uint8Array(await file.arrayBuffer());
        await fulfillPendingAsset({
          data: {
            assetId: asset.id,
            mime: file.type || "application/octet-stream",
            bytesBase64: bytesToBase64(buf),
          },
        });
        onFulfilled?.();
      } catch (e) {
        setError(e);
      } finally {
        setBusy(false);
      }
    },
    [asset.id, onFulfilled],
  );

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--surface-1)]">
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-[var(--line)] px-3">
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 rounded-full border border-[var(--status-warn)]/50 bg-[var(--status-warn)]/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-widest text-[var(--status-warn)]">
            <Hourglass size={11} />
            {UI_LABELS.library.enAttente}
          </span>
          <span className="flex items-center gap-1.5 text-[11px] text-[var(--text-muted)]">
            <PendingKindIcon kind={asset.pendingKind ?? "other"} size={13} />
            {kindLabel(asset.pendingKind ?? "pending")} · {UI_LABELS.library.fichierAttendu}
          </span>
          <span className="hidden text-[11px] text-[var(--text-dim)] sm:inline">
            {UI_LABELS.library.pendingTitre(asset.pendingKind ?? "média")}
          </span>
        </div>
        {onBack ? (
          <button
            onClick={onBack}
            className="rounded px-2 py-1 text-[10px] uppercase tracking-widest text-[var(--text-dim)] transition-colors hover:bg-[var(--surface-3)] hover:text-[var(--text-muted)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
          >
            ← {UI_LABELS.common.retour}
          </button>
        ) : null}
      </div>
      <div className="flex-1 overflow-auto p-6">
        <div className="mx-auto max-w-xl space-y-4">
          <div className="rounded-md border border-[var(--line)] bg-[var(--surface-2)] p-4">
            <div className="text-[10px] uppercase tracking-wider text-[var(--text-dim)]">
              {UI_LABELS.library.inviteGeneration}
            </div>
            <p className="mt-1 whitespace-pre-wrap text-sm text-[var(--text)]">
              {asset.prompt || UI_LABELS.library.sansPrompt}
            </p>
          </div>
          <p className="text-xs leading-relaxed text-[var(--text-muted)]">
            {UI_LABELS.library.aidePending(asset.pendingKind ?? "média")}
          </p>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const f = e.dataTransfer.files?.[0];
              if (f) void fulfill(f);
            }}
            onClick={() => document.getElementById("pending-file-input")?.click()}
            className={`flex cursor-pointer flex-col items-center justify-center rounded-md border border-dashed p-8 text-center transition-colors ${
              dragOver
                ? "border-[var(--accent)] bg-[var(--accent-quiet)] text-[var(--text)]"
                : "border-[var(--line)] text-[var(--text-dim)] hover:border-[var(--line-strong)]"
            }`}
          >
            <input
              id="pending-file-input"
              type="file"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void fulfill(f);
                e.target.value = "";
              }}
            />
            <span className="text-sm">
              {busy ? UI_LABELS.library.depotEnCours : UI_LABELS.library.depotFichier}
            </span>
            <span className="mono mt-1 text-[10px] uppercase tracking-widest">
              {UI_LABELS.library.toutFormat(asset.pendingKind ?? "média")}
            </span>
          </div>
          {error ? (
            <ErrorBlock
              message={String((error as Error)?.message ?? UI_LABELS.library.echecImport)}
              error={error}
              context={`library.pending.${asset.id}`}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
