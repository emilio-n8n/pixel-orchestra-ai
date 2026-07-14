import { useEffect, useState } from "react";
import { useLibraryProject } from "@/plugins/library/project";

export function TimelinePanel() {
  const pid = useLibraryProject();
  const [tracks] = useState(["Video", "Audio", "Music", "SFX", "Subtitles"]);
  if (!pid)
    return (
      <div className="flex h-full items-center justify-center p-8 text-sm text-[var(--text-muted)]">
        No project.
      </div>
    );
  return (
    <div className="flex h-full flex-col overflow-hidden bg-[var(--surface-1)] text-xs text-[var(--text-muted)]">
      <div className="flex h-9 shrink-0 items-center border-b border-[var(--line)] px-3 text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--text-dim)]">
        Timeline
      </div>
      <div className="flex-1 overflow-auto p-4">
        <div className="flex gap-4">
          <div className="w-24 shrink-0 space-y-1">
            {tracks.map((t) => (
              <div
                key={t}
                className="flex h-12 items-center rounded bg-[var(--surface-2)] px-2 text-[10px] uppercase tracking-widest text-[var(--text-dim)]"
              >
                {t}
              </div>
            ))}
          </div>
          <div className="flex-1">
            <div className="h-8 text-[10px] text-[var(--text-dim)] tracking-wider">
              00:00 • No clips yet.
            </div>
            <div className="mt-1 space-y-1">
              {tracks.map((t) => (
                <div
                  key={t}
                  className="relative flex h-12 items-center rounded bg-[var(--surface-2)]"
                >
                  <div className="absolute left-0 top-0 h-full w-full text-center leading-[3rem] text-[9px] uppercase tracking-widest text-[var(--text-dim)]">
                    {t === "Video" ? "Drag clips from Library" : "—"}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
