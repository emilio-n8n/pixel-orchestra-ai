/**
 * Frame grid + time helpers shared by the export engine (browser) and the
 * Director's edit tools (server) — no DOM, no store, importable anywhere.
 *
 * The grid is the export grid: 30 fps, so a "frame-accurate" trim lands
 * exactly on a frame boundary of the encoded file.
 */

export const TIMELINE_FPS = 30;
export const FRAME_MS = 1000 / TIMELINE_FPS;

/** ms → whole frames on the export grid. */
export function msToFrames(ms: number): number {
  return Math.round(ms / FRAME_MS);
}

/** Whole frames → ms (integer, same grid as the encoder). */
export function framesToMs(frames: number): number {
  return Math.round(frames * FRAME_MS);
}

/** Snap a duration/time to the frame grid. */
export function snapToFrame(ms: number): number {
  return framesToMs(msToFrames(ms));
}

/**
 * Magnetic snap: nearest target (clip edges, 0, playhead) within
 * `toleranceMs`, otherwise the value is left untouched.
 */
export function snapToNearest(ms: number, targets: number[], toleranceMs = 100): number {
  let best = ms;
  let bestDist = toleranceMs;
  for (const target of targets) {
    const d = Math.abs(target - ms);
    if (d <= bestDist) {
      best = target;
      bestDist = d;
    }
  }
  return best;
}

/** YouTube chapter timestamp: m:ss, or h:mm:ss past the hour. */
export function formatChapterTime(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  return `${h > 0 ? `${h}:` : ""}${mm}:${String(s).padStart(2, "0")}`;
}
