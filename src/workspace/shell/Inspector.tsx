import { useCallback, useEffect, useState } from "react";
import { useRegistrySnapshot } from "@/kernel/react";
import { useLibrary } from "@/plugins/library/store";
import { replaceAsset, updateHtmlAsset, getAssetBytes } from "@/plugins/library/server";
import type { AssetRow } from "@/plugins/library/types";

export function Inspector() {
  const registry = useRegistrySnapshot();
  const panels = registry.panelsForSlot("inspector");
  const selected = useLibrary((s) => s.selected);
  const setSelected = useLibrary((s) => s.setSelected);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[var(--surface-2)]">
      <Header />
      <div className="flex-1 overflow-auto">
        {selected ? <AssetInspector asset={selected} onClose={() => setSelected(null)} /> : (
          <div className="border-b border-[var(--line)] p-4 text-[11px] leading-relaxed text-[var(--text-dim)]">
            <div className="text-[10px] font-medium uppercase tracking-[0.16em] text-[var(--text-dim)]">
              Inspector
            </div>
            <p className="mt-2">
              Select an asset in the Library to inspect, edit its HTML or replace its file.
            </p>
            <p className="mt-2">
              Select a timeline clip to edit its position, duration or fades.
            </p>
          </div>
        )}
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

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function AssetInspector({
  asset,
  onClose,
}: {
  asset: AssetRow;
  onClose: () => void;
}) {
  const [editingHtml, setEditingHtml] = useState(false);
  const [htmlDraft, setHtmlDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load HTML content when starting to edit.
  useEffect(() => {
    if (!editingHtml || !asset.blobHash) return;
    let cancelled = false;
    getAssetBytes({ data: { hash: asset.blobHash } })
      .then((r) => {
        if (cancelled) return;
        setHtmlDraft(atob(r.bytesBase64));
      })
      .catch((e) => !cancelled && setError((e as Error).message));
    return () => {
      cancelled = true;
    };
  }, [editingHtml, asset.blobHash]);

  const onReplaceFile = useCallback(
    async (file: File) => {
      setBusy(true);
      setError(null);
      try {
        const buf = new Uint8Array(await file.arrayBuffer());
        await replaceAsset({
          data: { assetId: asset.id, mime: file.type || "application/octet-stream", bytesBase64: bytesToBase64(buf) },
        });
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [asset.id],
  );

  const saveHtml = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      await updateHtmlAsset({ data: { assetId: asset.id, html: htmlDraft } });
      setEditingHtml(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [asset.id, htmlDraft]);

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

      {asset.status !== "pending" ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {asset.kind === "html" && !editingHtml ? (
            <button
              onClick={() => setEditingHtml(true)}
              disabled={busy}
              className="rounded border border-[var(--line)] px-2 py-1 text-[10px] uppercase tracking-widest text-[var(--text-muted)] hover:border-[var(--line-strong)] disabled:opacity-50"
            >
              Edit HTML
            </button>
          ) : null}
          <label className="cursor-pointer rounded border border-[var(--line)] px-2 py-1 text-[10px] uppercase tracking-widest text-[var(--text-muted)] hover:border-[var(--line-strong)]">
            {busy ? "Updating…" : "Replace file"}
            <input
              type="file"
              className="hidden"
              disabled={busy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onReplaceFile(f);
                e.target.value = "";
              }}
            />
          </label>
        </div>
      ) : null}

      {editingHtml ? (
        <div className="mt-3">
          <textarea
            value={htmlDraft}
            onChange={(e) => setHtmlDraft(e.target.value)}
            rows={10}
            className="mono w-full resize-y rounded border border-[var(--line)] bg-[var(--surface-1)] p-2 text-[10px] text-[var(--text)] outline-none focus:border-[var(--accent)]"
          />
          <div className="mt-1 flex justify-end gap-2">
            <button
              onClick={() => setEditingHtml(false)}
              className="rounded border border-[var(--line)] px-2 py-1 text-[10px] uppercase tracking-widest text-[var(--text-muted)]"
            >
              Cancel
            </button>
            <button
              onClick={saveHtml}
              disabled={busy}
              className="rounded bg-[var(--accent)] px-2 py-1 text-[10px] font-medium uppercase tracking-widest text-[var(--accent-fg)] disabled:opacity-50"
            >
              Save
            </button>
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="mt-2 rounded border border-[var(--status-err)] bg-[var(--status-err)]/10 p-2 text-[10px] text-[var(--status-err)]">
          {error}
        </div>
      ) : null}
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
