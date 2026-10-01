/**
 * Auto-ducking of the music bed (spec E.1): while a voice or SFX segment is
 * audible, track 7 (Music) drops by a configurable dB, with a smooth attack
 * and release so the ear never hears a step.
 *
 * Pure functions over the clip list — the caller persists the resulting curve
 * on each Music clip's `meta.ducking`, which is what `volAt` (preview) and the
 * WebAudio envelope (export) already read.
 */

import { computeDuckingCurve, type GainPoint } from "@/lib/director/ducking";
import { DUCKING_SOURCE_TRACKS, DUCKING_TARGET_TRACK } from "@/lib/ui/labels";
import type { TimelineClip } from "./store";

/** Defaults from the spec: −12 dB to −18 dB depending on the mix. */
export const DEFAULT_ATTENUATION_DB = -14;
export const MIN_ATTENUATION_DB = -18;
export const MAX_ATTENUATION_DB = -12;

export const DEFAULT_ATTACK_MS = 120;
export const DEFAULT_RELEASE_MS = 380;

/** Absolute intervals during which any ducking source track is audible. */
export function sourceIntervals(
  clips: TimelineClip[],
  sourceTracks: readonly string[] = DUCKING_SOURCE_TRACKS,
): Array<{ start_ms: number; end_ms: number }> {
  const out: Array<{ start_ms: number; end_ms: number }> = [];
  for (const c of clips) {
    if (!sourceTracks.includes(c.track)) continue;
    // A native silence clip makes no sound: it must not trigger a duck.
    if (c.meta?.silence === true) continue;
    out.push({ start_ms: c.start_ms, end_ms: c.start_ms + c.duration_ms });
  }
  return mergeIntervals(out);
}

/** The music clips that would receive the curve. */
export function duckableMusicClips(clips: TimelineClip[]): TimelineClip[] {
  return clips.filter((c) => c.track === DUCKING_TARGET_TRACK && c.meta?.silence !== true);
}

export interface AutoDuckOptions {
  attenuationDb?: number;
  attackMs?: number;
  releaseMs?: number;
  stepMs?: number;
}

export interface AutoDuckResult {
  /** Nothing to duck — no music clip, or no voice/SFX to duck under. */
  empty: true;
}

export interface AutoDuckApplied {
  empty: false;
  clipIds: string[];
  curve: GainPoint[];
  attenuationDb: number;
}

/**
 * Build the ducking curve for the whole project and return the per-clip meta
 * patch to persist. Clips outside the curve's range keep gain 1, so writing
 * the same curve on every music clip is correct and cheap to re-apply.
 */
export function computeAutoDucking(
  clips: TimelineClip[],
  totalMs: number,
  options: AutoDuckOptions = {},
): AutoDuckApplied | AutoDuckResult {
  const music = duckableMusicClips(clips);
  const intervals = sourceIntervals(clips);
  if (music.length === 0 || intervals.length === 0) return { empty: true };

  const attenuationDb = clampAttenuation(options.attenuationDb ?? DEFAULT_ATTENUATION_DB);
  const curve = computeDuckingCurve({
    sourceIntervals: intervals,
    totalMs: Math.max(1, totalMs),
    attenuationDb,
    attackMs: options.attackMs ?? DEFAULT_ATTACK_MS,
    releaseMs: options.releaseMs ?? DEFAULT_RELEASE_MS,
    stepMs: options.stepMs,
  });
  return {
    empty: false,
    clipIds: music.map((c) => c.id),
    curve,
    attenuationDb,
  };
}

/** Gain multiplier a −X dB attenuation corresponds to (0 dB → 1). */
export function attenuationToGain(db: number): number {
  return Math.pow(10, db / 20);
}

function clampAttenuation(db: number): number {
  if (!Number.isFinite(db)) return DEFAULT_ATTENUATION_DB;
  return Math.max(MIN_ATTENUATION_DB, Math.min(MAX_ATTENUATION_DB, db));
}

/** Union of intervals, sorted — many adjacent voice clips duck once. */
function mergeIntervals(
  intervals: Array<{ start_ms: number; end_ms: number }>,
): Array<{ start_ms: number; end_ms: number }> {
  if (intervals.length === 0) return [];
  const sorted = [...intervals].sort((a, b) => a.start_ms - b.start_ms);
  const out: Array<{ start_ms: number; end_ms: number }> = [];
  let cur = { ...sorted[0] };
  for (const iv of sorted.slice(1)) {
    if (iv.start_ms <= cur.end_ms) cur.end_ms = Math.max(cur.end_ms, iv.end_ms);
    else {
      out.push(cur);
      cur = { ...iv };
    }
  }
  out.push(cur);
  return out;
}
