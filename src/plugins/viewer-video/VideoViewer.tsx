import { useEffect, useRef, useState } from "react";
import { getAssetBytes } from "@/plugins/library/server";
import { ErrorBlock } from "@/components/ui/error-block";
import { UI_LABELS } from "@/lib/ui/labels";
import type { ViewerAsset } from "@/kernel";

export function VideoViewer({ asset }: { asset: ViewerAsset }) {
  const [src, setSrc] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const ref = useRef<HTMLVideoElement>(null);
  const lastUrl = useRef<string | null>(null);

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
        const bin = atob(r.bytesBase64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const blob = new Blob([bytes], { type: asset.mime ?? "video/mp4" });
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
  }, [asset.blobHash, asset.mime, asset.meta]);

  if (err) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <ErrorBlock
          message={UI_LABELS.visionneuse.erreurChargement}
          error={err}
          context="viewer.video"
        />
      </div>
    );
  }
  if (!src) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-sm text-[var(--text-muted)]">
        {UI_LABELS.visionneuse.chargementVideo}
      </div>
    );
  }
  return (
    <div className="flex h-full items-center justify-center bg-[var(--surface-0)] p-8">
      <video ref={ref} src={src} controls className="max-h-full max-w-full" />
    </div>
  );
}
