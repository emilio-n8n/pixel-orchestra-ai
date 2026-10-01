/**
 * 16:9 player monitor for the third top column (spec A.2.3).
 *
 * Decoupled from the timeline layout: the monitor owns its own transport
 * (play/pause, timecode, fullscreen) and renders the shared canvas renderer,
 * so it can be resized, hidden or moved without touching the NLE below.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Maximize2, Minimize2, Pause, Play, Square, VolumeX } from "lucide-react";
import {
  EXPORT_HEIGHT as LOGICAL_H,
  EXPORT_WIDTH as LOGICAL_W,
  isHttpUrl,
  renderTimelineFrame,
  runExport,
  pickExportMime,
  progressFraction,
  clipTransformAt,
  ExportError,
} from "@/plugins/ui-timeline/export";
import { useProjectTimeline } from "@/plugins/ui-timeline/ProjectTimelineProvider";
import { useAudioEngine } from "@/plugins/ui-timeline/useAudioEngine";
import type { TimelineClip } from "@/plugins/ui-timeline/store";
import { formatSmpte, formatDurationShort } from "@/plugins/ui-timeline/smpte";
import { insertSilenceClip } from "@/plugins/ui-timeline/server";
import { useLibraryProject } from "@/plugins/library/project";
import {
  EXPORT_LABELS,
  UI_LABELS,
  exportErrorMessage,
  exportFileName,
  exportPhaseLabel,
} from "@/lib/ui/labels";
import { formatTimeMs as fmt } from "@/plugins/ui-timeline/export";

const T = UI_LABELS.timeline;

/** Bounded LRU so a long project never grows the image cache without limit. */
const MAX_IMG_CACHE = 60;

export function PlayerMonitor() {
  const tl = useProjectTimeline();
  const pid = useLibraryProject();
  const { clips, totalMs, playhead, playing, toggle, stop, seek, seekFast } = tl;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const imgCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const videoElsRef = useRef<Map<string, HTMLVideoElement>>(new Map());
  const htmlOverlayRef = useRef<HTMLIFrameElement>(null);
  const clipsRef = useRef<TimelineClip[]>(clips);
  const playheadRef = useRef(playhead);
  // Read by the audio engine's rAF loop: React state would be stale there.
  const totalMsRef = useRef(totalMs);
  const activeHtmlIdRef = useRef<string | null>(null);
  const currentHtmlUrlRef = useRef<string | null>(null);
  const [activeHtmlClip, setActiveHtmlClip] = useState<TimelineClip | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportPct, setExportPct] = useState(0);
  const [exportLabel, setExportLabel] = useState<string | null>(null);
  const [exportNote, setExportNote] = useState<string | null>(null);
  const [silenceSecs, setSilenceSecs] = useState("1.5");
  const [addingSilence, setAddingSilence] = useState(false);
  const cancelRef = useRef<AbortController | null>(null);
  const exportUiRef = useRef({ frac: -1, at: 0 });

  clipsRef.current = clips;
  playheadRef.current = playhead;
  totalMsRef.current = totalMs;

  /* ---------------- image preload (LRU-capped + decode) ---------------- */
  useEffect(() => {
    const cache = imgCacheRef.current;
    const live = new Set<string>();
    for (const c of clips) {
      if (c.assets?.kind === "image" && isHttpUrl(c.assets.url)) live.add(c.assets.url);
    }
    for (const key of [...cache.keys()]) {
      if (live.has(key)) continue;
      try {
        cache.get(key)?.removeAttribute("src");
      } catch {
        /* noop */
      }
      cache.delete(key);
    }
    for (const url of live) {
      if (cache.has(url)) continue;
      while (cache.size >= MAX_IMG_CACHE) {
        const oldest = cache.keys().next();
        if (oldest.done) break;
        try {
          cache.get(oldest.value)?.removeAttribute("src");
        } catch {
          /* noop */
        }
        cache.delete(oldest.value);
      }
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.decoding = "async";
      img.src = url;
      // Warm the decoder off the critical path so the first paint doesn't hitch.
      if (typeof img.decode === "function") img.decode().catch(() => {});
      cache.set(url, img);
    }
  }, [clips]);

  /* ---------------- muted picture sources for video clips ---------------- */
  useEffect(() => {
    const map = videoElsRef.current;
    const live = new Set<string>();
    for (const c of clips) {
      if (c.assets?.kind !== "video" || !isHttpUrl(c.assets.url)) continue;
      if (c.track !== "Video" && c.track !== "Video 2" && c.track !== "Video 3") continue;
      live.add(c.id);
      const existing = map.get(c.id);
      if (!existing) {
        const ve = document.createElement("video");
        ve.src = c.assets.url;
        ve.preload = "auto";
        ve.muted = true;
        (ve as HTMLVideoElement & { playsInline?: boolean }).playsInline = true;
        ve.style.display = "none";
        document.body.appendChild(ve);
        map.set(c.id, ve);
      } else if (existing.src !== c.assets.url) {
        existing.src = c.assets.url;
      }
    }
    for (const [id, ve] of [...map]) {
      if (live.has(id)) continue;
      try {
        ve.pause();
      } catch {
        /* noop */
      }
      ve.removeAttribute("src");
      ve.remove();
      map.delete(id);
    }
  }, [clips]);

  useEffect(
    () => () => {
      videoElsRef.current.forEach((ve) => {
        try {
          ve.pause();
        } catch {
          /* noop */
        }
        ve.removeAttribute("src");
        ve.remove();
      });
      videoElsRef.current.clear();
    },
    [],
  );

  /* ---------------- shared renderer (preview ≡ export) ---------------- */
  const draw = useCallback((ms: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = canvas.width / LOGICAL_W || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Scrub/pause path: paused video elements seek to the exact offset so the
    // still frame matches the playhead (during playback the tick plays them).
    for (const [id, ve] of videoElsRef.current) {
      const c = clipsRef.current.find((x) => x.id === id);
      if (!c) continue;
      const inClip = ms >= c.start_ms && ms < c.start_ms + c.duration_ms;
      if (ve.paused && inClip && ve.readyState >= 1) {
        const want = (ms - c.start_ms) / 1000;
        try {
          if (Math.abs(ve.currentTime - want) > 0.3) ve.currentTime = want;
        } catch {
          /* not seekable yet */
        }
      }
    }
    renderTimelineFrame({
      ctx,
      width: LOGICAL_W,
      height: LOGICAL_H,
      clips: clipsRef.current,
      ms,
      getImage: (url) => imgCacheRef.current.get(url),
      videoFrameMap: videoElsRef.current,
    });
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }, []);

  // Repaint on any state change; the rAF loop also drives it at 60 fps.
  useEffect(() => {
    draw(playhead);
  }, [playhead, clips, draw]);

  /* ---------------- audio ---------------- */
  // The monitor owns sound: the timeline tracks are visual, so the audio
  // engine lives with the thing that actually plays.
  const getPlayhead = useCallback(() => playheadRef.current, []);
  const getTotalMs = useCallback(() => totalMsRef.current, []);
  const handleEnded = useCallback(() => stop(), [stop]);
  useAudioEngine({ clips, playing, getPlayhead, getTotalMs, onEnded: handleEnded });

  useEffect(() => {
    function apply() {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = LOGICAL_W * dpr;
      const h = LOGICAL_H * dpr;
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        draw(playheadRef.current);
      }
    }
    apply();
    window.addEventListener("resize", apply);
    return () => window.removeEventListener("resize", apply);
  }, [draw]);

  /* ---------------- HTML card overlay ---------------- */
  useEffect(() => {
    if (activeHtmlClip) {
      const url = activeHtmlClip.assets?.url;
      if (!url || !isHttpUrl(url)) return;
      if (url === currentHtmlUrlRef.current) return;
      currentHtmlUrlRef.current = url;
      void fetch(url)
        .then((r) => r.text())
        .then((html) => {
          const iframe = htmlOverlayRef.current;
          if (!iframe) return;
          // Clear first so an identical HTML reload restarts its keyframes.
          iframe.srcdoc = "";
          iframe.srcdoc = html;
        })
        .catch(() => {});
    } else {
      currentHtmlUrlRef.current = null;
    }
  }, [activeHtmlClip]);

  // Overlay ≡ canvas parity: the iframe is transformed exactly like the drawn
  // card (same clipTransformAt) so the preview matches the encoded file.
  const applyOverlayTransform = useCallback((card: TimelineClip | null, ms: number) => {
    const iframeEl = htmlOverlayRef.current;
    if (!iframeEl) return;
    if (!card) {
      iframeEl.style.transform = "";
      iframeEl.style.opacity = "";
      return;
    }
    const t = clipTransformAt(card, ms - card.start_ms);
    iframeEl.style.transformOrigin = "50% 50%";
    iframeEl.style.transform =
      t.scale === 1 && t.x === 0.5 && t.y === 0.5
        ? ""
        : `translate(${((t.x - 0.5) * 100).toFixed(2)}%, ${((t.y - 0.5) * 100).toFixed(2)}%) scale(${t.scale.toFixed(4)})`;
    iframeEl.style.opacity = t.opacity < 1 ? t.opacity.toFixed(3) : "";
  }, []);

  useEffect(() => {
    function sync() {
      const canvasEl = canvasRef.current;
      const iframeEl = htmlOverlayRef.current;
      const wrapEl = wrapRef.current;
      if (!canvasEl || !iframeEl || !wrapEl) return;
      const c = canvasEl.getBoundingClientRect();
      const w = wrapEl.getBoundingClientRect();
      iframeEl.style.width = `${c.width}px`;
      iframeEl.style.height = `${c.height}px`;
      iframeEl.style.left = `${c.left - w.left}px`;
      iframeEl.style.top = `${c.top - w.top}px`;
      applyOverlayTransform(activeHtmlClip, playheadRef.current);
    }
    sync();
    window.addEventListener("resize", sync);
    const timer = window.setInterval(sync, 500);
    return () => {
      window.removeEventListener("resize", sync);
      window.clearInterval(timer);
    };
  }, [activeHtmlClip, applyOverlayTransform]);

  // Card activation on the exact frame (no mirror lag).
  useEffect(() => {
    if (!playing && !exporting) return;
    const p = playheadRef.current;
    const active = topmostHtml(clipsRef.current, p);
    if ((active?.id ?? null) !== activeHtmlIdRef.current) {
      activeHtmlIdRef.current = active?.id ?? null;
      setActiveHtmlClip(active);
    }
    applyOverlayTransform(active, p);
  }, [playhead, playing, exporting, applyOverlayTransform]);

  // Repaint + follow the video sources during playback.
  useEffect(() => {
    if (!playing) return;
    let raf: number | null = null;
    function tick() {
      const p = playheadRef.current;
      // The provider owns the clock; this loop only follows it for picture.
      for (const [id, ve] of videoElsRef.current) {
        const c = clipsRef.current.find((x) => x.id === id);
        const activeNow = !!c && p >= c.start_ms && p < c.start_ms + c.duration_ms;
        if (activeNow && ve.paused) {
          try {
            void ve.play().catch(() => {});
          } catch {
            /* not playable yet */
          }
        } else if (!activeNow && !ve.paused) {
          try {
            ve.pause();
          } catch {
            /* noop */
          }
        }
      }
      draw(p);
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => {
      if (raf != null) cancelAnimationFrame(raf);
    };
  }, [playing, draw]);

  /* ---------------- fullscreen ---------------- */
  useEffect(() => {
    function onFs() {
      const fs = document.fullscreenElement === wrapRef.current;
      setIsFullscreen(fs);
      // Entering fullscreen from the end would show a frozen last frame, so
      // rewind first — the user asked to watch, not to inspect a still.
      if (fs && playheadRef.current >= totalMsRef.current) seek(0);
    }
    document.addEventListener("fullscreenchange", onFs);
    document.addEventListener("webkitfullscreenchange", onFs as EventListener);
    return () => {
      document.removeEventListener("fullscreenchange", onFs);
      document.removeEventListener("webkitfullscreenchange", onFs as EventListener);
    };
  }, [seek]);

  function toggleFullscreen() {
    const el = wrapRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else if (el.requestFullscreen) {
      void el.requestFullscreen();
    } else {
      (el as unknown as { webkitRequestFullscreen?: () => void }).webkitRequestFullscreen?.();
    }
  }

  /* ---------------- actions ---------------- */
  async function addSilence() {
    if (!pid) return;
    const secs = parseFloat(silenceSecs.replace(",", "."));
    if (!Number.isFinite(secs) || secs <= 0) return;
    setAddingSilence(true);
    try {
      await insertSilenceClip({
        data: {
          projectId: pid,
          track: "Audio",
          duration_ms: Math.round(secs * 1000),
          start_ms: clipsRef.current.reduce(
            (max, c) => (c.track === "Audio" ? Math.max(max, c.start_ms + c.duration_ms) : max),
            0,
          ),
        },
      });
      await tl.reload();
    } catch {
      tl.clearActionError();
    } finally {
      setAddingSilence(false);
    }
  }

  async function exportVideo() {
    if (exporting) return;
    stop();
    const ctrl = new AbortController();
    cancelRef.current = ctrl;
    setExporting(true);
    setExportPct(0);
    setExportLabel(null);
    setExportNote(null);
    try {
      const { blob, ext, droppedFrames } = await runExport({
        clips: clipsRef.current,
        totalMs,
        getImage: (url) => imgCacheRef.current.get(url),
        signal: ctrl.signal,
        onProgress: (p) => {
          // Throttled React mirror: the encode ticks at 60 fps and must
          // never freeze the UI — labels + bar move at ~7 Hz.
          const frac = progressFraction(p);
          const now = performance.now();
          const ui = exportUiRef.current;
          if (frac - ui.frac < 0.005 && now - ui.at < 150) return;
          ui.frac = frac;
          ui.at = now;
          setExportPct(frac);
          setExportLabel(
            exportPhaseLabel(
              p.phase,
              Math.floor(p.done),
              p.total,
              Math.round((p.done / p.total) * 100),
            ),
          );
        },
      });
      if (droppedFrames > 0) setExportNote(EXPORT_LABELS.imagesIgnorees(droppedFrames));
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = exportFileName(ext);
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (e) {
      tl.clearActionError();
      setExportNote(e instanceof ExportError ? e.message : exportErrorMessage("unexpected"));
    } finally {
      cancelRef.current = null;
      setExporting(false);
      setExportPct(0);
      setExportLabel(null);
      currentHtmlUrlRef.current = null;
    }
  }

  // The button promises the container the browser will actually record.
  const exportExt =
    typeof MediaRecorder !== "undefined"
      ? pickExportMime((m) => MediaRecorder.isTypeSupported(m)).ext
      : "mp4";

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--surface-1)]">
      <div
        ref={wrapRef}
        className="group relative flex min-h-0 flex-1 items-center justify-center bg-black p-2"
      >
        <canvas
          ref={canvasRef}
          width={LOGICAL_W}
          height={LOGICAL_H}
          className="max-h-full max-w-full"
          style={{ aspectRatio: "16 / 9" }}
        />
        {activeHtmlClip ? (
          <iframe
            ref={htmlOverlayRef}
            className="pointer-events-none absolute z-10"
            sandbox="allow-scripts"
            title={T.appercuCarte}
          />
        ) : null}

        {exporting ? (
          <div className="absolute inset-x-0 bottom-0 flex items-center gap-2 bg-black/70 px-3 py-2 text-[11px] text-white">
            <Loader2 className="h-3 w-3 animate-spin" />
            <span className="flex-1">
              {exportLabel ?? T.enregistrementExport(exportPct)}
              <span className="ml-2 text-white/60">{EXPORT_LABELS.dureeEstimee(fmt(totalMs))}</span>
            </span>
            <button
              onClick={() => cancelRef.current?.abort()}
              className="rounded border border-white/30 px-2 py-0.5 text-[10px] hover:bg-white/10"
            >
              {EXPORT_LABELS.cancel}
            </button>
          </div>
        ) : null}

        {exportNote && !exporting ? (
          <div className="absolute top-2 right-2 z-20 flex max-w-[80%] items-center gap-2 rounded-lg border border-[var(--status-warn)]/40 bg-[var(--surface-2)]/95 px-2 py-1 text-[10px] text-[var(--status-warn)]">
            <span className="truncate">{exportNote}</span>
            <button
              onClick={() => setExportNote(null)}
              className="shrink-0 rounded px-1 hover:bg-[var(--surface-4)]"
            >
              ×
            </button>
          </div>
        ) : null}

        {isFullscreen ? (
          <div className="absolute inset-x-0 bottom-0 z-20 flex items-center gap-2 bg-black/60 px-3 py-2 text-[11px] text-white backdrop-blur-sm">
            <button
              onClick={toggle}
              className="touch-44 flex h-7 w-7 items-center justify-center rounded bg-white/10 hover:bg-white/25"
              title={playing ? T.pause : T.lecture}
            >
              {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
            </button>
            <button
              onClick={toggleFullscreen}
              className="flex h-7 w-7 items-center justify-center rounded bg-white/10 hover:bg-white/25"
              title={T.quitterPleinEcran}
            >
              <Minimize2 className="h-3.5 w-3.5" />
            </button>
            <span className="mono ml-auto tabular-nums text-white/90">
              {formatSmpte(playhead)} / {formatSmpte(totalMs)}
            </span>
          </div>
        ) : null}
      </div>

      {/* Transport — SMPTE timecode + play/pause + project duration. */}
      <div className="flex min-h-11 shrink-0 flex-wrap items-center gap-x-2 gap-y-1.5 border-t border-[var(--line)] bg-[var(--surface-2)] px-3 py-1.5">
        <button
          onClick={toggle}
          disabled={exporting}
          className="touch-44 flex h-7 w-7 items-center justify-center rounded bg-[var(--surface-3)] text-[var(--text)] transition-colors hover:bg-[var(--accent-quiet)] disabled:opacity-40"
          title={T.astuceLecture}
          aria-label={playing ? T.pause : T.lecture}
        >
          {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
        </button>
        <button
          onClick={stop}
          disabled={exporting}
          className="touch-44 flex h-7 w-7 items-center justify-center rounded bg-[var(--surface-3)] text-[var(--text)] transition-colors hover:bg-[var(--accent-quiet)] disabled:opacity-40"
          title={T.astuceArret}
          aria-label={T.arret}
        >
          <Square className="h-3 w-3" />
        </button>
        <span className="mono shrink-0 text-[11px] tabular-nums text-[var(--text)]">
          {formatSmpte(playhead)}
        </span>
        <span className="mono shrink-0 text-[10px] text-[var(--text-dim)]">
          / {formatSmpte(totalMs)}
        </span>
        <input
          type="range"
          min={0}
          max={Math.max(1, totalMs)}
          value={Math.round(playhead)}
          onChange={(e) => {
            if (playing) toggle();
            seekFast(Number(e.target.value));
          }}
          disabled={exporting}
          title={T.astuceCurseur}
          aria-label={T.astuceCurseur}
          className="order-first w-full accent-[var(--accent)] sm:order-none sm:w-auto sm:flex-1"
        />
        <span className="mono hidden shrink-0 text-[10px] text-[var(--text-dim)] lg:inline">
          {formatDurationShort(totalMs)}
        </span>
        <div className="ml-1 flex items-center gap-1 rounded border border-[var(--line)] bg-[var(--surface-1)] px-1 py-0.5">
          <input
            value={silenceSecs}
            onChange={(e) => setSilenceSecs(e.target.value)}
            disabled={exporting || addingSilence}
            title={T.silenceDuree}
            aria-label={T.silenceDuree}
            className="w-9 bg-transparent text-center text-[10.5px] text-[var(--text)] outline-none"
            inputMode="decimal"
          />
          <button
            onClick={() => void addSilence()}
            disabled={exporting || addingSilence || !pid}
            title={T.insererSilence}
            aria-label={T.insererSilence}
            className="touch-44 flex h-6 items-center gap-1 rounded bg-[var(--surface-3)] px-1.5 text-[10px] font-medium text-[var(--text-muted)] transition-colors hover:text-[var(--text)] disabled:opacity-40"
          >
            <VolumeX size={10} />
            {T.silence}
          </button>
        </div>
        <button
          onClick={toggleFullscreen}
          disabled={exporting}
          className="touch-44 flex h-7 items-center gap-1.5 rounded bg-[var(--surface-3)] px-2.5 text-[11px] font-medium text-[var(--text)] transition-colors hover:bg-[var(--accent-quiet)] disabled:opacity-40"
          title={T.aidePleinEcran}
        >
          <Maximize2 className="h-3.5 w-3.5" />
          {T.pleinEcran}
        </button>
        <button
          onClick={() => void exportVideo()}
          disabled={exporting || clips.length === 0}
          className="touch-44 ml-auto flex items-center gap-1.5 rounded bg-[var(--accent)] px-3 py-1 text-[11px] font-medium text-[var(--accent-fg)] transition-colors hover:bg-[var(--accent-strong)] disabled:opacity-40"
          title={T.exportVideo}
        >
          {exporting ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
          {T.exportFichier(exportExt)}
        </button>
      </div>
    </div>
  );
}

/** Topmost active HTML card (Video 3 > Video 2 > Video). */
function topmostHtml(clips: TimelineClip[], ms: number): TimelineClip | null {
  for (const track of ["Video 3", "Video 2", "Video"] as const) {
    const found = clips.find(
      (c) =>
        c.track === track &&
        c.assets?.kind === "html" &&
        ms >= c.start_ms &&
        ms < c.start_ms + c.duration_ms,
    );
    if (found) return found;
  }
  return null;
}
