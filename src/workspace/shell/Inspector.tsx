import { useCallback, useEffect, useState } from "react";
import { MousePointerSquareDashed, Code2, Upload, X } from "lucide-react";
import { useRegistrySnapshot } from "@/kernel/react";
import { useLibrary } from "@/plugins/library/store";
import { replaceAsset, updateHtmlAsset, getAssetBytes } from "@/plugins/library/server";
import { EmptyState } from "@/components/ui/empty-state";
import { kindLabel } from "@/lib/ui/labels";
import { usePanelStore } from "@/stores/panels";
import type { AssetRow } from "@/plugins/library/types";

export function Inspector() {
  const registry = useRegistrySnapshot();
  const panels = registry.panelsForSlot("inspector");
  const selected = useLibrary((s) => s.selected);
  const setSelected = useLibrary((s) => s.setSelected);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[var(--surface-2)]">
      <div className="flex-1 overflow-auto">
        {selected ? (
          <AssetInspector asset={selected} onClose={() => setSelected(null)} />
        ) : (
          <EmptyState
            compact
            icon={MousePointerSquareDashed}
            title="Aucune sélection"
            description="Sélectionnez un média ou un plan de la timeline pour ajuster ses propriétés."
          />
        )}
        {panels.map((p) => {
          const Comp = p.component;
          return <Comp key={p.id} />;
        })}
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
  const devMode = usePanelStore((s) => s.devMode);

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
    <div className="animate-fade-in border-b border-[var(--line)] p-3 text-xs text-[var(--text-muted)]">
      <div className="flex items-center justify-between">
        <div className="t-meta">Média sélectionné</div>
        <button onClick={onClose} title="Désélectionner" className="ghost-btn h-6 w-6">
          <X size={12} />
        </button>
      </div>
      <div className="mt-2.5 space-y-1.5">
        <Row k="Nom" v={asset.name} />
        <Row k="Type" v={kindLabel(asset.kind)} />
        <Row k="Poids" v={formatBytes(asset.sizeBytes)} />
        <Row k="Créé le" v={new Date(asset.createdAt).toLocaleString("fr-FR")} />
        {devMode ? (
          <>
            <Row k="id" v={asset.id} />
            <Row k="mime" v={asset.mime ?? "—"} />
            <Row k="hash" v={asset.blobHash ?? "—"} />
          </>
        ) : null}
      </div>

      {asset.status !== "pending" ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {asset.kind === "html" && !editingHtml ? (
            <button
              onClick={() => setEditingHtml(true)}
              disabled={busy}
              className="flex h-7 items-center gap-1.5 rounded-lg border border-[var(--line)] px-2.5 text-[11.5px] text-[var(--text-muted)] transition-colors hover:border-[var(--line-strong)] hover:text-[var(--text)] disabled:opacity-50"
            >
              <Code2 size={12} /> Modifier le visuel
            </button>
          ) : null}
          <label className="flex h-7 cursor-pointer items-center gap-1.5 rounded-lg border border-[var(--line)] px-2.5 text-[11.5px] text-[var(--text-muted)] transition-colors hover:border-[var(--line-strong)] hover:text-[var(--text)]">
            <Upload size={12} />
            {busy ? "Envoi…" : "Remplacer le fichier"}
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
          <div className="mt-1.5 flex justify-end gap-2">
            <button
              onClick={() => setEditingHtml(false)}
              className="h-7 rounded-lg border border-[var(--line)] px-2.5 text-[11.5px] text-[var(--text-muted)] hover:text-[var(--text)]"
            >
              Annuler
            </button>
            <button
              onClick={saveHtml}
              disabled={busy}
              className="h-7 rounded-lg bg-[var(--accent)] px-3 text-[11.5px] font-medium text-[var(--accent-fg)] transition-colors hover:bg-[var(--accent-strong)] disabled:opacity-50"
            >
              Enregistrer
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
      <span className="text-[11px] text-[var(--text-dim)]">{k}</span>
      <span className="truncate text-right text-[11.5px] text-[var(--text)]" title={v}>
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
