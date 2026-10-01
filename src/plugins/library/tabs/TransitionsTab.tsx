/**
 * Transitions tab (spec C.4).
 *
 * A transition is not an asset: it is a relationship between two consecutive
 * clips on the same track. The tab therefore lists the presets, then applies
 * the chosen one to the two clips that surround the playhead — the same pair
 * the user is looking at in the timeline. The written fields
 * (`transition_in_ms` / `transition_out_ms`, or the audio fades) are read by
 * `renderTimelineFrame` and the export envelope, so preview and file match.
 */

import { useMemo, useState } from "react";
import { Shuffle, Blend, Volume2, Zap, Waves } from "lucide-react";
import { useProjectTimeline } from "@/plugins/ui-timeline/ProjectTimelineProvider";
import { supabase } from "@/integrations/supabase/client";
import { TRANSITION_PRESETS, type TransitionPreset } from "../presets";
import { UI_LABELS } from "@/lib/ui/labels";

const L = UI_LABELS.library;

const ICONS: Record<string, typeof Blend> = {
  dissolve: Blend,
  crossfade: Volume2,
  "dip-to-black": Waves,
  glitch: Zap,
  "whip-pan": Shuffle,
};

export function TransitionsTab() {
  const { clips, playhead, seek, reload } = useProjectTimeline();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * The pair the transition applies to: the clip ending at/after the
   * playhead (A) and the next one on the same track (B). Falls back to the
   * first two clips of the track so the button is never mysteriously dead.
   */
  const pair = useMemo(() => {
    const byTrack = new Map<string, typeof clips>();
    for (const c of clips) {
      if (!byTrack.has(c.track)) byTrack.set(c.track, []);
      byTrack.get(c.track)!.push(c);
    }
    for (const list of byTrack.values()) list.sort((a, b) => a.start_ms - b.start_ms);

    // Prefer the track that actually has the playhead inside it.
    for (const [track, list] of byTrack) {
      const idx = list.findIndex(
        (c) => playhead >= c.start_ms && playhead < c.start_ms + c.duration_ms,
      );
      if (idx >= 0) {
        const a = list[Math.max(0, Math.min(idx, list.length - 2))];
        const b = list[Math.min(idx + 1, list.length - 1)];
        if (a && b && a.id !== b.id) return { track, a, b };
      }
    }
    const first = [...byTrack.entries()].find(([, list]) => list.length >= 2);
    if (!first) return null;
    return { track: first[0], a: first[1][0], b: first[1][1] };
  }, [clips, playhead]);

  async function apply(preset: TransitionPreset) {
    if (!pair || busy) return;
    setBusy(true);
    setError(null);
    try {
      const overlap = Math.min(
        preset.overlapMs,
        pair.a.duration_ms - 100,
        pair.b.duration_ms - 100,
      );
      if (overlap < 50) {
        setError(L.transitionCible);
        return;
      }
      // Pull B back so it overlaps the tail of A by `overlap`.
      const bStart = Math.max(pair.a.start_ms, pair.a.start_ms + pair.a.duration_ms - overlap);
      const audioFade = preset.meta.audioFade > 0 ? Math.min(overlap, preset.meta.audioFade) : 0;

      const aMeta = {
        ...(pair.a.meta ?? {}),
        ...(preset.meta.videoOut > 0
          ? { transition_out_ms: preset.meta.videoOut }
          : { fade_out_ms: audioFade }),
      };
      const bMeta = {
        ...(pair.b.meta ?? {}),
        ...(preset.meta.videoIn > 0
          ? { transition_in_ms: preset.meta.videoIn }
          : audioFade > 0
            ? { fade_in_ms: audioFade }
            : {}),
      };

      const { error: err } = await supabase
        .from("timeline_clips")
        .update({ meta: aMeta })
        .eq("id", pair.a.id);
      if (err) throw new Error(err.message);
      const { error: err2 } = await supabase
        .from("timeline_clips")
        .update({ meta: bMeta, start_ms: bStart })
        .eq("id", pair.b.id);
      if (err2) throw new Error(err2.message);

      await reload();
      // Park the playhead on the cut so the user sees the result immediately.
      seek(bStart);
    } catch (e) {
      setError(e instanceof Error ? e.message : L.echecChargement);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <p className="shrink-0 px-3 pt-3 pb-1 text-[11px] leading-snug text-[var(--text-dim)]">
        {pair ? `${pair.track} — ${UI_LABELS.timeline.plans(2)}` : L.transitionCible}
      </p>
      {error ? (
        <div role="alert" className="mx-3 mb-1 shrink-0 text-[10.5px] text-[var(--status-warn)]">
          {error}
        </div>
      ) : null}
      <div className="min-h-0 flex-1 space-y-1.5 overflow-auto px-3 pb-3">
        {TRANSITION_PRESETS.map((p) => {
          const Icon = ICONS[p.id] ?? Blend;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => void apply(p)}
              disabled={!pair || busy}
              title={p.description}
              className="group flex w-full items-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--surface-2)] p-2.5 text-left transition-all hover:-translate-y-0.5 hover:border-[var(--line-strong)] hover:shadow-[var(--shadow-pop)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0"
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--surface-4)] text-[var(--text-muted)]">
                <Icon size={13} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[11.5px] font-medium text-[var(--text)]">
                  {p.label}
                </span>
                <span className="block truncate text-[10px] text-[var(--text-dim)]">
                  {p.description}
                </span>
              </span>
              <span className="mono shrink-0 text-[9px] text-[var(--text-dim)]">
                {p.overlapMs}ms
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
