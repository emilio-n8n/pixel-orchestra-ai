/**
 * Text tab (spec C.3): animated titles, lower thirds and subtitle presets.
 *
 * Each card is HTML5-draggable; the timeline's titles/stickers lane reads the
 * payload and inserts a clip at the drop position. Cards also work by click
 * (drops at the playhead) so the panel stays usable without a mouse drag.
 */

import { useState } from "react";
import { Type, Sparkles } from "lucide-react";
import { useProjectTimeline } from "@/plugins/ui-timeline/ProjectTimelineProvider";
import { insertTimelineClip, TRACK_NAMES } from "@/plugins/ui-timeline/server";
import { useLibraryProject } from "../project";
import { TEXT_DRAG_TYPE, TEXT_PRESETS, type TextPreset } from "../presets";
import { resolveSubtitleStyle } from "@/plugins/ui-timeline/store";
import { UI_LABELS } from "@/lib/ui/labels";

const L = UI_LABELS.library;

export function TextPresetsTab() {
  const projectId = useLibraryProject();
  const { playhead, resolveNoOverlap, reload } = useProjectTimeline();
  const [error, setError] = useState<string | null>(null);

  async function insert(preset: TextPreset, atMs: number) {
    if (!projectId) return;
    setError(null);
    try {
      // Server helper: timeline_clips has RLS on owner_id, so new rows can
      // only be authored with the real owner.
      await insertTimelineClip({
        data: {
          projectId,
          track: preset.track as (typeof TRACK_NAMES)[number],
          start_ms: Math.max(
            0,
            Math.round(resolveNoOverlap(preset.track, atMs, preset.durationMs)),
          ),
          duration_ms: preset.durationMs,
          meta: {
            text: preset.text,
            style: resolveSubtitleStyle({ style: preset.style }),
            ...(preset.meta ?? {}),
          },
        },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : UI_LABELS.timeline.erreurSuppression);
      return;
    }
    await reload();
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <p className="shrink-0 px-3 pt-3 pb-1 text-[11px] leading-snug text-[var(--text-dim)]">
        {L.glisserVersTimeline}
      </p>
      {error ? (
        <div role="alert" className="mx-3 mb-1 shrink-0 text-[10.5px] text-[var(--status-err)]">
          {error}
        </div>
      ) : null}
      <div className="min-h-0 flex-1 space-y-2 overflow-auto px-3 pb-3">
        {TEXT_PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData(TEXT_DRAG_TYPE, p.id);
              e.dataTransfer.effectAllowed = "copy";
            }}
            onClick={() => void insert(p, playhead)}
            title={p.label}
            className="group flex w-full cursor-grab flex-col gap-1 rounded-xl border border-[var(--line)] bg-[var(--surface-2)] p-2.5 text-left transition-all hover:-translate-y-0.5 hover:border-[var(--line-strong)] hover:shadow-[var(--shadow-pop)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] active:cursor-grabbing"
          >
            <div className="flex items-center gap-1.5">
              {p.id === "subtitle" ? (
                <Type size={12} className="shrink-0 text-[var(--text-dim)]" />
              ) : (
                <Sparkles size={12} className="shrink-0 text-[var(--text-dim)]" />
              )}
              <span className="truncate text-[11.5px] font-medium text-[var(--text)]">
                {p.label}
              </span>
              <span
                aria-hidden
                className="ml-auto h-2.5 w-[3px] shrink-0 rounded-full"
                style={{
                  background: p.rowId === "titles" ? "var(--track-text)" : "var(--track-sticker)",
                }}
              />
            </div>
            <div className="truncate text-[10.5px] text-[var(--text-dim)]">{p.sample}</div>
            <div className="mono text-[9px] uppercase tracking-widest text-[var(--text-dim)]">
              {p.track} · {(p.durationMs / 1000).toFixed(1)}s
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
