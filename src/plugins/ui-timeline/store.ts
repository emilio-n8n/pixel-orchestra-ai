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

/* ------------------------------------------------------------------ */
/* WS2 — gesture + subtitle shared constants (single source).          */
/* The panel (canvas) and the Inspector (editors) must render the     */
/* same subtitle style: same defaults, same 120-char clamp.           */
/* ------------------------------------------------------------------ */

/** Snap step for drag / resize / nudge. */
export const SNAP_MS = 10;
/** Minimum clip length — resize and nudge never go below. */
export const MIN_DURATION_MS = 100;
/** Arrow nudge step, Shift+arrow fast step. */
export const NUDGE_MS = 100;
export const NUDGE_SHIFT_MS = 1000;
/** Audio lookahead window for the schedule-ahead starter. */
export const AUDIO_LOOKAHEAD_MS = 200;

/** Snap any ms value to the 10 ms grid. */
export function snapMs(ms: number): number {
  return Math.round(ms / SNAP_MS) * SNAP_MS;
}

export const SUBTITLE_MAX_CHARS = 120;

export const DEFAULT_SUBTITLE_STYLE = {
  font: "system-ui, sans-serif",
  size: 28,
  color: "#ffffff",
  position: "bottom",
} as const;

export interface SubtitleStyle {
  font: string;
  size: number;
  color: string;
  position: "bottom" | "center" | "top";
}

/** Resolve meta.style → full style with Inspector-identical defaults. */
export function resolveSubtitleStyle(meta?: Record<string, unknown> | null): SubtitleStyle {
  const s = (meta?.style ?? {}) as Partial<SubtitleStyle>;
  const position = s.position === "top" || s.position === "center" ? s.position : "bottom";
  return {
    font: typeof s.font === "string" && s.font.length > 0 ? s.font : DEFAULT_SUBTITLE_STYLE.font,
    size:
      typeof s.size === "number" && Number.isFinite(s.size)
        ? Math.min(120, Math.max(10, Math.round(s.size)))
        : DEFAULT_SUBTITLE_STYLE.size,
    color:
      typeof s.color === "string" && s.color.length > 0 ? s.color : DEFAULT_SUBTITLE_STYLE.color,
    position,
  };
}

/** 120-char clamp with ellipsis — canvas and Inspector share it. */
export function formatSubtitleText(raw: string): string {
  // Code-point aware: never split a surrogate pair / grapheme.
  const points = [...raw];
  if (points.length <= SUBTITLE_MAX_CHARS) return raw;
  return `${points.slice(0, SUBTITLE_MAX_CHARS - 1).join("").trimEnd()}…`;
}

/** True when keyboard shortcuts must stay silent (user is typing). */
export function isTypingTarget(t: HTMLElement | null): boolean {
  if (!t) return false;
  const tag = t.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (t.isContentEditable) return true;
  if (t.closest?.('[contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"]'))
    return true;
  if (t.closest?.('[role="textbox"]')) return true;
  return false;
}
