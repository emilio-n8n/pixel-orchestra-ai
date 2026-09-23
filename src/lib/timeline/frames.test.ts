/**
 * Frame grid + chapter helpers (shared by the export engine and the
 * Director's trim/marker tools). Run with `bun test`.
 */
import { describe, it, expect } from "bun:test";
import {
  FRAME_MS,
  TIMELINE_FPS,
  formatChapterTime,
  framesToMs,
  msToFrames,
  snapToFrame,
  snapToNearest,
} from "./frames";

describe("frame grid", () => {
  it("uses the export grid (30 fps)", () => {
    expect(TIMELINE_FPS).toBe(30);
    expect(FRAME_MS).toBeCloseTo(33.3333, 3);
  });
  it("converts frames ↔ ms", () => {
    expect(framesToMs(1)).toBe(33);
    expect(framesToMs(30)).toBe(1000);
    expect(msToFrames(1000)).toBe(30);
  });
  it("snaps to the nearest frame boundary", () => {
    expect(snapToFrame(0)).toBe(0);
    expect(snapToFrame(1000)).toBe(1000);
    expect(snapToFrame(1010)).toBe(1000);
    expect(snapToFrame(1033)).toBe(1033);
    expect(snapToFrame(1040)).toBe(1033);
  });
});

describe("snapToNearest — magnetic snap", () => {
  it("snaps to a target within the tolerance", () => {
    expect(snapToNearest(1080, [1000, 2000], 100)).toBe(1000);
    expect(snapToNearest(1950, [1000, 2000], 100)).toBe(2000);
  });
  it("keeps the value when no target is close enough", () => {
    expect(snapToNearest(1500, [1000, 2000], 100)).toBe(1500);
  });
  it("picks the closest target", () => {
    expect(snapToNearest(1490, [1400, 1520], 100)).toBe(1520);
  });
});

describe("formatChapterTime — YouTube chapters", () => {
  it("formats minutes and seconds", () => {
    expect(formatChapterTime(0)).toBe("0:00");
    expect(formatChapterTime(9000)).toBe("0:09");
    expect(formatChapterTime(83_000)).toBe("1:23");
  });
  it("formats hours with padded minutes", () => {
    expect(formatChapterTime(3_723_000)).toBe("1:02:03");
  });
  it("clamps negative input", () => {
    expect(formatChapterTime(-5000)).toBe("0:00");
  });
});
