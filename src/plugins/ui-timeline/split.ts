/**
 * Split (scissors) tool — pure geometry, no DOM and no Supabase.
 *
 * A split never moves a clip: the left half keeps the id (so realtime, the
 * Inspector selection and any agent reference stay valid) and the right half
 * is a brand-new clip the caller must insert. That keeps undo/redo and the
 * event-bus log honest — a split is always one delete-free insert.
 */

import { MIN_DURATION_MS, snapMs, type TimelineClip } from "./store";

/** A clip split in two at `atMs`. `right` is unsaved: no id yet. */
export interface SplitResult {
  left: TimelineClip;
  right: TimelineClip;
}

/** True when `atMs` lands strictly inside the clip with room on both sides. */
export function canSplitAt(clip: TimelineClip, atMs: number): boolean {
  const cut = clip.start_ms + atMs - clip.start_ms;
  return (
    cut > clip.start_ms + MIN_DURATION_MS &&
    cut < clip.start_ms + clip.duration_ms - MIN_DURATION_MS
  );
}

/**
 * Split a single clip at the absolute time `atMs`. Returns null when the cut
 * would leave a degenerate piece (nothing to do, never a broken clip).
 */
export function splitClipAt(clip: TimelineClip, atMs: number): SplitResult | null {
  if (!canSplitAt(clip, atMs)) return null;
  const cut = snapMs(atMs);
  const leftDuration = Math.max(MIN_DURATION_MS, cut - clip.start_ms);
  const rightDuration = Math.max(MIN_DURATION_MS, clip.duration_ms - leftDuration);
  return {
    // A fade belongs to a clip EDGE, and the cut creates a new edge in the
    // middle of the original. So each half keeps only the fade on the edge it
    // still owns — the left keeps fade-in, the right keeps fade-out — and the
    // other is dropped rather than moved to a boundary that has none. A fade
    // longer than its new segment is dropped too, so the export envelope never
    // asks for more than the clip can play.
    left: {
      ...clip,
      duration_ms: leftDuration,
      meta: keepEdgeFades(clip.meta, "in", leftDuration),
    },
    right: {
      ...clip,
      // Placeholder id — the caller replaces it with the inserted row's id.
      id: `${clip.id}::split`,
      start_ms: clip.start_ms + leftDuration,
      duration_ms: rightDuration,
      meta: keepEdgeFades(clip.meta, "out", rightDuration),
    },
  };
}

/** Every clip on the project that the playhead actually crosses. */
export function clipsUnderPlayhead(clips: TimelineClip[], atMs: number): TimelineClip[] {
  return clips.filter(
    (c) =>
      atMs > c.start_ms + MIN_DURATION_MS && atMs < c.start_ms + c.duration_ms - MIN_DURATION_MS,
  );
}

/**
 * Keep only the fade on `edge`, dropping the other (the cut replaced it with a
 * hard edge) and dropping the kept one when it is longer than `duration`.
 */
function keepEdgeFades(
  meta: Record<string, unknown> | null | undefined,
  edge: "in" | "out",
  duration: number,
): Record<string, unknown> | null {
  if (!meta) return meta ?? null;
  const next: Record<string, unknown> = { ...meta };
  const drop: Array<[string, string]> =
    edge === "in"
      ? [
          ["fade_out_ms", "fade_in_ms"],
          ["transition_out_ms", "transition_in_ms"],
        ]
      : [
          ["fade_in_ms", "fade_out_ms"],
          ["transition_in_ms", "transition_out_ms"],
        ];
  for (const [removedKey, keptKey] of drop) {
    next[removedKey] = 0;
    if (numOf(next[keptKey]) > duration) next[keptKey] = 0;
  }
  return next;
}

function numOf(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}
