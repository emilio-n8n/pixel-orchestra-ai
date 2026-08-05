import { useCallback, useState } from "react";
import { fulfillPendingAsset } from "./server";
import type { AssetRow } from "./types";

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
  const [error, setError] = useState<string | null>(null);
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
        setError((e as Error).message);
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
          <span className="text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--text-dim)]">
            Pending {asset.pendingKind ?? "asset"}
          </span>
        </div>
        {onBack ? (
          <button
            onClick={onBack}
            className="rounded px-2 py-1 text-[10px] uppercase tracking-widest text-[var(--text-dim)] hover:bg-[var(--surface-3)] hover:text-[var(--text-muted)]"
          >
            ← Back
          </button>
        ) : null}
      </div>
      <div className="flex-1 overflow-auto p-6">
        <div className="mx-auto max-w-xl space-y-4">
          <div className="rounded-md border border-[var(--line)] bg-[var(--surface-2)] p-4">
            <div className="text-[10px] uppercase tracking-wider text-[var(--text-dim)]">
              Generation prompt
            </div>
            <p className="mt-1 whitespace-pre-wrap text-sm text-[var(--text)]">
              {asset.prompt || "(no prompt)"}
            </p>
          </div>
          <p className="text-xs leading-relaxed text-[var(--text-muted)]">
            Generate this {asset.pendingKind ?? "asset"} with the tool of your choice (Cloudflare,
            a local AI, an online service…), then drop the result file here — or click to browse.
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
            <span className="text-sm">{busy ? "Fulfilling…" : "Drop the generated file here"}</span>
            <span className="mono mt-1 text-[10px] uppercase tracking-widest">
              {asset.pendingKind ?? "asset"} · any format
            </span>
          </div>
          {error ? (
            <div className="rounded border border-[var(--status-err)] bg-[var(--status-err)]/10 p-2 text-[11px] text-[var(--status-err)]">
              {error}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
