import { useEffect, useState } from "react";
import { getAssetBytes } from "@/plugins/library/server";
import type { ViewerAsset } from "@/kernel";

export function ImageViewer({ asset }: { asset: ViewerAsset }) {
  const [src, setSrc] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!asset.blobHash) {
      setErr("no blob hash");
      return;
    }
    let cancelled = false;
    getAssetBytes({ data: { hash: asset.blobHash } })
      .then((r) => {
        if (cancelled) return;
        setSrc(`data:${asset.mime ?? "image/png"};base64,${r.bytesBase64}`);
      })
      .catch((e) => !cancelled && setErr((e as Error).message));
    return () => {
      cancelled = true;
    };
  }, [asset.blobHash, asset.mime]);

  if (err) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-sm text-[var(--text-muted)]">
        {err}
      </div>
    );
  }
  if (!src) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-sm text-[var(--text-muted)]">
        Loading image…
      </div>
    );
  }
  return (
    <div className="flex h-full items-center justify-center bg-[var(--surface-0)] p-8">
      <img src={src} alt={asset.name} className="max-h-full max-w-full object-contain" />
    </div>
  );
}
