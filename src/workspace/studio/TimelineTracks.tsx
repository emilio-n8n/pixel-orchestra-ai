/**
 * Multitrack NLE track grid (spec B.2).
 *
 * Seven rows in a fixed top → bottom order with strict colors, all read from
 * the `--track-*` design tokens so the palette stays in styles.css:
 *
 *   1 titres    violet      text, titles, subtitles
 *   2 stickers  peach       stickers, callouts, emojis
 *   3 dynamique sky + green dynamic components / scripting
 *   4 vidéo     dark blue   A-Roll & B-Roll, with a frame-by-frame ribbon
 *   5 voix      light blue  dialogue, with a real waveform
 *   6 sfx       orange      short sound effects
 *   7 musique   pastel green background music, with ducking curves
 *
 * Drag, resize, drop and keyboard all go through the shared timeline
 * context, so the agent sees the same state the user does.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { splitClipAt } from "@/plugins/ui-timeline/split";
import { useToolStore, type TimelineTool } from "@/plugins/ui-timeline/tools";
import { useHistoryStore } from "@/plugins/ui-timeline/history";
import { VolumeX, Plus, Film } from "lucide-react";
import {
  useProjectTimeline,
  type ProjectMarker,
} from "@/plugins/ui-timeline/ProjectTimelineProvider";
import { useZoomStore, zoomToPxPerMs } from "@/plugins/ui-timeline/zoom";
import {
  isTypingTarget,
  MIN_DURATION_MS,
  NUDGE_MS,
  NUDGE_SHIFT_MS,
  snapMs,
  type TimelineClip,
} from "@/plugins/ui-timeline/store";
import { hasKeyframes, volAt, formatChapterTime } from "@/plugins/ui-timeline/export";
import { TRACK_ROWS, UI_LABELS, kindLabel } from "@/lib/ui/labels";
import { SFX_PRESETS } from "@/plugins/ui-timeline/sfx";
import { EmptyState } from "@/components/ui/empty-state";
import { AudioWaveform } from "@/plugins/ui-timeline/AudioWaveform";
import { useSfxDrop } from "@/plugins/ui-timeline/useSfxDrop";
import { useAutoDucking } from "@/plugins/ui-timeline/useAutoDucking";

const T = UI_LABELS.timeline;
const ROW_HEIGHT = 52;
const GUTTER_WIDTH = 116;

export function TimelineTracks() {
  const tl = useProjectTimeline();
  const { clips, markers, totalMs, selectedClipId, playhead } = tl;
  const zoom = useZoomStore((s) => s.zoom);
  const pxPerMs = useMemo(() => zoomToPxPerMs(zoom), [zoom]);
  const [dragOverRow, setDragOverRow] = useState<string | null>(null);
  const trackAreaRef = useRef<HTMLDivElement>(null);
  const playheadLineRef = useRef<HTMLDivElement>(null);
  const clipsRef = useRef<TimelineClip[]>(clips);
  const { dropSfx } = useSfxDrop();
  useAutoDucking();

  clipsRef.current = clips;

  // Playhead line is moved by transform (GPU) rather than re-rendered.
  useEffect(() => {
    const line = playheadLineRef.current;
    if (line) line.style.transform = `translateX(${playhead * pxPerMs}px)`;
  }, [playhead, pxPerMs]);

  /** Viewport-relative clientX → absolute ms (the rect is scroll-correct). */
  const msFromClientX = useCallback(
    (clientX: number) => {
      const el = trackAreaRef.current;
      if (!el) return 0;
      return Math.max(0, (clientX - el.getBoundingClientRect().left) / pxPerMs);
    },
    [pxPerMs],
  );

  const empty = clips.length === 0;

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden bg-[var(--surface-1)]">
      {/* Track headers: pinned left column, outside the horizontal scroller
          so the labels never scroll away from their lanes. */}
      <div
        className="z-20 shrink-0 overflow-hidden border-r border-[var(--line)] bg-[var(--surface-1)]"
        style={{ width: GUTTER_WIDTH }}
      >
        <div className="sticky top-0 z-10 h-6 border-b border-[var(--line)] bg-[var(--surface-1)]" />
        {TRACK_ROWS.map((row) => {
          const rowClips = clips.filter((c) => row.tracks.includes(c.track));
          return (
            <div
              key={row.id}
              className="flex items-center gap-1.5 border-b border-[var(--line)] px-2"
              style={{ height: ROW_HEIGHT }}
              title={row.label}
            >
              <span
                aria-hidden
                className="h-6 w-[3px] shrink-0 rounded-full"
                style={{ background: `var(${row.colorVar})` }}
              />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[10.5px] font-medium text-[var(--text)]">
                  {row.short}
                </div>
                <div className="truncate text-[9px] text-[var(--text-dim)]">
                  {rowClips.length > 0 ? T.plans(rowClips.length) : row.label}
                </div>
              </div>
              {row.id === "sfx" ? <SfxAddButton onAdd={dropSfx} /> : null}
            </div>
          );
        })}
      </div>

      {/* Track lanes. Only this column scrolls, so the playhead stays a child
          of the scrolled content and spans the ruler plus every row. */}
      <div className="relative min-w-0 flex-1 overflow-auto">
        <div ref={trackAreaRef} className="relative" style={{ minWidth: totalMs * pxPerMs }}>
          <Ruler totalMs={totalMs} pxPerMs={pxPerMs} onScrub={tl.seek} />

          {markers.map((m) => (
            <MarkerLine key={m.id} marker={m} pxPerMs={pxPerMs} />
          ))}

          {TRACK_ROWS.map((row) => (
            <TrackLane
              key={row.id}
              rowId={row.id}
              trackNames={row.tracks}
              colorVar={row.colorVar}
              isAudio={row.audio}
              video={row.video}
              pxPerMs={pxPerMs}
              playhead={playhead}
              dragOver={dragOverRow === row.id}
              msFromClientX={msFromClientX}
              onDragOverRow={() => setDragOverRow(row.id)}
              onDragLeaveRow={() => setDragOverRow((cur) => (cur === row.id ? null : cur))}
            />
          ))}

          {/* Playhead — GPU transform, never a re-render. */}
          <div
            ref={playheadLineRef}
            className="pointer-events-none absolute top-0 left-0 h-full w-px bg-[var(--accent)] will-change-transform"
            style={{ transform: `translateX(${playhead * pxPerMs}px)` }}
          >
            <div className="absolute -top-1 -left-[3px] h-2 w-2 rounded-sm bg-[var(--accent)]" />
          </div>
        </div>

        {empty ? (
          <div className="pointer-events-none absolute inset-0 flex items-start justify-center p-6">
            <EmptyState icon={Film} title={T.videTitre} description={T.videDescription} compact />
          </div>
        ) : null}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Ruler                                                               */
/* ------------------------------------------------------------------ */

function Ruler({
  totalMs,
  pxPerMs,
  onScrub,
}: {
  totalMs: number;
  pxPerMs: number;
  onScrub: (ms: number) => void;
}) {
  // Choose a tick step that keeps labels ≥ 64 px apart at any zoom.
  const steps = [100, 250, 500, 1000, 2000, 5000, 10000, 30000, 60000, 300000];
  const step = steps.find((s) => s * pxPerMs >= 64) ?? 600000;
  const ticks: number[] = [];
  for (let t = 0; t <= totalMs; t += step) ticks.push(t);

  return (
    <div
      role="slider"
      tabIndex={0}
      aria-label={T.astuceCurseur}
      aria-valuemin={0}
      aria-valuemax={Math.round(totalMs)}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
          e.preventDefault();
          onScrub(0);
        }
      }}
      onPointerDown={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        onScrub((e.clientX - rect.left) / pxPerMs);
      }}
      className="sticky top-0 z-10 h-6 cursor-ew-resize border-b border-[var(--line)] bg-[var(--surface-2)]"
    >
      {ticks.map((t) => (
        <div
          key={t}
          className="absolute top-0 h-full border-l border-[var(--line)] pl-1 text-[9px] leading-6 text-[var(--text-dim)]"
          style={{ left: t * pxPerMs }}
        >
          <span className="mono">{formatRulerTime(t)}</span>
        </div>
      ))}
    </div>
  );
}

function formatRulerTime(ms: number): string {
  const s = Math.round(ms / 1000);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

function MarkerLine({ marker, pxPerMs }: { marker: ProjectMarker; pxPerMs: number }) {
  return (
    <div
      className="pointer-events-none absolute inset-y-0 z-10 w-px bg-[var(--accent-strong)]/70"
      style={{ left: marker.t_ms * pxPerMs }}
    >
      <span
        title={`${formatChapterTime(marker.t_ms)} — ${marker.label}`}
        className="absolute top-0 left-0 max-w-[120px] truncate rounded-br bg-[var(--accent-strong)]/85 px-1 text-[9px] leading-4 text-[var(--accent-fg)]"
      >
        {formatChapterTime(marker.t_ms)} {marker.label}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* One lane                                                            */
/* ------------------------------------------------------------------ */

function TrackLane({
  rowId,
  trackNames,
  colorVar,
  isAudio,
  video,
  pxPerMs,
  playhead,
  dragOver,
  msFromClientX,
  onDragOverRow,
  onDragLeaveRow,
}: {
  rowId: string;
  trackNames: readonly string[];
  colorVar: string;
  isAudio: boolean;
  video: boolean;
  pxPerMs: number;
  playhead: number;
  dragOver: boolean;
  msFromClientX: (clientX: number) => number;
  onDragOverRow: () => void;
  onDragLeaveRow: () => void;
}) {
  const tl = useProjectTimeline();
  const {
    clips,
    selectedClipId,
    selectClip,
    patchClipLocal,
    updateClip,
    resolveNoOverlap,
    deleteClip,
  } = tl;
  const rowClips = useMemo(
    () => clips.filter((c) => trackNames.includes(c.track)),
    [clips, trackNames],
  );
  const tool = useToolStore((s) => s.tool);
  const push = useHistoryStore((s) => s.push);
  const { splitAtPlayhead } = tl;
  const pushHistory = useCallback(() => push(clips), [push, clips]);

  /**
   * Scissors on a single clip: validate the cut locally first (a click near an
   * edge must be a no-op, not a write), then hand the real insert to the
   * timeline context so the row id, the owner and the event log stay in one
   * place. `splitAtPlayhead` cuts at the playhead, so we park the playhead on
   * the clicked position first.
   */
  const onSplit = useCallback(
    async (clip: TimelineClip, atMs: number) => {
      if (!splitClipAt(clip, atMs)) return;
      pushHistory();
      tl.seek(snapMs(atMs));
      selectClip(clip.id);
      await splitAtPlayhead("selected");
    },
    [pushHistory, tl, selectClip, splitAtPlayhead],
  );

  return (
    <div
      data-track-row={rowId}
      // A click on the empty lane clears the selection (chips stop their own
      // propagation). The scissors tool only changes what a chip click does.
      onClick={() => selectClip(null)}
      onDragOver={(e) => {
        e.preventDefault();
        onDragOverRow();
      }}
      onDragLeave={onDragLeaveRow}
      onDrop={(e) => {
        e.preventDefault();
        onDragLeaveRow();
        // HTML5 payload from the library panel: asset drops land on the row's
        // primary track; clip drags are handled by the chip's own dataTransfer.
        const assetId = e.dataTransfer.getData(ASSET_DRAG_TYPE);
        if (!assetId) return;
        const payload = readAssetPayload(e.dataTransfer);
        if (!payload) return;
        void tl.insertAssetClip({
          assetId,
          track: trackNames[0],
          startMs: msFromClientX(e.clientX),
          durationMs: payload.durationMs,
          name: payload.name,
          mime: payload.mime,
        });
      }}
      className={`relative border-b border-[var(--line)] transition-colors ${
        dragOver ? "bg-[var(--accent-quiet)]" : "bg-[var(--surface-2)]/40"
      }`}
      style={{ height: ROW_HEIGHT }}
    >
      {rowClips.map((c) => (
        <ClipChip
          key={c.id}
          clip={c}
          colorVar={colorVar}
          isAudio={isAudio}
          video={video}
          pxPerMs={pxPerMs}
          playhead={playhead}
          selected={selectedClipId === c.id}
          laneClips={rowClips}
          tool={tool}
          msFromClientX={msFromClientX}
          onSelect={() => selectClip(c.id === selectedClipId ? null : c.id)}
          onSplitAt={(atMs: number) => void onSplit(c, atMs)}
          onMove={(startMs, track) => {
            const duration = c.duration_ms;
            const start = resolveNoOverlap(track, startMs, duration, c.id);
            pushHistory();
            patchClipLocal(c.id, { start_ms: start, track });
            void updateClip(c.id, { start_ms: start, track });
          }}
          onResize={(patch) => {
            patchClipLocal(c.id, patch);
            void updateClip(c.id, {
              start_ms: patch.start_ms,
              duration_ms: patch.duration_ms,
            });
          }}
          onDelete={() => void deleteClip(c.id)}
          onDropClip={(clipId, startMs, track) => {
            const clip = clips.find((x) => x.id === clipId);
            if (!clip) return;
            const start = resolveNoOverlap(track, startMs, clip.duration_ms, clip.id);
            patchClipLocal(clip.id, { start_ms: start, track });
            void updateClip(clip.id, { start_ms: start, track });
          }}
        />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Clip chip                                                           */
/* ------------------------------------------------------------------ */

function ClipChip({
  clip,
  colorVar,
  isAudio,
  video,
  pxPerMs,
  playhead,
  selected,
  laneClips,
  tool,
  msFromClientX,
  onSelect,
  onSplitAt,
  onMove,
  onResize,
  onDelete,
  onDropClip,
}: {
  clip: TimelineClip;
  colorVar: string;
  isAudio: boolean;
  video: boolean;
  pxPerMs: number;
  playhead: number;
  selected: boolean;
  /** Every clip in this lane — the resize clamp needs the neighbours. */
  laneClips: TimelineClip[];
  tool: TimelineTool;
  msFromClientX: (clientX: number) => number;
  onSelect: () => void;
  onSplitAt: (atMs: number) => void;
  onMove: (startMs: number, track: string) => void;
  onResize: (patch: { start_ms: number; duration_ms: number }) => void;
  onDelete: () => void;
  onDropClip: (clipId: string, startMs: number, track: string) => void;
}) {
  const meta = clip.meta ?? {};
  const isSilence = meta.silence === true;
  const fadeInMs = typeof meta.fade_in_ms === "number" ? meta.fade_in_ms : 0;
  const fadeOutMs = typeof meta.fade_out_ms === "number" ? meta.fade_out_ms : 0;
  const tInMs = typeof meta.transition_in_ms === "number" ? meta.transition_in_ms : 0;
  const tOutMs = typeof meta.transition_out_ms === "number" ? meta.transition_out_ms : 0;
  const hasFadeIn = fadeInMs > 0 || tInMs > 0;
  const hasFadeOut = fadeOutMs > 0 || tOutMs > 0;
  const width = Math.max(24, clip.duration_ms * pxPerMs);
  const height = ROW_HEIGHT - 8;
  // Live envelope at the playhead — the ducking badge breathes with the mix.
  const gain =
    playhead >= clip.start_ms && playhead < clip.start_ms + clip.duration_ms
      ? volAt(clip, playhead)
      : null;
  const [resize, setResize] = useState<{ side: "left" | "right"; startX: number } | null>(null);
  const [ghost, setGhost] = useState<{ start_ms: number; duration_ms: number } | null>(null);
  const [dropTrack, setDropTrack] = useState(false);

  // Resize drag: mouse + touch/pen through the same geometry. `side` and
  // `startX` are captured into locals so the listeners never see a stale ref.
  useEffect(() => {
    if (!resize) return;
    const { side, startX } = resize;
    function onMove(e: MouseEvent | PointerEvent) {
      const dx = (e.clientX - startX) / pxPerMs;
      setGhost(computeResize(clip, laneClips, side, dx));
    }
    function onUp(e: MouseEvent | PointerEvent) {
      const dx = (e.clientX - startX) / pxPerMs;
      const patch = computeResize(clip, laneClips, side, dx);
      setGhost(null);
      setResize(null);
      onResize(patch);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
    // `clip` is read through the closure and re-created on every commit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resize, pxPerMs]);

  const start = ghost?.start_ms ?? clip.start_ms;
  const duration = ghost?.duration_ms ?? clip.duration_ms;

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", clip.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setDropTrack(true);
      }}
      onDragLeave={() => setDropTrack(false)}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setDropTrack(false);
        const clipId = e.dataTransfer.getData("text/plain");
        if (!clipId || clipId === clip.id) return;
        // Drop onto another clip: keep the dragged clip's own track, it is
        // only the position that changes.
        onDropClip(clipId, msFromClientX(e.clientX) - clip.duration_ms / 2, clip.track);
      }}
      onClick={(e) => {
        e.stopPropagation();
        // Scissors: a click on the chip cuts it where the pointer landed.
        if (tool === "scissors") {
          onSplitAt(msFromClientX(e.clientX));
          return;
        }
        onSelect();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
        if (e.key === "Delete" || e.key === "Backspace") {
          e.preventDefault();
          onDelete();
        }
        if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
          e.preventDefault();
          const delta = (e.key === "ArrowLeft" ? -1 : 1) * (e.shiftKey ? NUDGE_SHIFT_MS : NUDGE_MS);
          onMove(snapMs(Math.max(0, clip.start_ms + delta)), clip.track);
        }
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onMove(msFromClientX(e.clientX) - clip.duration_ms / 2, clip.track);
      }}
      tabIndex={0}
      role="option"
      aria-selected={selected}
      aria-label={`${clip.track} — ${clipLabel(clip)}`}
      title={clipLabel(clip)}
      className={`group absolute top-1 overflow-hidden rounded border text-[10px] outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${
        tool === "scissors" ? "cursor-crosshair" : "cursor-grab active:cursor-grabbing"
      } ${
        selected ? "ring-2 ring-[var(--accent)]" : ""
      } ${isSilence ? "border-dashed border-[var(--line-strong)]" : "border-white/10"} ${
        dropTrack ? "ring-2 ring-[var(--accent)]" : ""
      }`}
      style={{
        left: start * pxPerMs,
        width,
        height,
        // Track color as a translucent body with a solid top rule, so the
        // label stays legible whatever the row color is.
        background: isSilence
          ? "var(--surface-2)"
          : `color-mix(in oklch, var(${colorVar}) 26%, var(--surface-3))`,
        touchAction: "pan-y",
      }}
    >
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 h-[2.5px]"
        style={{ background: isSilence ? "var(--line-strong)" : `var(${colorVar})` }}
      />

      {/* Waveform for audio rows — real decoded peaks, not a fake zigzag. */}
      {isAudio && !isSilence ? (
        <AudioWaveform
          clip={clip}
          width={width}
          height={height}
          color={`var(${colorVar})`}
          gain={gain}
        />
      ) : null}

      {/* Thumbnail ribbon for video rows: the same still, tiled so the clip
          reads as a strip of frames rather than one stretched image. */}
      {video && !isSilence && clip.assets?.kind === "image" && clip.assets.url ? (
        <div className="flex h-full w-full opacity-85">
          {Array.from({ length: Math.max(1, Math.min(12, Math.round(width / 44))) }).map((_, i) => (
            <img
              key={i}
              src={clip.assets?.url ?? ""}
              alt=""
              loading="lazy"
              draggable={false}
              className="h-full min-w-0 flex-1 object-cover"
            />
          ))}
        </div>
      ) : null}

      <div className="pointer-events-none relative flex h-full flex-col justify-between p-1">
        <span className="truncate font-medium text-[var(--text)]">
          {isSilence ? `${T.silence} ${(clip.duration_ms / 1000).toFixed(1)}s` : clipLabel(clip)}
        </span>
        {isAudio ? (
          <span className="mono truncate text-[8.5px] text-[var(--text-muted)]">
            {gain != null ? `${gainToDb(gain)} dB` : `${(clip.duration_ms / 1000).toFixed(1)}s`}
          </span>
        ) : null}
      </div>

      {isSilence ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <VolumeX size={12} className="text-[var(--text-dim)]" />
        </div>
      ) : null}

      {hasKeyframes(clip) ? (
        <span
          title={T.animation}
          aria-label={T.animation}
          className="absolute top-1.5 right-1 rounded bg-[var(--surface-1)]/80 px-1 text-[8px] font-bold leading-3 text-[var(--text)]"
        >
          ◆
        </span>
      ) : null}

      {hasFadeIn ? (
        <div
          className="absolute inset-y-0 left-0 w-[3px] bg-[var(--accent)]/80"
          title={T.fonduEntree(Math.max(fadeInMs, tInMs))}
        />
      ) : null}
      {hasFadeOut ? (
        <div
          className="absolute inset-y-0 right-0 w-[3px] bg-[var(--accent)]/80"
          title={T.fonduSortie(Math.max(fadeOutMs, tOutMs))}
        />
      ) : null}

      <ResizeGrip
        side="left"
        onStart={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setResize({ side: "left", startX: e.clientX });
        }}
      />
      <ResizeGrip
        side="right"
        onStart={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setResize({ side: "right", startX: e.clientX });
        }}
      />
    </div>
  );
}

function ResizeGrip({
  side,
  onStart,
}: {
  side: "left" | "right";
  onStart: (e: React.MouseEvent) => void;
}) {
  return (
    <div
      onMouseDown={onStart}
      onPointerDown={onStart}
      title={T.astuceRedimensionner}
      style={{ touchAction: "none" }}
      className={`clip-resize absolute inset-y-0 w-1.5 cursor-ew-resize bg-transparent transition-colors hover:bg-[var(--accent)]/60 ${
        side === "left" ? "left-0" : "right-0"
      }`}
    />
  );
}

/**
 * Resize geometry clamped so a resize can never create an overlap that drag
 * forbids: the left edge stops at the previous neighbour's end, the right
 * edge at the next neighbour's start. Dissolves set via the transition tools
 * stay the only legal overlaps.
 */
function computeResize(
  clip: TimelineClip,
  laneClips: TimelineClip[],
  side: "left" | "right",
  dxMs: number,
): { start_ms: number; duration_ms: number } {
  const end = clip.start_ms + clip.duration_ms;
  // Neighbours come from the lane's own list (a lane may own two tracks, e.g.
  // Video + Video 2), filtered to this clip's track so the clamp is exact.
  const others = laneClips.filter((c) => c.id !== clip.id && c.track === clip.track);
  if (side === "left") {
    const prevEnd = Math.max(
      0,
      ...others
        .filter((o) => o.start_ms < end)
        .map((o) => Math.min(o.start_ms + o.duration_ms, end - MIN_DURATION_MS)),
    );
    const newStart = snapMs(
      Math.max(prevEnd, Math.min(clip.start_ms + dxMs, end - MIN_DURATION_MS)),
    );
    return {
      start_ms: newStart,
      duration_ms: snapMs(Math.max(MIN_DURATION_MS, end - newStart)),
    };
  }
  const nextStart = Math.min(
    Number.POSITIVE_INFINITY,
    ...others.filter((o) => o.start_ms >= clip.start_ms).map((o) => o.start_ms),
  );
  return {
    start_ms: clip.start_ms,
    duration_ms: snapMs(
      Math.max(MIN_DURATION_MS, Math.min(clip.duration_ms + dxMs, nextStart - clip.start_ms)),
    ),
  };
}

function clipLabel(clip: TimelineClip): string {
  const raw =
    clip.assets?.prompt ??
    (typeof clip.meta?.prompt === "string" ? (clip.meta.prompt as string) : null) ??
    (clip.assets?.kind ? kindLabel(clip.assets.kind) : null) ??
    clip.track;
  return raw.length > 42 ? `${raw.slice(0, 41)}…` : raw;
}

function gainToDb(gain: number): string {
  if (gain <= 0.001) return "−∞";
  return (20 * Math.log10(Math.max(0.001, gain))).toFixed(1);
}

/* ------------------------------------------------------------------ */
/* SFX one-click add                                                   */
/* ------------------------------------------------------------------ */

function SfxAddButton({ onAdd }: { onAdd: (id: string) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={T.sfxAide}
        aria-label={T.sfxTitre}
        aria-expanded={open}
        className="ghost-btn h-5 w-5 rounded text-[var(--text-dim)] focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
      >
        <Plus size={11} />
      </button>
      {open ? (
        <div className="animate-fade-in absolute top-6 right-0 z-40 w-[190px] overflow-hidden rounded-lg border border-[var(--line-strong)] bg-[var(--surface-3)] p-1 shadow-[var(--shadow-pop)]">
          <div className="px-1.5 pt-1 pb-1.5 text-[9px] font-medium uppercase tracking-widest text-[var(--text-dim)]">
            {T.sfxTitre}
          </div>
          {SFX_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                setOpen(false);
                void onAdd(p.id);
              }}
              title={p.hint}
              className="flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-[11px] text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-4)] hover:text-[var(--text)]"
            >
              <span className="flex-1 truncate">{p.label}</span>
              <span className="mono text-[9px] text-[var(--text-dim)]">
                {(p.durationMs / 1000).toFixed(1)}s
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Library drag payload                                                */
/* ------------------------------------------------------------------ */

export interface AssetDropPayload {
  name: string;
  mime: string;
  durationMs: number;
}

/** dataTransfer type carrying the asset id. */
const ASSET_DRAG_TYPE = "application/x-lilium-asset";
/** dataTransfer type carrying the asset's name, mime and duration. */
const ASSET_PAYLOAD_TYPE = "application/x-lilium-asset-payload";

function readAssetPayload(dt: DataTransfer): AssetDropPayload | null {
  const raw = dt.getData(ASSET_PAYLOAD_TYPE);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<AssetDropPayload>;
    if (typeof parsed.name !== "string" || typeof parsed.mime !== "string") return null;
    return {
      name: parsed.name,
      mime: parsed.mime,
      durationMs:
        typeof parsed.durationMs === "number" && parsed.durationMs > 0 ? parsed.durationMs : 3000,
    };
  } catch {
    return null;
  }
}
