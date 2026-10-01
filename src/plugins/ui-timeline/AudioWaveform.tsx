/**
 * Real audio waveform for the voice / SFX / music rows (spec B.2).
 *
 * Peaks come from `AudioWaveformCanvas`'s shared cache (decoded once per
 * asset URL, LRU-capped) and are drawn on a canvas. The canvas is redrawn
 * only when the geometry, the cached peaks or the live gain change — the
 * playhead itself does not touch it at 60 fps, the gain readout on the chip
 * label is what moves.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { PEAK_BUCKETS, cachedPeaks, primeWaveform, type Peaks } from "./AudioWaveformCanvas";
import type { TimelineClip } from "./store";

/** Decode poll cadence and give-up budget (ms). */
const POLL_MS = 120;
const DECODE_TIMEOUT_MS = 8000;

export function AudioWaveform({
  clip,
  width,
  height,
  color,
  gain,
}: {
  clip: TimelineClip;
  width: number;
  height: number;
  color: string;
  /** Live envelope gain at the playhead, or null when not under it. */
  gain: number | null;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const url = clip.assets?.url ?? null;
  const [peaks, setPeaks] = useState<Peaks | null>(null);

  useEffect(() => {
    if (!url) {
      setPeaks(null);
      return;
    }
    let cancelled = false;
    primeWaveform(url);
    // The cache is module-level, so the decoded peaks arrive through a
    // subscription rather than a return value. Bounded so a file that never
    // decodes (offline, unsupported codec) stops polling instead of spinning.
    const started = performance.now();
    const poll = () => {
      if (cancelled) return;
      const hit = cachedPeaks(url);
      if (hit) {
        setPeaks(hit);
        return;
      }
      if (performance.now() - started < DECODE_TIMEOUT_MS) {
        timer = window.setTimeout(poll, POLL_MS);
      }
    };
    let timer = window.setTimeout(poll, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [url]);

  // Trim offset: a clip may start mid-file, so map the visible window to the
  // right slice of the decoded peaks.
  const slice = useMemo(() => {
    if (!peaks) return null;
    const total = Math.max(1, peaks.durationMs);
    const from = Math.max(0, Math.min(1, clip.start_ms / total));
    const to = Math.max(from + 0.001, Math.min(1, (clip.start_ms + clip.duration_ms) / total));
    return { from, to };
  }, [peaks, clip.start_ms, clip.duration_ms]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const w = Math.max(1, Math.round(width));
    const h = Math.max(1, Math.round(height));
    const dpr = Math.min(2, typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1);
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr;
      canvas.height = h * dpr;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const mid = h / 2;
    const amp = (h / 2) * 0.82 * (gain != null ? Math.max(0.25, gain) : 1);
    ctx.fillStyle = color;

    if (slice && peaks) {
      const startIdx = Math.floor(slice.from * PEAK_BUCKETS);
      const endIdx = Math.max(startIdx + 1, Math.ceil(slice.to * PEAK_BUCKETS));
      const count = endIdx - startIdx;
      const barWidth = w / count;
      ctx.globalAlpha = 0.75;
      for (let i = 0; i < count; i++) {
        const p = peaks.data[startIdx + i];
        const bh = Math.max(1, p * amp);
        ctx.fillRect(i * barWidth, mid - bh, Math.max(0.7, barWidth * 0.7), bh * 2);
      }
    } else {
      // Flat centre line while peaks decode (or when decoding is impossible).
      ctx.globalAlpha = 0.35;
      ctx.fillRect(0, mid - 0.5, w, 1);
    }
    ctx.globalAlpha = 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }, [peaks, slice, width, height, color, gain]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none absolute inset-0 h-full w-full"
      style={{ width, height }}
    />
  );
}
