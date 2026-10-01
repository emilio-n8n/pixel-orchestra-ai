import { describe, expect, it } from "bun:test";
import { canSplitAt, clipsUnderPlayhead, splitClipAt } from "./split";
import { MIN_DURATION_MS, type TimelineClip } from "./store";

function clip(over: Partial<TimelineClip> = {}): TimelineClip {
  return {
    id: "c1",
    track: "Video",
    start_ms: 1000,
    duration_ms: 5000,
    asset_id: "a1",
    assets: { kind: "video", url: "https://x/y.mp4", prompt: "rush" },
    meta: {},
    ...over,
  };
}

describe("splitClipAt — the left half keeps the id", () => {
  it("splits a clip at the playhead and preserves continuity", () => {
    const r = splitClipAt(clip(), 3000);
    expect(r).not.toBeNull();
    // The left half is the same row (realtime, selection and agent refs stay
    // valid); only the right half needs an insert.
    expect(r!.left.id).toBe("c1");
    expect(r!.left.start_ms).toBe(1000);
    expect(r!.left.duration_ms).toBe(2000);
    // No gap, no overlap: the pieces meet exactly at the cut.
    expect(r!.left.start_ms + r!.left.duration_ms).toBe(r!.right.start_ms);
    expect(r!.right.duration_ms).toBe(3000);
    // Total duration is conserved — splitting must not shorten the plan.
    expect(r!.left.duration_ms + r!.right.duration_ms).toBe(5000);
  });

  it("carries the asset and track onto both halves", () => {
    const r = splitClipAt(clip(), 2500)!;
    expect(r.left.track).toBe("Video");
    expect(r.right.track).toBe("Video");
    expect(r.left.asset_id).toBe(r.right.asset_id);
    expect(r.right.assets?.url).toBe(clip().assets?.url);
  });

  it("keeps each fade on the half whose edge it belongs to", () => {
    const c = clip({ duration_ms: 2000, meta: { fade_in_ms: 1500, fade_out_ms: 400 } });
    const r = splitClipAt(c, 2000)!;
    // Both halves are 1000 ms. The fade-in is attached to the left edge, but
    // 1500 ms no longer fits that half, so it is dropped. The fade-out is
    // attached to the (now) right edge and 400 ms still fits — but it is the
    // RIGHT half that keeps it, and only the right half.
    expect(r.left.meta?.fade_in_ms).toBe(0);
    // The right half starts on a hard cut, so it has no fade-in...
    expect(r.right.meta?.fade_in_ms).toBe(0);
    // ...but the original fade-out, now on its end edge, still fits.
    expect(r.right.meta?.fade_out_ms).toBe(400);
    // The left half ends on the cut, so the original fade-out is gone.
    expect(r.left.meta?.fade_out_ms).toBe(0);
  });

  it("keeps a fade that still fits its new segment", () => {
    const c = clip({ duration_ms: 4000, meta: { fade_in_ms: 300, fade_out_ms: 500 } });
    const r = splitClipAt(c, 3000)!;
    expect(r.left.meta?.fade_in_ms).toBe(300);
    expect(r.right.meta?.fade_out_ms).toBe(500);
  });

  it("drops transitions on the edge the cut replaced", () => {
    const c = clip({
      duration_ms: 4000,
      meta: { transition_in_ms: 200, transition_out_ms: 900 },
    });
    const r = splitClipAt(c, 2000)!;
    expect(r.left.meta?.transition_in_ms).toBe(200);
    expect(r.left.meta?.transition_out_ms).toBe(0);
    expect(r.right.meta?.transition_in_ms).toBe(0);
    expect(r.right.meta?.transition_out_ms).toBe(900);
  });

  it("refuses a cut that would leave a degenerate piece", () => {
    expect(splitClipAt(clip(), 1000)).toBeNull();
    expect(splitClipAt(clip(), 6000)).toBeNull();
    expect(splitClipAt(clip(), 1000 + MIN_DURATION_MS)).toBeNull();
    expect(splitClipAt(clip(), 6000 - MIN_DURATION_MS)).toBeNull();
  });

  it("clamps a negative playhead instead of splitting before the clip", () => {
    expect(canSplitAt(clip(), -500)).toBe(false);
    expect(splitClipAt(clip(), -500)).toBeNull();
  });

  it("never produces a zero-length half", () => {
    const c = clip({ duration_ms: MIN_DURATION_MS * 2 + 20 });
    const r = splitClipAt(c, c.start_ms + MIN_DURATION_MS + 5)!;
    expect(r.left.duration_ms).toBeGreaterThanOrEqual(MIN_DURATION_MS);
    expect(r.right.duration_ms).toBeGreaterThanOrEqual(MIN_DURATION_MS);
  });
});

describe("clipsUnderPlayhead — split-all scope", () => {
  const clips = [
    clip({ id: "a", track: "Video", start_ms: 0, duration_ms: 5000 }),
    clip({ id: "b", track: "Audio", start_ms: 2000, duration_ms: 5000 }),
    clip({ id: "c", track: "Music", start_ms: 0, duration_ms: 1000 }),
  ];

  it("returns every clip the playhead crosses, across tracks", () => {
    const hit = clipsUnderPlayhead(clips, 3000);
    expect(hit.map((c) => c.id).sort()).toEqual(["a", "b"]);
  });

  it("ignores clips that merely touch the playhead", () => {
    // The music clip ends exactly at 1000: nothing to cut.
    expect(clipsUnderPlayhead(clips, 1000).map((c) => c.id)).toEqual(["a"]);
  });

  it("returns nothing on an empty timeline", () => {
    expect(clipsUnderPlayhead([], 1234)).toEqual([]);
  });
});
