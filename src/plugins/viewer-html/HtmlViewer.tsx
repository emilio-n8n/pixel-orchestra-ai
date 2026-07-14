import { useEffect, useRef, useState } from "react";
import { getAssetBytes } from "@/plugins/library/server";
import type { ViewerAsset } from "@/kernel";

export function HtmlViewer({ asset }: { asset: ViewerAsset }) {
  const [src, setSrc] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
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
        Loading html…
      </div>
    );
  }
  return (
    <div className="h-full bg-[var(--surface-0)] p-4">
      <iframe
        src={src}
        title={asset.name}
        sandbox=""
        className="h-full w-full rounded border border-[var(--line)] bg-white"
      />
    </div>
  );
}
