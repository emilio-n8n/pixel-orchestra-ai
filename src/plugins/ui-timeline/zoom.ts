/**
 * Horizontal zoom for the timeline: pixels-per-millisecond, driven by a single
 * slider (0..100). Logarithmic so the useful editing range (≈0.02 → 1.2
 * px/ms) is evenly spread across the travel instead of bunching at one end.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

/** Default: a 60 s project spans ~4 800 px. */
export const DEFAULT_PX_PER_MS = 0.08;
export const MIN_PX_PER_MS = 0.02;
export const MAX_PX_PER_MS = 1.2;

/** Slider position (0..100) → px per ms (log-mapped). */
export function zoomToPxPerMs(zoom: number): number {
  const t = Math.max(0, Math.min(100, zoom)) / 100;
  const lo = Math.log(MIN_PX_PER_MS);
  const hi = Math.log(MAX_PX_PER_MS);
  return Math.exp(lo + (hi - lo) * t);
}

/** px per ms → the inverse slider position, so the thumb lands where it was. */
export function pxPerMsToZoom(pxPerMs: number): number {
  const lo = Math.log(MIN_PX_PER_MS);
  const hi = Math.log(MAX_PX_PER_MS);
  const v = Math.log(Math.max(MIN_PX_PER_MS, Math.min(MAX_PX_PER_MS, pxPerMs)));
  return Math.round(((v - lo) / (hi - lo)) * 100);
}

export function clampZoomDelta(pxPerMs: number, delta: number): number {
  return Math.max(MIN_PX_PER_MS, Math.min(MAX_PX_PER_MS, pxPerMs * delta));
}

interface ZoomState {
  zoom: number;
  setZoom: (z: number) => void;
  /** Relative step (1.2 = 20 % closer) — used by the −/+ buttons and ⌘±. */
  step: (factor: number) => void;
  reset: () => void;
}

export const useZoomStore = create<ZoomState>()(
  persist(
    (set) => ({
      zoom: pxPerMsToZoom(DEFAULT_PX_PER_MS),
      setZoom: (zoom) => set({ zoom: Math.max(0, Math.min(100, Math.round(zoom))) }),
      step: (factor) =>
        set((s) => ({ zoom: pxPerMsToZoom(clampZoomDelta(zoomToPxPerMs(s.zoom), factor)) })),
      reset: () => set({ zoom: pxPerMsToZoom(DEFAULT_PX_PER_MS) }),
    }),
    { name: "lilium.timeline.zoom.v1" },
  ),
);
