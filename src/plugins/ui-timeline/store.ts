// Shared UI state for the timeline panel + the Inspector's clip editor.
// The panel owns the real clip list (Supabase realtime); the store only
// tracks which clip the user selected so the right panel can edit it.

import { create } from "zustand";

export interface TimelineClip {
  id: string;
  track: string;
  start_ms: number;
  duration_ms: number;
  asset_id: string | null;
  assets: { kind: string; url: string; prompt: string | null } | null;
  meta?: Record<string, unknown> | null;
}

interface TimelineUiState {
  selectedClipId: string | null;
  /** Full clip object behind selectedClipId — kept in sync by the panel. */
  selectedClip: TimelineClip | null;
  selectClip: (id: string | null) => void;
}

export const useTimelineUi = create<TimelineUiState>((set) => ({
  selectedClipId: null,
  selectedClip: null,
  selectClip: (id) => set({ selectedClipId: id }),
}));

/** Fade envelope (ms) stored on a clip via update_timeline_clip / set_clip_transitions. */
export function clipFades(c: TimelineClip): { fadeInMs: number; fadeOutMs: number } {
  const meta = c.meta ?? {};
  const fadeInMs = typeof meta.fade_in_ms === "number" ? meta.fade_in_ms : 0;
  const fadeOutMs = typeof meta.fade_out_ms === "number" ? meta.fade_out_ms : 0;
  return { fadeInMs, fadeOutMs };
}

/** Visual transitions (video fade from/to black), stored by set_clip_transitions. */
export function clipTransitions(c: TimelineClip): {
  inMs: number;
  outMs: number;
} {
  const meta = c.meta ?? {};
  const inMs = typeof meta.transition_in_ms === "number" ? meta.transition_in_ms : 0;
  const outMs = typeof meta.transition_out_ms === "number" ? meta.transition_out_ms : 0;
  return { inMs, outMs };
}
