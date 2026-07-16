import { useEffect, useState } from "react";
import { useLibraryProject } from "@/plugins/library/project";
import { supabase } from "@/integrations/supabase/client";

const TRACKS = ["Video", "Audio", "Music", "SFX", "Subtitles"] as const;

type Clip = {
  id: string;
  track: string;
  start_ms: number;
  duration_ms: number;
  asset_id: string | null;
  assets: { kind: string; url: string; prompt: string | null } | null;
};

export function TimelinePanel() {
  const pid = useLibraryProject();
  const [clips, setClips] = useState<Clip[]>([]);

  useEffect(() => {
    if (!pid) return;
    const projectId = pid;
    let alive = true;
    async function load() {
      const { data } = await supabase
        .from("timeline_clips")
        .select("id, track, start_ms, duration_ms, asset_id, assets(kind, url, prompt)")
        .eq("project_id", projectId)
        .order("track")
        .order("start_ms");
      if (alive) setClips((data ?? []) as unknown as Clip[]);
    }
    load();
    const ch = supabase
      .channel(`clips:${projectId}`)
      .on("postgres_changes" as never, { event: "*", schema: "public", table: "timeline_clips", filter: `project_id=eq.${projectId}` }, load)
      .on("postgres_changes" as never, { event: "*", schema: "public", table: "assets", filter: `project_id=eq.${projectId}` }, load)
      .subscribe();
    return () => {
      alive = false;
      supabase.removeChannel(ch);
    };
  }, [pid]);

  if (!pid)
    return (
      <div className="flex h-full items-center justify-center p-8 text-sm text-[var(--text-muted)]">
        No project.
      </div>
    );

  const total = Math.max(30000, ...clips.map((c) => c.start_ms + c.duration_ms));
  const PX_PER_MS = 0.08;

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[var(--surface-1)] text-xs text-[var(--text-muted)]">
      <div className="flex h-9 shrink-0 items-center border-b border-[var(--line)] px-3 text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--text-dim)]">
        Timeline · {clips.length} clips
      </div>
      <div className="flex-1 overflow-auto p-4">
        <div className="flex gap-4">
          <div className="w-24 shrink-0 space-y-1">
            {TRACKS.map((t) => (
              <div key={t} className="flex h-14 items-center rounded bg-[var(--surface-2)] px-2 text-[10px] uppercase tracking-widest text-[var(--text-dim)]">
                {t}
              </div>
            ))}
          </div>
          <div className="flex-1" style={{ minWidth: total * PX_PER_MS }}>
            <div className="mt-1 space-y-1">
              {TRACKS.map((t) => {
                const rowClips = clips.filter((c) => c.track === t);
                return (
                  <div key={t} className="relative h-14 rounded bg-[var(--surface-2)]">
                    {rowClips.map((c) => (
                      <div
                        key={c.id}
                        className="absolute top-1 h-12 overflow-hidden rounded border border-[var(--accent)]/40 bg-[var(--surface-3)] text-[10px]"
                        style={{ left: c.start_ms * PX_PER_MS, width: Math.max(20, c.duration_ms * PX_PER_MS) }}
                        title={c.assets?.prompt ?? ""}
                      >
                        {c.assets?.kind === "image" && c.assets.url && (
                          <img src={c.assets.url} alt="" className="h-full w-full object-cover opacity-80" />
                        )}
                        {c.assets?.kind !== "image" && (
                          <div className="p-1 truncate">{c.assets?.kind ?? "?"}</div>
                        )}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
