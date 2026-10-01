import { describe, expect, it } from "bun:test";
import { duckGainAt } from "@/lib/director/ducking";
import {
  DEFAULT_ATTENUATION_DB,
  attenuationToGain,
  computeAutoDucking,
  duckableMusicClips,
  sourceIntervals,
} from "./ducking";
import type { TimelineClip } from "./store";

function clip(over: Partial<TimelineClip> & Pick<TimelineClip, "track">): TimelineClip {
  return {
    id: over.track + over.start_ms,
    start_ms: 0,
    duration_ms: 1000,
    asset_id: "a",
    assets: null,
    meta: {},
    ...over,
  } as TimelineClip;
}

describe("sourceIntervals — what triggers the duck", () => {
  it("collects voice and SFX, never the music bed itself", () => {
    const intervals = sourceIntervals([
      clip({ track: "Audio", start_ms: 1000, duration_ms: 2000 }),
      clip({ track: "SFX", start_ms: 5000, duration_ms: 300 }),
      clip({ track: "Music", start_ms: 0, duration_ms: 9000 }),
    ]);
    expect(intervals).toEqual([
      { start_ms: 1000, end_ms: 3000 },
      { start_ms: 5000, end_ms: 5300 },
    ]);
  });

  it("merges adjacent segments so the duck does not pump between them", () => {
    const intervals = sourceIntervals([
      clip({ track: "Audio", start_ms: 0, duration_ms: 1000 }),
      clip({ track: "Audio", start_ms: 1000, duration_ms: 1000 }),
      clip({ track: "Audio", start_ms: 2000, duration_ms: 1000 }),
    ]);
    expect(intervals).toEqual([{ start_ms: 0, end_ms: 3000 }]);
  });

  it("ignores native silence — it makes no sound to duck under", () => {
    const intervals = sourceIntervals([
      clip({ track: "Audio", start_ms: 0, duration_ms: 2000, meta: { silence: true } }),
    ]);
    expect(intervals).toEqual([]);
  });
});

describe("computeAutoDucking — spec E.1", () => {
  it("attenuates the music bed under a voice segment", () => {
    const clips = [
      clip({ track: "Music", start_ms: 0, duration_ms: 10000 }),
      clip({ track: "Audio", start_ms: 2000, duration_ms: 2000 }),
    ];
    const result = computeAutoDucking(clips, 10000);
    expect(result.empty).toBe(false);
    if (result.empty) return;

    // Spec range: −12 dB to −18 dB.
    expect(result.attenuationDb).toBe(DEFAULT_ATTENUATION_DB);
    expect(result.attenuationDb).toBeLessThanOrEqual(-12);
    expect(result.attenuationDb).toBeGreaterThanOrEqual(-18);

    // The bed is at unity before the voice and after the release.
    expect(duckGainAt(result.curve, 0)).toBeCloseTo(1, 1);
    // …and clearly attenuated while the voice plays.
    const ducked = duckGainAt(result.curve, 3000);
    expect(ducked).toBeLessThan(0.5);
    expect(ducked).toBeGreaterThan(attenuationToGain(-18) * 0.5);
  });

  it("is a no-op with no music to duck", () => {
    const result = computeAutoDucking(
      [clip({ track: "Audio", start_ms: 0, duration_ms: 5000 })],
      10000,
    );
    expect(result.empty).toBe(true);
  });

  it("is a no-op with no voice or SFX to duck under", () => {
    const result = computeAutoDucking(
      [clip({ track: "Music", start_ms: 0, duration_ms: 10000 })],
      10000,
    );
    expect(result.empty).toBe(true);
  });

  it("clamps an out-of-range attenuation into the spec window", () => {
    const clips = [
      clip({ track: "Music", start_ms: 0, duration_ms: 5000 }),
      clip({ track: "Audio", start_ms: 0, duration_ms: 5000 }),
    ];
    const loud = computeAutoDucking(clips, 5000, { attenuationDb: 0 });
    const quiet = computeAutoDucking(clips, 5000, { attenuationDb: -40 });
    if (loud.empty || quiet.empty) throw new Error("expected a curve");
    expect(loud.attenuationDb).toBe(-12);
    expect(quiet.attenuationDb).toBe(-18);
  });

  it("excludes a silence row from the duckable set", () => {
    const clips = [
      clip({ track: "Music", start_ms: 0, duration_ms: 5000 }),
      clip({ track: "Music", start_ms: 5000, duration_ms: 5000, meta: { silence: true } }),
    ];
    expect(duckableMusicClips(clips).map((c) => c.duration_ms)).toEqual([5000]);
  });
});
