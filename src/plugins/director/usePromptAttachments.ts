/**
 * Paperclip attachments in the prompt bar (spec D.3).
 *
 * Files picked here are imported into the project immediately (same path as
 * the library drop) and referenced by name in the message, so the agent can
 * call `list_assets` and find them without a bespoke upload protocol.
 */

import { useCallback, useRef, useState } from "react";
import { importAsset } from "@/plugins/library/server";
import { useLibraryProject } from "@/plugins/library/project";
import { useTimelineReload } from "./useTimelineReload";

export interface Attachment {
  id: string;
  name: string;
  sizeBytes: number;
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

export function usePromptAttachments() {
  const projectId = useLibraryProject();
  const reloadAssets = useTimelineReload();
  const inputRef = useRef<HTMLInputElement>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pick = useCallback(() => inputRef.current?.click(), []);

  const onFiles = useCallback(
    async (files: FileList | File[]) => {
      if (!projectId) return;
      setBusy(true);
      setError(null);
      const added: Attachment[] = [];
      try {
        for (const f of Array.from(files)) {
          const bytes = new Uint8Array(await f.arrayBuffer());
          const res = await importAsset({
            data: {
              projectId,
              name: f.name,
              mime: f.type || "application/octet-stream",
              bytesBase64: bytesToBase64(bytes),
            },
          });
          if (res.asset) {
            added.push({ id: res.asset.id, name: res.asset.name, sizeBytes: res.asset.sizeBytes });
          }
        }
        setAttachments((prev) => [...prev, ...added]);
        reloadAssets();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    },
    [projectId, reloadAssets],
  );

  return {
    attachments,
    inputRef,
    busy,
    error,
    pick,
    onFiles,
    clear: () => setAttachments([]),
    remove: (id: string) => setAttachments((prev) => prev.filter((a) => a.id !== id)),
  };
}
