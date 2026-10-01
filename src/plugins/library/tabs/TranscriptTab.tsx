/**
 * Transcript tab (spec C.5).
 *
 * Reads the subtitle clips the agent's `generate_subtitles` tool already
 * writes onto the titles track, so there is no second transcription store to
 * keep consistent. Each line is clickable (jumps the playhead) and the active
 * line is highlighted as the playhead crosses it.
 */

import { useEffect, useMemo, useRef } from "react";
import { FileText, Hourglass } from "lucide-react";
import { useProjectTimeline } from "@/plugins/ui-timeline/ProjectTimelineProvider";
import { formatSubtitleText } from "@/plugins/ui-timeline/store";
import { UI_LABELS } from "@/lib/ui/labels";
import { EmptyState } from "@/components/ui/empty-state";

const L = UI_LABELS.library;
const T = UI_LABELS.timeline;

interface TranscriptLine {
  id: string;
  startMs: number;
  durationMs: number;
  text: string;
}

export function TranscriptTab() {
  const { clips, playhead, seek, playing } = useProjectTimeline();
  const activeRef = useRef<HTMLButtonElement | null>(null);

  const lines = useMemo<TranscriptLine[]>(
    () =>
      clips
        .filter((c) => c.track === "Subtitles" && typeof c.meta?.text === "string")
        .map((c) => ({
          id: c.id,
          startMs: c.start_ms,
          durationMs: c.duration_ms,
          text: formatSubtitleText(String(c.meta?.text ?? "")),
        }))
        .sort((a, b) => a.startMs - b.startMs),
    [clips],
  );

  const activeIndex = useMemo(() => {
    for (let i = 0; i < lines.length; i++) {
      if (playhead >= lines[i].startMs && playhead < lines[i].startMs + lines[i].durationMs)
        return i;
    }
    return -1;
  }, [lines, playhead]);

  // Keep the spoken line in view while playing.
  useEffect(() => {
    if (!playing || activeIndex < 0) return;
    activeRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [activeIndex, playing]);

  if (lines.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <EmptyState
          compact
          icon={FileText}
          title={L.transcriptVide}
          description={L.transcriptAide}
        />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <p className="shrink-0 px-3 pt-3 pb-1 text-[11px] text-[var(--text-dim)]">
        {L.transcriptAide}
      </p>
      <div className="min-h-0 flex-1 space-y-0.5 overflow-auto px-2 pb-3">
        {lines.map((line, i) => {
          const active = i === activeIndex;
          return (
            <button
              key={line.id}
              ref={active ? activeRef : undefined}
              type="button"
              onClick={() => seek(line.startMs)}
              title={L.transcriptEnCours(`${(line.startMs / 1000).toFixed(1)}s`)}
              aria-current={active}
              className={`flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--accent)] ${
                active
                  ? "bg-[var(--accent-quiet)] text-[var(--text)]"
                  : "text-[var(--text-muted)] hover:bg-[var(--surface-2)]"
              }`}
            >
              <span
                className={`mono shrink-0 pt-px text-[9.5px] tabular-nums ${
                  active ? "text-[var(--accent-strong)]" : "text-[var(--text-dim)]"
                }`}
              >
                {formatStamp(line.startMs)}
              </span>
              <span className="min-w-0 flex-1 text-[12px] leading-snug">{line.text}</span>
            </button>
          );
        })}
        <p className="flex items-center gap-1.5 px-2 pt-3 text-[10px] text-[var(--text-dim)]">
          <Hourglass size={10} />
          {T.plans(lines.length)}
        </p>
      </div>
    </div>
  );
}

function formatStamp(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}
