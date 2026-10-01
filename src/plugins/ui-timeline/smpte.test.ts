import { describe, expect, it } from "bun:test";
import { formatDurationShort, formatSmpte } from "./smpte";
import { framesToMs, TIMELINE_FPS } from "@/lib/timeline/frames";

describe("formatSmpte — HH:MM:SS:FF", () => {
  it("formats zero as the timeline origin", () => {
    expect(formatSmpte(0)).toBe("00:00:00:00");
  });

  it("formats seconds, minutes and hours", () => {
    expect(formatSmpte(1000)).toBe("00:00:01:00");
    expect(formatSmpte(61_000)).toBe("00:01:01:00");
    expect(formatSmpte(3_661_000)).toBe("01:01:01:00");
  });

  it("counts frames on the 30 fps export grid", () => {
    expect(TIMELINE_FPS).toBe(30);
    // One frame = 1/30 s; rounding must land on the same boundary the
    // encoder uses, so "frame-accurate" is honest.
    expect(formatSmpte(framesToMs(1))).toBe("00:00:00:01");
    expect(formatSmpte(framesToMs(29))).toBe("00:00:00:29");
    // Frame 30 is one second, not frame 30.
    expect(formatSmpte(framesToMs(30))).toBe("00:00:01:00");
  });

  it("never renders a frame above the frame rate", () => {
    for (let ms = 0; ms < 2000; ms += 7) {
      const frames = Number(formatSmpte(ms).slice(-2));
      expect(frames).toBeLessThan(TIMELINE_FPS);
    }
  });

  it("carries the last frame of a second instead of overflowing", () => {
    // 999 ms is frame 30 of second 0 on a 30 fps grid, i.e. the start of the
    // next second — never the impossible "00:00:00:30".
    expect(formatSmpte(999)).toBe("00:00:01:00");
    expect(formatSmpte(1000)).toBe("00:00:01:00");
  });

  it("advances by exactly one frame per frame step", () => {
    // Sub-frame steps legitimately share a readout (13 ms is 0.39 frames), so
    // strict monotonicity is only meaningful across a frame boundary — and
    // there it must be exact, or the timecode would skip or repeat a frame.
    const at = (ms: number) => {
      const [h, m, s, f] = formatSmpte(ms).split(":").map(Number);
      return ((h * 60 + m) * 60 + s) * TIMELINE_FPS + f;
    };
    for (let frame = 0; frame < 150; frame++) {
      expect(at(framesToMs(frame + 1))).toBe(at(framesToMs(frame)) + 1);
    }
  });

  it("pads every field to two digits", () => {
    for (const ms of [0, 1000, 61_000, 3_661_000]) {
      const parts = formatSmpte(ms).split(":");
      expect(parts).toHaveLength(4);
      for (const p of parts) expect(p).toMatch(/^\d{2}$/);
    }
  });

  it("clamps a negative playhead to the origin", () => {
    expect(formatSmpte(-5000)).toBe("00:00:00:00");
  });
});

describe("formatDurationShort", () => {
  it("drops the hour when there is none", () => {
    expect(formatDurationShort(0)).toBe("0:00");
    expect(formatDurationShort(84_000)).toBe("1:24");
  });

  it("adds the hour past 3600 s", () => {
    expect(formatDurationShort(3_661_000)).toBe("1:01:01");
  });
});
