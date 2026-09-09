import { useEffect, useState } from "react";
import { getAssetBytes } from "@/plugins/library/server";
import { ErrorBlock } from "@/components/ui/error-block";
import { UI_LABELS } from "@/lib/ui/labels";
import type { ViewerAsset } from "@/kernel";

export function ImageViewer({ asset }: { asset: ViewerAsset }) {
  const [src, setSrc] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const remoteUrl = typeof asset.meta?.url === "string" ? asset.meta.url : null;
    if (remoteUrl) {
      setSrc(remoteUrl);
      setErr(null);
      return;
    }
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
  }, [asset.blobHash, asset.mime, asset.meta]);

  if (err) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <ErrorBlock
          message={UI_LABELS.visionneuse.erreurChargement}
          error={err}
          context="viewer.image"
        />
      </div>
    );
  }
  if (!src) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-sm text-[var(--text-muted)]">
        {UI_LABELS.visionneuse.chargementImage}
      </div>
    );
  }
  return (
    <div className="flex h-full items-center justify-center bg-[var(--surface-0)] p-8">
      <img src={src} alt={asset.name} className="max-h-full max-w-full object-contain" />
    </div>
  );
}
