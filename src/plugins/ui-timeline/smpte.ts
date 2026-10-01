/**
 * SMPTE timecode (HH:MM:SS:FF) for the timeline transport.
 *
 * Frame rate matches the export grid (30 fps, lib/timeline/frames.ts) so the
 * number the user reads is the exact frame the encoder will write — a
 * "frame-accurate" cut lands on a real frame boundary of the file.
 */

import { TIMELINE_FPS } from "@/lib/timeline/frames";

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/**
 * Absolute ms → "00:03:12:07". Negative input clamps to zero.
 *
 * The whole duration is converted to a frame count first and then split into
 * fields, so the carry is always correct: 999 ms is frame 30 of second 0, i.e.
 * "00:00:01:00", never an out-of-range ":30" field. Converting each field
 * independently (the naive version) is what produces those bogus frames.
 */
export function formatSmpte(ms: number): string {
  const safe = Math.max(0, Math.round(ms));
  const totalFrames = Math.round((safe / 1000) * TIMELINE_FPS);
  const frames = totalFrames % TIMELINE_FPS;
  const totalSeconds = Math.floor(totalFrames / TIMELINE_FPS);
  const s = totalSeconds % 60;
  const m = Math.floor(totalSeconds / 60) % 60;
  const h = Math.floor(totalSeconds / 3600);
  return `${pad2(h)}:${pad2(m)}:${pad2(s)}:${pad2(frames)}`;
}

/** Compact duration readout for the transport, e.g. "1:24". */
export function formatDurationShort(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}:${pad2(m)}:${pad2(s)}`;
  return `${m}:${pad2(s)}`;
}
