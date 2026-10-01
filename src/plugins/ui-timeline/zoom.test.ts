import { describe, expect, it } from "bun:test";
import {
  DEFAULT_PX_PER_MS,
  MAX_PX_PER_MS,
  MIN_PX_PER_MS,
  clampZoomDelta,
  pxPerMsToZoom,
  zoomToPxPerMs,
} from "./zoom";

describe("zoom ↔ pxPerMs — round-trip", () => {
  it("is the inverse of itself across the whole range", () => {
    for (let z = 0; z <= 100; z += 5) {
      const back = pxPerMsToZoom(zoomToPxPerMs(z));
      // 1 unit of rounding on a 0..100 log scale is sub-pixel.
      expect(Math.abs(back - z)).toBeLessThanOrEqual(1);
    }
  });

  it("maps the slider ends onto the documented bounds", () => {
    expect(zoomToPxPerMs(0)).toBeCloseTo(MIN_PX_PER_MS, 6);
    expect(zoomToPxPerMs(100)).toBeCloseTo(MAX_PX_PER_MS, 6);
  });

  it("keeps the default in the middle of the travel, not bunched at one end", () => {
    const z = pxPerMsToZoom(DEFAULT_PX_PER_MS);
    expect(z).toBeGreaterThan(20);
    expect(z).toBeLessThan(80);
  });

  it("clamps out-of-range slider values", () => {
    expect(zoomToPxPerMs(-50)).toBeCloseTo(MIN_PX_PER_MS, 6);
    expect(zoomToPxPerMs(500)).toBeCloseTo(MAX_PX_PER_MS, 6);
  });

  it("clamps out-of-range pxPerMs back into the range", () => {
    expect(clampZoomDelta(MAX_PX_PER_MS, 2)).toBe(MAX_PX_PER_MS);
    expect(clampZoomDelta(MIN_PX_PER_MS, 0.5)).toBe(MIN_PX_PER_MS);
    expect(clampZoomDelta(0.1, 1.25)).toBeCloseTo(0.125, 6);
  });

  it("spreads the useful editing range across the travel", () => {
    // A 60 s project: 1.2 px/ms = 72 000 px, 0.02 px/ms = 1 200 px.
    const wide = zoomToPxPerMs(100) * 60_000;
    const tight = zoomToPxPerMs(0) * 60_000;
    expect(wide / tight).toBeGreaterThan(50);
  });
});
