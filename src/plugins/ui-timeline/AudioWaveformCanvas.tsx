/**
 * Decoded audio peaks, cached per asset URL.
 *
 * Split out of the waveform component so the decode logic and its LRU are
 * plain functions with no React in scope — the component, the SFX generator
 * and a future export pre-pass all need the same cache, and a cache that
 * lives inside a component cannot be shared.
 */

import { isHttpUrl } from "./export";

/** Resolution of the peak array. 512 bars is plenty at any zoom we offer. */
export const PEAK_BUCKETS = 512;
/** Bounded so a long project never grows the cache without limit. */
const MAX_CACHE = 12;

export interface Peaks {
  /** Normalised 0..1 peaks, PEAK_BUCKETS long. */
  data: Float32Array;
  /** Decoded media duration, used to trim the visible window. */
  durationMs: number;
}

const cache = new Map<string, Peaks>();

/** Warm the cache for a URL outside React (no-op if already cached). */
export function primeWaveform(url: string): void {
  if (cache.has(url)) return;
  void loadPeaks(url);
}

/** Cached peaks, or undefined if the asset has not been decoded yet. */
export function cachedPeaks(url: string | null | undefined): Peaks | undefined {
  if (!url) return undefined;
  return cache.get(url);
}

async function loadPeaks(url: string): Promise<Peaks | null> {
  if (!isHttpUrl(url)) return null;
  const hit = cache.get(url);
  if (hit) return hit;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    // OfflineAudioContext avoids creating an AudioContext (and claiming an
    // output device) just to read peaks.
    if (typeof OfflineAudioContext === "undefined") return null;
    const offline = new OfflineAudioContext(1, 1, 44100);
    const audio = await offline.decodeAudioData(buf);
    const channel = audio.getChannelData(0);
    const bucketSize = Math.max(1, Math.floor(channel.length / PEAK_BUCKETS));
    const data = new Float32Array(PEAK_BUCKETS);
    for (let b = 0; b < PEAK_BUCKETS; b++) {
      const start = b * bucketSize;
      const end = Math.min(channel.length, start + bucketSize);
      let peak = 0;
      for (let i = start; i < end; i++) {
        const v = Math.abs(channel[i]);
        if (v > peak) peak = v;
      }
      data[b] = peak;
    }
    // Normalise so a quiet recording still reads clearly.
    let max = 0;
    for (let i = 0; i < data.length; i++) if (data[i] > max) max = data[i];
    if (max > 0) for (let i = 0; i < data.length; i++) data[i] /= max;

    const peaks: Peaks = { data, durationMs: Math.round(audio.duration * 1000) };
    cache.set(url, peaks);
    while (cache.size > MAX_CACHE) {
      const oldest = cache.keys().next();
      if (oldest.done) break;
      cache.delete(oldest.value);
    }
    return peaks;
  } catch {
    // Undecodable audio (network, codec, CORS): the caller keeps rendering a
    // flat centre line, which is honest rather than a fake waveform.
    return null;
  }
}
