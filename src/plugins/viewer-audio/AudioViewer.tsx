import { useEffect, useRef, useState } from "react";
import { getAssetBytes } from "@/plugins/library/server";
import type { ViewerAsset } from "@/kernel";

export function AudioViewer({ asset }: { asset: ViewerAsset }) {
  const [src, setSrc] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const ref = useRef<HTMLAudioElement>(null);
  const lastUrl = useRef<string | null>(null);

  useEffect(() => {
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
        const blob = new Blob([bytes], { type: asset.mime ?? "audio/mpeg" });
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
        Loading audio…
      </div>
    );
  }
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 bg-[var(--surface-0)] p-8">
      <div className="text-sm text-[var(--text-muted)]">{asset.name}</div>
      <audio ref={ref} src={src} controls className="w-full max-w-md" />
    </div>
  );
}
