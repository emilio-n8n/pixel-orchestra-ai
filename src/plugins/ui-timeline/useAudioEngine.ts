/**
 * Playback audio engine (preview side).
 *
 * Extracted from the old monolithic timeline panel so the player monitor can
 * own sound without owning the tracks. The rules that make the mix correct:
 *
 *  - one <audio> element per audible clip, started with the right offset
 *  - a 200 ms look-ahead that fires each clip's timer exactly on its downbeat
 *    (play() is immediate, so starting early would be audible as a lead)
 *  - the gain envelope (fades × ducking) re-applied every frame from `volAt`
 *    — the exact same function the export uses, so what you hear is the file
 *  - elements are released as soon as their clip ends, never left playing
 */

import { useEffect, useRef } from "react";
import { isHttpUrl, volAt } from "./export";
import { AUDIO_LOOKAHEAD_MS, type TimelineClip } from "./store";

/** Legacy track names that carry sound. */
const AUDIO_TRACKS = new Set(["Audio", "Music", "SFX"]);

export function useAudioEngine({
  clips,
  playing,
  getPlayhead,
  getTotalMs,
  onEnded,
}: {
  clips: TimelineClip[];
  playing: boolean;
  /** Current playhead in ms, read every frame (never stale React state). */
  getPlayhead: () => number;
  /** Project length in ms, read on the same hot path as the playhead. */
  getTotalMs: () => number;
  /** Called when the playhead reaches the end of the project. */
  onEnded: () => void;
}) {
  const audiosRef = useRef<HTMLAudioElement[]>([]);
  const audioMapRef = useRef<Map<string, { el: HTMLAudioElement; clip: TimelineClip }>>(new Map());
  const startedIdsRef = useRef<Set<string>>(new Set());
  const scheduledIdsRef = useRef<Set<string>>(new Set());
  const pendingTimersRef = useRef<number[]>([]);
  const clipsRef = useRef<TimelineClip[]>(clips);
  const rafRef = useRef<number | null>(null);
  clipsRef.current = clips;

  const stopAudios = () => {
    audiosRef.current.forEach((a) => {
      try {
        a.pause();
      } catch {
        /* noop */
      }
    });
    audiosRef.current = [];
    audioMapRef.current.clear();
    startedIdsRef.current.clear();
    scheduledIdsRef.current.clear();
    pendingTimersRef.current.forEach((t) => window.clearTimeout(t));
    pendingTimersRef.current = [];
  };

  /** Start one clip's element with the correct offset and envelope. */
  const startAudioFor = (clip: TimelineClip, atMs: number) => {
    if (!isHttpUrl(clip.assets?.url)) return;
    if (startedIdsRef.current.has(clip.id)) return;
    startedIdsRef.current.add(clip.id);
    const a = new Audio(clip.assets.url);
    a.crossOrigin = "anonymous";
    a.preload = "auto";
    const offset = Math.max(0, (atMs - clip.start_ms) / 1000);
    try {
      a.currentTime = offset;
    } catch {
      /* not yet seekable — play from 0 */
    }
    try {
      a.volume = volAt(clip, atMs);
    } catch {
      /* not ready */
    }
    a.play().catch(() => {});
    audiosRef.current.push(a);
    audioMapRef.current.set(clip.id, { el: a, clip });
  };

  useEffect(() => {
    if (!playing) {
      stopAudios();
      return;
    }
    const totalMs = getTotalMs();
    const startFrom = getPlayhead() >= totalMs ? 0 : getPlayhead();
    const startedAt = performance.now();
    startedIdsRef.current.clear();
    scheduledIdsRef.current.clear();
    pendingTimersRef.current.forEach((t) => window.clearTimeout(t));
    pendingTimersRef.current = [];

    // Prime every audible clip: active now, or preloaded for the look-ahead.
    for (const c of clipsRef.current) {
      if (!AUDIO_TRACKS.has(c.track) || !isHttpUrl(c.assets?.url)) continue;
      if (startFrom >= c.start_ms && startFrom < c.start_ms + c.duration_ms) {
        startAudioFor(c, startFrom);
      } else if (startFrom < c.start_ms) {
        try {
          const probe = new Audio(c.assets.url);
          probe.preload = "auto";
          probe.load();
        } catch {
          /* preload is best-effort */
        }
      }
    }

    function tick() {
      const p = startFrom + (performance.now() - startedAt);
      if (p >= totalMs) {
        onEnded();
        stopAudios();
        return;
      }
      // Look-ahead: start clips up to 200 ms before their downbeat, but never
      // early — a timer fires exactly on the beat instead.
      for (const c of clipsRef.current) {
        if (!AUDIO_TRACKS.has(c.track) || !isHttpUrl(c.assets?.url)) continue;
        if (startedIdsRef.current.has(c.id) || scheduledIdsRef.current.has(c.id)) continue;
        if (p + AUDIO_LOOKAHEAD_MS >= c.start_ms && p < c.start_ms + c.duration_ms) {
          if (p >= c.start_ms) {
            startAudioFor(c, p);
          } else {
            scheduledIdsRef.current.add(c.id);
            const clipId = c.id;
            const headMs = c.start_ms;
            const t: number = window.setTimeout(() => {
              pendingTimersRef.current = pendingTimersRef.current.filter((x) => x !== t);
              scheduledIdsRef.current.delete(clipId);
              // Re-lookup at fire time: a moved or deleted clip must not play.
              const fresh = clipsRef.current.find((x) => x.id === clipId);
              if (!fresh || fresh.start_ms !== headMs) return;
              if (!AUDIO_TRACKS.has(fresh.track) || !isHttpUrl(fresh.assets?.url)) return;
              startAudioFor(fresh, fresh.start_ms);
            }, c.start_ms - p);
            pendingTimersRef.current.push(t);
          }
        }
      }
      // Envelope each frame; release elements whose clip has ended.
      for (const [id, entry] of audioMapRef.current) {
        const end = entry.clip.start_ms + entry.clip.duration_ms;
        if (p >= end) {
          try {
            entry.el.pause();
          } catch {
            /* element already gone */
          }
          audiosRef.current = audiosRef.current.filter((a) => a !== entry.el);
          audioMapRef.current.delete(id);
          continue;
        }
        try {
          entry.el.volume = volAt(entry.clip, p);
        } catch {
          /* element already gone */
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      stopAudios();
    };
  }, [playing, getPlayhead, getTotalMs, onEnded]);

  // Never leave audio running after unmount.
  useEffect(
    () => () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      stopAudios();
    },
    [],
  );
}
