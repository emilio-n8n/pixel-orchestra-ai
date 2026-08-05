import { useCallback, useEffect, useRef, useState } from "react";
import { getAssetBytes, updateHtmlAsset } from "@/plugins/library/server";
import type { ViewerAsset } from "@/kernel";

export function HtmlViewer({ asset }: { asset: ViewerAsset }) {
  const [src, setSrc] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const lastUrl = useRef<string | null>(null);

  const load = useCallback(() => {
    if (!asset.blobHash) {
      setErr("no blob hash");
      return;
    }
    let cancelled = false;
    getAssetBytes({ data: { hash: asset.blobHash } })
      .then((r) => {
        if (cancelled) return;
        const bin = atob(r.bytesBase64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const blob = new Blob([bytes], { type: "text/html" });
        const url = URL.createObjectURL(blob);
        lastUrl.current = url;
        setSrc(url);
      })
      .catch((e) => !cancelled && setErr((e as Error).message));
    return () => {
      cancelled = true;
      if (lastUrl.current) {
        URL.revokeObjectURL(lastUrl.current);
        lastUrl.current = null;
      }
    };
  }, [asset.blobHash]);

  useEffect(() => {
    setErr(null);
    setEditing(false);
    load();
  }, [load]);

  const startEdit = useCallback(() => {
    setSaveErr(null);
    if (!asset.blobHash) return;
    getAssetBytes({ data: { hash: asset.blobHash } })
      .then((r) => setDraft(atob(r.bytesBase64)))
      .catch((e) => setSaveErr((e as Error).message));
    setEditing(true);
  }, [asset.blobHash]);

  const save = useCallback(async () => {
    setBusy(true);
    setSaveErr(null);
    try {
      await updateHtmlAsset({ data: { assetId: asset.id, html: draft } });
      setEditing(false);
      load();
    } catch (e) {
      setSaveErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [asset.id, draft, load]);

  if (err) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-sm text-[var(--text-muted)]">
        {err}
      </div>
    );
  }
  if (editing) {
    return (
      <div className="flex h-full flex-col bg-[var(--surface-0)] p-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-widest text-[var(--text-dim)]">
            Edit HTML — {asset.name}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setEditing(false)}
              className="rounded border border-[var(--line)] px-2 py-1 text-[10px] uppercase tracking-widest text-[var(--text-muted)] hover:border-[var(--line-strong)]"
            >
              Cancel
            </button>
            <button
              onClick={save}
              disabled={busy}
              className="rounded bg-[var(--accent)] px-2 py-1 text-[10px] font-medium uppercase tracking-widest text-[var(--accent-fg)] disabled:opacity-50"
            >
              {busy ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={20}
          className="mono flex-1 resize-none rounded border border-[var(--line)] bg-[var(--surface-1)] p-3 text-[11px] text-[var(--text)] outline-none focus:border-[var(--accent)]"
        />
        {saveErr ? (
          <div className="mt-2 rounded border border-[var(--status-err)] bg-[var(--status-err)]/10 p-2 text-[10px] text-[var(--status-err)]">
            {saveErr}
          </div>
        ) : null}
      </div>
    );
  }
  return (
    <div className="relative h-full bg-[var(--surface-0)] p-4">
      {!src ? (
        <div className="flex h-full items-center justify-center p-8 text-sm text-[var(--text-muted)]">
          Loading html…
        </div>
      ) : (
        <iframe
          src={src}
          title={asset.name}
          sandbox=""
          className="h-full w-full rounded border border-[var(--line)] bg-white"
        />
      )}
      <button
        onClick={startEdit}
        className="absolute right-6 top-6 rounded-md bg-[var(--surface-2)] px-2.5 py-1 text-[10px] font-medium uppercase tracking-widest text-[var(--text-muted)] shadow-[var(--shadow-pop)] hover:bg-[var(--surface-3)] hover:text-[var(--text)]"
      >
        Edit
      </button>
    </div>
  );
}
