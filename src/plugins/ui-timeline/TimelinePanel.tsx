import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLibraryProject } from "@/plugins/library/project";
import { supabase } from "@/integrations/supabase/client";
import { ConnPill } from "@/lib/realtime/ConnPill";
import { useSupabaseChannel } from "@/lib/realtime/channel";
import { isOfflineError, nextBackoff, useOnlineStatus } from "@/lib/realtime/online";
import {
  Play,
  Pause,
  Square,
  Download,
  Loader2,
  Maximize2,
  Minimize2,
  VolumeX,
  Trash2,
  Film,
} from "lucide-react";
import {
  useTimelineUi,
  snapMs,
  isTypingTarget,
  MIN_DURATION_MS,
  NUDGE_MS,
  NUDGE_SHIFT_MS,
  AUDIO_LOOKAHEAD_MS,
  type TimelineClip,
} from "./store";
import {
  ExportError,
  volAt,
  isHttpUrl,
  formatTimeMs as fmt,
  renderTimelineFrame,
  runExport,
  progressFraction,
  EXPORT_WIDTH as LOGICAL_W,
  EXPORT_HEIGHT as LOGICAL_H,
} from "./export";
import { insertSilenceClip } from "./server";
import {
  EXPORT_LABELS,
  exportErrorMessage,
  exportFileName,
  exportPhaseLabel,
  UI_LABELS,
  TRACK_LABELS,
  kindLabel,
} from "@/lib/ui/labels";
import { EmptyState } from "@/components/ui/empty-state";

const TRACKS = ["Video", "Audio", "Music", "SFX", "Subtitles"] as const;
const AUDIO_TRACKS = new Set(["Audio", "Music", "SFX"]);
const PX_PER_MS = 0.08;

function gainToDb(gain: number): string {
  if (gain <= 0.001) return "−∞";
  return (20 * Math.log10(Math.max(0.001, gain))).toFixed(1);
}

export function TimelinePanel() {
  const pid = useLibraryProject();
  const [clips, setClips] = useState<TimelineClip[]>([]);
  const [playing, setPlaying] = useState(false);
  const [playhead, setPlayhead] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [exportPct, setExportPct] = useState(0);
  const [activeHtmlClip, setActiveHtmlClip] = useState<TimelineClip | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [silenceSecs, setSilenceSecs] = useState("1.5");
  const [addingSilence, setAddingSilence] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const selectedClipId = useTimelineUi((s) => s.selectedClipId);
  const selectClip = useTimelineUi((s) => s.selectClip);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const imgCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const rafRef = useRef<number | null>(null);
  const audiosRef = useRef<HTMLAudioElement[]>([]);
  const audioMapRef = useRef<Map<string, { el: HTMLAudioElement; clip: TimelineClip }>>(new Map());
  const startedIdsRef = useRef<Set<string>>(new Set());
  const scheduledIdsRef = useRef<Set<string>>(new Set());
  const pendingTimersRef = useRef<number[]>([]);
  const clipsRef = useRef<TimelineClip[]>([]);
  const htmlOverlayRef = useRef<HTMLIFrameElement>(null);
  const previewHtmlElsRef = useRef<Map<string, HTMLVideoElement>>(new Map());
  // Muted picture sources for video-file clips (preview + scrub).
  const videoElsRef = useRef<Map<string, HTMLVideoElement>>(new Map());
  const trackAreaRef = useRef<HTMLDivElement>(null);
  const playheadLineRef = useRef<HTMLDivElement>(null);
  const playheadRef = useRef(0);
  const totalMsRef = useRef(10000);
  const lastUiUpdateRef = useRef(0);
  const dragRef = useRef<{ clipId: string; offsetMs: number } | null>(null);
  const resizeRef = useRef<{
    clipId: string;
    side: "left" | "right";
    startMs: number;
    durationMs: number;
    startClientX: number;
  } | null>(null);
  const [dragOverTrack, setDragOverTrack] = useState<string | null>(null);
  clipsRef.current = clips;

  // Keep the Inspector's selection across realtime reloads (no jumps):
  // only overwrite when the clip is still present; explicit actions
  // (delete / Esc / click-empty) clear via selectClip(null).
  useEffect(() => {
    if (!selectedClipId) {
      useTimelineUi.setState({ selectedClip: null });
      return;
    }
    const clip = clips.find((c) => c.id === selectedClipId) ?? null;
    if (clip) useTimelineUi.setState({ selectedClip: clip });
  }, [clips, selectedClipId]);

  // --------------- load + subscribe clips (WS6 hardened) ---------------
  const online = useOnlineStatus();
  const loadAttempt = useRef(0);
  const loadTimer = useRef<number | null>(null);
  const loadClips = useCallback(async () => {
    if (!pid) return;
    if (loadTimer.current != null) {
      window.clearTimeout(loadTimer.current);
      loadTimer.current = null;
    }
    try {
      const { data, error } = await supabase
        .from("timeline_clips")
        .select("id, track, start_ms, duration_ms, asset_id, meta, assets(kind, url, prompt)")
        .eq("project_id", pid)
        .order("track")
        .order("start_ms");
      if (error) throw error;
      loadAttempt.current = 0;
      setLoadError(null);
      // Preserve playhead: never touch it here — only the clip list moves.
      setClips((data ?? []) as unknown as TimelineClip[]);
      // Refresh live audio clip refs so volAt stays audible-correct.
      const fresh = new Map((data ?? []).map((c) => [(c as { id: string }).id, c]));
      for (const [id, entry] of audioMapRef.current) {
        const next = fresh.get(id) as unknown as TimelineClip | undefined;
        if (next) entry.clip = next;
      }
    } catch (e) {
      if (isOfflineError(e)) return; // silent; online event + channel flush reload
      setLoadError(UI_LABELS.timeline.erreurChargement);
      const delay = nextBackoff(loadAttempt.current++);
      loadTimer.current = window.setTimeout(() => {
        loadTimer.current = null;
        void loadClips();
      }, delay);
    }
  }, [pid]);

  useEffect(() => {
    void loadClips();
    return () => {
      if (loadTimer.current != null) window.clearTimeout(loadTimer.current);
    };
  }, [loadClips]);

  // Auto-flush when the network comes back (storm stays silent meanwhile).
  useEffect(() => {
    if (online) {
      loadAttempt.current = 0;
      void loadClips();
    }
  }, [online, loadClips]);

  const clipsChannel = pid ? `clips:${pid}` : null;
  const conn = useSupabaseChannel({
    name: clipsChannel,
    build: (signal) =>
      supabase
        .channel(clipsChannel as string)
        .on(
          "postgres_changes" as never,
          {
            event: "*",
            schema: "public",
            table: "timeline_clips",
            filter: `project_id=eq.${pid}`,
          },
          signal,
        )
        .on(
          "postgres_changes" as never,
          { event: "*", schema: "public", table: "assets", filter: `project_id=eq.${pid}` },
          signal,
        ),
    onEvent: () => void loadClips(),
  });
  const connState = online ? conn : "offline";

  const totalMs = useMemo(
    () => Math.max(10000, ...clips.map((c) => c.start_ms + c.duration_ms)),
    [clips],
  );
  useEffect(() => {
    totalMsRef.current = totalMs;
  }, [totalMs]);

  // Ducking gain per track at the (throttled) playhead — drives the
  // breathing gain-dot so the user SEES the duck they hear.
  // Uses volAt on the ACTIVE clip (fades × ducking), the exact same
  // source as the audible per-frame path — never a stale curve sample.
  const duckGains = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of TRACKS) {
      let best = -1;
      for (const c of clips) {
        if (c.track !== t) continue;
        if (playhead < c.start_ms || playhead >= c.start_ms + c.duration_ms) continue;
        best = Math.max(best, volAt(c, playhead));
      }
      if (best >= 0) m.set(t, best);
    }
    return m;
  }, [clips, playhead]);

  // --------------- HiDPI canvas backing store ---------------
  // Backing size is (re)applied next to draw() below (after its
  // declaration) so resize/zoom never flashes low-res.

  // --------------- preload images (LRU-capped + decode, WS6) ---------------
  const MAX_IMG_CACHE = 60;
  useEffect(() => {
    const cache = imgCacheRef.current;
    const live = new Set<string>();
    for (const c of clips) {
      const url = c.assets?.url;
      if (c.assets?.kind === "image" && isHttpUrl(url)) live.add(url);
    }
    // Prune entries whose asset is gone so stale URLs never leak.
    for (const key of [...cache.keys()]) {
      if (!live.has(key)) cache.delete(key);
    }
    for (const url of live) {
      const hit = cache.get(url);
      if (hit) {
        // True LRU: refresh recency on hit.
        cache.delete(url);
        cache.set(url, hit);
        continue;
      }
      while (cache.size >= MAX_IMG_CACHE) {
        const oldest = cache.keys().next();
        if (oldest.done) break;
        cache.delete(oldest.value);
      }
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.decoding = "async";
      img.src = url;
      // Warm the decoder off the critical path so first paint doesn't hitch.
      if (typeof img.decode === "function") img.decode().catch(() => {});
      cache.set(url, img);
    }
  }, [clips]);

  // --------------- HTML overlay effect (preview) ---------------
  const currentHtmlUrlRef = useRef<string | null>(null);

  // Restart the card's CSS animations on every playback session: when play
  // is (re)started, forget the cached url so the effect re-applies the
  // srcdoc below and the iframe (and its keyframes) reload from t=0.
  useEffect(() => {
    if (playing) currentHtmlUrlRef.current = null;
  }, [playing]);

  // HTML overlay: activation follows the per-frame playhead ref (no
  // 100 ms mirror lag when scrubbing), loading follows the active clip.
  const activeHtmlIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!playing && !exporting) return;
    const active = clipsRef.current.find(
      (c) =>
        c.assets?.kind === "html" &&
        playhead >= c.start_ms &&
        playhead < c.start_ms + c.duration_ms,
    );
    if ((active?.id ?? null) !== activeHtmlIdRef.current) {
      activeHtmlIdRef.current = active?.id ?? null;
      setActiveHtmlClip(active ?? null);
    }
  }, [playhead, playing, exporting]);

  useEffect(() => {
    const active = activeHtmlClip;
    if (!active) {
      currentHtmlUrlRef.current = null;
      return;
    }

    const url = active.assets!.url;
    if (url === currentHtmlUrlRef.current) return;
    currentHtmlUrlRef.current = url;

    if (!isHttpUrl(url)) return;
    fetch(url)
      .then((r) => r.text())
      .then((html) => {
        const iframe = htmlOverlayRef.current;
        if (iframe) {
          // Clear first so even identical HTML reloads the document and the
          // keyframes restart from frame 0 (srcdoc assignment alone may be a
          // no-op when the value is unchanged).
          iframe.srcdoc = "";
          iframe.srcdoc = html;
        }
      })
      .catch(() => {});
  }, [activeHtmlClip]);

  // Overlay ≡ canvas parity: the card iframe exactly covers the drawn
  // canvas rect (the same box the file encodes), never the whole
  // container — otherwise preview and file frame the card differently.
  useEffect(() => {
    function sync() {
      const canvasEl = canvasRef.current;
      const iframeEl = htmlOverlayRef.current;
      const wrapEl = previewRef.current;
      if (!canvasEl || !iframeEl || !wrapEl) return;
      const c = canvasEl.getBoundingClientRect();
      const w = wrapEl.getBoundingClientRect();
      iframeEl.style.width = `${c.width}px`;
      iframeEl.style.height = `${c.height}px`;
      iframeEl.style.left = `${c.left - w.left}px`;
      iframeEl.style.top = `${c.top - w.top}px`;
    }
    sync();
    window.addEventListener("resize", sync);
    const timer = window.setInterval(sync, 500);
    return () => {
      window.removeEventListener("resize", sync);
      window.clearInterval(timer);
    };
  }, [activeHtmlClip]);

  // --------------- draw (preview ≡ export, single source) ---------------
  // Preview and file share renderTimelineFrame + volAt + subtitleLayout
  // (export.ts). HiDPI: backing store is LOGICAL×dpr, we draw in logical
  // 1920×1080 so text stays crisp on retina with identical layout.
  const draw = useCallback((ms: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = canvas.width / LOGICAL_W || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Scrub/pause path: paused video elements seek to the exact offset so
    // the still frame matches the playhead (during playback the tick
    // keeps them playing instead — never fight play() with seeks).
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
      htmlVideoEls: previewHtmlElsRef.current,
    });
    // Reset so later 2d users (export temp canvas aside) start identity.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }, []);

  useEffect(() => {
    draw(playhead);
  }, [playhead, clips, draw]);

  // HiDPI backing store (LOGICAL×dpr≤2), re-evaluated on resize/zoom so
  // the first paint after a dpr change never flashes low-res.
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

  /** Move the playhead without a React render (rAF-hot path). */
  const paintPlayhead = useCallback(
    (p: number) => {
      playheadRef.current = p;
      const line = playheadLineRef.current;
      if (line) line.style.transform = `translateX(${p * PX_PER_MS}px)`;
      draw(p);
    },
    [draw],
  );

  /** Throttled React mirror for readouts / sliders / duck dots (~10 Hz). */
  const mirrorPlayheadUi = useCallback((p: number) => {
    const now = performance.now();
    if (now - lastUiUpdateRef.current < 100) return;
    lastUiUpdateRef.current = now;
    setPlayhead(p);
  }, []);

  const seekTo = useCallback(
    (p: number) => {
      const clamped = Math.max(0, Math.min(totalMsRef.current, Math.round(p)));
      playheadRef.current = clamped;
      setPlayhead(clamped);
      const line = playheadLineRef.current;
      if (line) line.style.transform = `translateX(${clamped * PX_PER_MS}px)`;
      draw(clamped);
    },
    [draw],
  );

  // --------------- fullscreen preview ---------------
  useEffect(() => {
    const onFs = () => {
      const fs = document.fullscreenElement === previewRef.current;
      setIsFullscreen(fs);
      if (fs) {
        seekTo(playheadRef.current >= totalMsRef.current ? 0 : playheadRef.current);
        setPlaying(true);
      }
    };
    document.addEventListener("fullscreenchange", onFs);
    document.addEventListener("webkitfullscreenchange", onFs as EventListener);
    return () => {
      document.removeEventListener("fullscreenchange", onFs);
      document.removeEventListener("webkitfullscreenchange", onFs as EventListener);
    };
  }, [seekTo]);

  function toggleFullscreen() {
    const el = previewRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else if (el.requestFullscreen) {
      void el.requestFullscreen();
    } else {
      (el as unknown as { webkitRequestFullscreen?: () => void }).webkitRequestFullscreen?.();
    }
  }

  // --------------- drag & drop + resize clips ---------------
  // getBoundingClientRect is already scroll-correct (viewport-relative
  // on both sides) — no manual scrollLeft fudge.
  function msFromClientX(clientX: number): number {
    const el = trackAreaRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    return Math.max(0, (clientX - rect.left) / PX_PER_MS);
  }

  /** Push `startMs` after any overlapping clip on `track` (same logic as add_to_timeline). */
  function resolveNoOverlap(
    track: string,
    startMs: number,
    durationMs: number,
    excludeId?: string,
  ): number {
    let start = Math.max(0, snapMs(startMs));
    const others = clipsRef.current
      .filter((c) => c.track === track && c.id !== excludeId)
      .sort((a, b) => (a.start_ms ?? 0) - (b.start_ms ?? 0));
    for (const o of others) {
      const oStart = o.start_ms ?? 0;
      const oEnd = oStart + (o.duration_ms ?? 3000);
      if (start < oEnd && start + durationMs > oStart) start = oEnd;
    }
    return start;
  }

  function patchClipLocal(id: string, patch: Partial<TimelineClip>) {
    setClips((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }

  async function updateClip(
    id: string,
    patch: { start_ms?: number; duration_ms?: number; track?: string },
  ) {
    try {
      await supabase.from("timeline_clips").update(patch).eq("id", id);
    } catch {
      /* the realtime channel keeps the UI in sync; ignore transient errors */
    }
  }

  /** Insert a native silence clip on the Audio track (server fn → RLS owner). */
  async function addSilence() {
    if (!pid) return;
    const secs = parseFloat(silenceSecs.replace(",", "."));
    if (!Number.isFinite(secs) || secs <= 0) return;
    setAddingSilence(true);
    setActionError(null);
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
    } catch (e) {
      // Offline → silent (auto-flush on reconnect); real errors still surface once.
      if (isOfflineError(e)) return;
      setActionError(UI_LABELS.timeline.erreurSilence);
    } finally {
      setAddingSilence(false);
    }
  }

  /** Delete the selected clip. With ripple, later clips on the track slide left. */
  async function deleteSelected(ripple: boolean) {
    const id = selectedClipId;
    if (!id) return;
    const clip = clipsRef.current.find((c) => c.id === id);
    if (!clip) return;
    setActionError(null);
    // Optimistic UI: the realtime channel confirms a frame later.
    const removedEnd = (clip.start_ms ?? 0) + (clip.duration_ms ?? 0);
    const later = ripple
      ? clipsRef.current.filter(
          (c) => c.track === clip.track && (c.start_ms ?? 0) >= removedEnd && c.id !== id,
        )
      : [];
    setClips((prev) => {
      const rest = prev.filter((c) => c.id !== id);
      if (!ripple) return rest;
      return rest.map((c) =>
        later.some((l) => l.id === c.id)
          ? { ...c, start_ms: Math.max(0, (c.start_ms ?? 0) - (clip.duration_ms ?? 0)) }
          : c,
      );
    });
    selectClip(null);
    try {
      await supabase.from("timeline_clips").delete().eq("id", id);
      if (later.length > 0) {
        await Promise.all(
          later.map((c) =>
            supabase
              .from("timeline_clips")
              .update({ start_ms: Math.max(0, (c.start_ms ?? 0) - (clip.duration_ms ?? 0)) })
              .eq("id", c.id),
          ),
        );
      }
    } catch (e) {
      if (isOfflineError(e)) return;
      setActionError(UI_LABELS.timeline.erreurSuppression);
    }
  }

  /** Nudge the selected clip with ←/→ (±100 ms, Maj = ±1 s), 10 ms snap. */
  function nudgeSelected(dir: -1 | 1, fast: boolean) {
    const id = selectedClipId;
    if (!id) return;
    const clip = clipsRef.current.find((c) => c.id === id);
    if (!clip) return;
    const delta = dir * (fast ? NUDGE_SHIFT_MS : NUDGE_MS);
    const duration = clip.duration_ms ?? 3000;
    const desired = snapMs(Math.max(0, (clip.start_ms ?? 0) + delta));
    const start = resolveNoOverlap(clip.track, desired, duration, clip.id);
    patchClipLocal(id, { start_ms: start });
    void updateClip(id, { start_ms: start });
  }

  // Keyboard: full parity, never while typing.
  // Suppr = remove, Maj+Suppr = ripple, Échap = deselect,
  // ←/→ = nudge ±100 ms (Maj = ±1 s), Espace = play/pause.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      // Range sliders: arrows/Delete keep native behavior, but Space is
      // dead natively — let it toggle playback (isTypingTarget covers INPUT).
      const isRange = target?.tagName === "INPUT" && (target as HTMLInputElement).type === "range";
      const isSpace = e.key === " " || e.code === "Space";
      if (isTypingTarget(target) && !(isRange && isSpace)) return;
      const onButtonOrLink =
        !!target?.closest?.('button, a, [role="button"]') ||
        target?.tagName === "BUTTON" ||
        target?.tagName === "A";
      if (e.key === "Escape") {
        if (selectedClipId) {
          e.preventDefault();
          selectClip(null);
        }
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedClipId) {
          e.preventDefault();
          void deleteSelected(e.shiftKey);
        }
        return;
      }
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        if (selectedClipId) {
          e.preventDefault();
          nudgeSelected(e.key === "ArrowLeft" ? -1 : 1, e.shiftKey);
        }
        return;
      }
      if (e.key === " " || e.code === "Space") {
        // Let focused buttons keep their native Space activation —
        // except range sliders, where Space is dead natively.
        const isRangeTarget =
          target?.tagName === "INPUT" && (target as HTMLInputElement).type === "range";
        if (onButtonOrLink && !isRangeTarget) return;
        e.preventDefault();
        setPlaying((p) => !p);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedClipId]);

  function handleClipDragStart(e: React.DragEvent, clip: TimelineClip) {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    dragRef.current = { clipId: clip.id, offsetMs: (e.clientX - rect.left) / PX_PER_MS };
    e.dataTransfer.setData("text/plain", clip.id);
    e.dataTransfer.effectAllowed = "move";
  }

  function handleClipDrop(e: React.DragEvent, track: string) {
    e.preventDefault();
    setDragOverTrack(null);
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag) return;
    const clip = clipsRef.current.find((c) => c.id === drag.clipId);
    if (!clip) return;
    const duration = clip.duration_ms ?? 3000;
    const start = resolveNoOverlap(
      track,
      msFromClientX(e.clientX) - drag.offsetMs,
      duration,
      clip.id,
    );
    patchClipLocal(clip.id, { start_ms: start, track });
    void updateClip(clip.id, { start_ms: start, track });
  }

  function handleResizeStart(e: React.MouseEvent, clip: TimelineClip, side: "left" | "right") {
    e.preventDefault();
    e.stopPropagation();
    resizeRef.current = {
      clipId: clip.id,
      side,
      startMs: clip.start_ms ?? 0,
      durationMs: clip.duration_ms ?? 3000,
      startClientX: e.clientX,
    };
  }

  /**
   * Resize geometry clamped so a resize can never create an overlap that
   * drag forbids: left edge stops at the previous neighbour's end, right
   * edge stops at the next neighbour's start (dissolve overlaps set via
   * set_clip_transitions stay the only legal overlaps).
   */
  function computeResize(
    r: { clipId: string; side: "left" | "right"; startMs: number; durationMs: number },
    dxMs: number,
  ): { start_ms: number; duration_ms: number } {
    const end = r.startMs + r.durationMs;
    const track = clipsRef.current.find((x) => x.id === r.clipId)?.track;
    const others = clipsRef.current.filter((c) => c.track === track && c.id !== r.clipId);
    if (r.side === "left") {
      const prevEnd = Math.max(
        0,
        ...others
          .filter((o) => (o.start_ms ?? 0) < end)
          .map((o) => Math.min((o.start_ms ?? 0) + (o.duration_ms ?? 3000), end - MIN_DURATION_MS)),
      );
      const rawStart = Math.max(prevEnd, Math.min(r.startMs + dxMs, end - MIN_DURATION_MS));
      const newStart = snapMs(Math.max(0, rawStart));
      return {
        start_ms: newStart,
        duration_ms: snapMs(Math.max(MIN_DURATION_MS, end - newStart)),
      };
    }
    const nextStart = Math.min(
      Number.POSITIVE_INFINITY,
      ...others.filter((o) => (o.start_ms ?? 0) >= r.startMs).map((o) => o.start_ms ?? 0),
    );
    return {
      start_ms: r.startMs,
      duration_ms: snapMs(
        Math.max(MIN_DURATION_MS, Math.min(r.durationMs + dxMs, nextStart - r.startMs)),
      ),
    };
  }

  useEffect(() => {
    function onMove(e: MouseEvent) {
      const r = resizeRef.current;
      if (!r) return;
      const dx = (e.clientX - r.startClientX) / PX_PER_MS;
      patchClipLocal(r.clipId, computeResize(r, dx));
    }
    function onUp(e: MouseEvent) {
      const r = resizeRef.current;
      if (r) {
        const dx = (e.clientX - r.startClientX) / PX_PER_MS;
        void updateClip(r.clipId, computeResize(r, dx));
      }
      resizeRef.current = null;
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  // --------------- playback controls ---------------
  const stopAudios = useCallback(() => {
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
  }, []);

  const stop = useCallback(() => {
    setPlaying(false);
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    stopAudios();
  }, [stopAudios]);

  /** Start an audio element with the correct offset + envelope. */
  function startAudioFor(clip: TimelineClip, atMs: number) {
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
  }

  useEffect(() => {
    if (!playing) return;
    const startFrom = playheadRef.current >= totalMsRef.current ? 0 : playheadRef.current;
    playheadRef.current = startFrom;
    const startedAt = performance.now();
    startedIdsRef.current.clear();
    scheduledIdsRef.current.clear();
    pendingTimersRef.current.forEach((t) => window.clearTimeout(t));
    pendingTimersRef.current = [];

    // Prime every audible clip: active now, or preloaded for lookahead.
    for (const c of clipsRef.current) {
      if (!AUDIO_TRACKS.has(c.track) || !isHttpUrl(c.assets?.url)) continue;
      if (startFrom >= c.start_ms && startFrom < c.start_ms + c.duration_ms) {
        startAudioFor(c, startFrom);
      } else if (startFrom < c.start_ms) {
        // Preload ahead so the lookahead starter never hitches on first byte.
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
      const total = totalMsRef.current;
      const p = startFrom + (performance.now() - startedAt);
      if (p >= total) {
        paintPlayhead(total);
        setPlayhead(total);
        setPlaying(false);
        stopAudios();
        return;
      }
      // Schedule-ahead: start clips up to 200 ms before their downbeat.
      // Audio NEVER starts early: future clips get a timer that fires
      // exactly on the downbeat (play() is immediate, so starting now
      // would be up to 200 ms ahead of the playhead).
      for (const c of clipsRef.current) {
        if (!AUDIO_TRACKS.has(c.track) || !isHttpUrl(c.assets?.url)) continue;
        if (startedIdsRef.current.has(c.id) || scheduledIdsRef.current.has(c.id)) continue;
        if (p + AUDIO_LOOKAHEAD_MS >= c.start_ms && p < c.start_ms + c.duration_ms) {
          if (p >= c.start_ms) {
            startAudioFor(c, p);
          } else {
            // Fire exactly on the downbeat; re-lookup the clip at fire
            // time so a moved/deleted clip never plays stale audio.
            scheduledIdsRef.current.add(c.id);
            const clipId = c.id;
            const headMs = c.start_ms;
            const t: number = window.setTimeout(() => {
              pendingTimersRef.current = pendingTimersRef.current.filter((x) => x !== t);
              scheduledIdsRef.current.delete(clipId);
              const fresh = clipsRef.current.find((x) => x.id === clipId);
              if (!fresh || (fresh.start_ms ?? 0) !== headMs) return;
              if (!AUDIO_TRACKS.has(fresh.track) || !isHttpUrl(fresh.assets?.url)) return;
              startAudioFor(fresh, fresh.start_ms ?? 0);
            }, c.start_ms - p);
            pendingTimersRef.current.push(t);
          }
        }
      }
      // Volume envelope each frame: fades + ducking gain.
      for (const [, entry] of audioMapRef.current) {
        try {
          entry.el.volume = volAt(entry.clip, p);
        } catch {
          /* element already gone */
        }
      }
      // Video-file picture sources follow activation (muted — the mix
      // comes from the <audio> elements above, same as the export).
      for (const [id, ve] of videoElsRef.current) {
        const c = clipsRef.current.find((x) => x.id === id);
        const activeNow =
          !!c && p >= (c.start_ms ?? 0) && p < (c.start_ms ?? 0) + (c.duration_ms ?? 0);
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
      paintPlayhead(p);
      mirrorPlayheadUi(p);
      // Card activation on the exact frame (no 100 ms mirror lag).
      const htmlActive =
        clipsRef.current.find(
          (c) => c.assets?.kind === "html" && p >= c.start_ms && p < c.start_ms + c.duration_ms,
        ) ?? null;
      if ((htmlActive?.id ?? null) !== activeHtmlIdRef.current) {
        activeHtmlIdRef.current = htmlActive?.id ?? null;
        setActiveHtmlClip(htmlActive);
      }
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      stopAudios();
    };
  }, [playing, paintPlayhead, mirrorPlayheadUi, stopAudios]);

  // --------------- video-file picture sources (preview) ---------------
  useEffect(() => {
    const map = videoElsRef.current;
    const live = new Set<string>();
    for (const c of clips) {
      if (c.track !== "Video" || c.assets?.kind !== "video") continue;
      const url = c.assets.url;
      if (!isHttpUrl(url)) continue;
      live.add(c.id);
      if (!map.has(c.id)) {
        const ve = document.createElement("video");
        ve.src = url;
        ve.preload = "auto";
        ve.muted = true;
        (ve as HTMLVideoElement & { playsInline?: boolean }).playsInline = true;
        ve.style.display = "none";
        document.body.appendChild(ve);
        map.set(c.id, ve);
      } else {
        const ve = map.get(c.id);
        if (ve && ve.src !== url) ve.src = url;
      }
    }
    for (const [id, ve] of [...map]) {
      if (!live.has(id)) {
        try {
          ve.pause();
        } catch {
          /* noop */
        }
        ve.removeAttribute("src");
        ve.remove();
        map.delete(id);
      }
    }
  }, [clips]);

  useEffect(
    () => () => {
      stop();
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
    [stop],
  );

  // --------------- export (single source: export.ts engine) ---------------
  // Preview ≡ file by construction: runExport reuses renderTimelineFrame,
  // volAt, subtitleLayout and dissolveMix. We encode on a dedicated
  // 1920×1080 canvas so the HiDPI preview backing store never shifts the
  // file layout; progress + playhead mirror keep the UX alive.
  const [exportLabel, setExportLabel] = useState<string | null>(null);
  const cancelRef = useRef<AbortController | null>(null);
  const exportUiRef = useRef({ frac: -1, at: 0 });
  async function exportVideo() {
    if (exporting) return;
    stop();
    const ctrl = new AbortController();
    cancelRef.current = ctrl;
    setExporting(true);
    setExportPct(0);
    setExportLabel(null);
    setActionError(null);
    try {
      const { blob, ext } = await runExport({
        clips: clipsRef.current,
        totalMs: totalMsRef.current,
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
          const phasePct = p.total > 0 ? Math.round((p.done / p.total) * 100) : 0;
          setExportLabel(exportPhaseLabel(p.phase, Math.floor(p.done), p.total, phasePct));
          if (p.phase === "encode" && p.total > 0) {
            const approx = Math.min(totalMsRef.current, (p.done / p.total) * totalMsRef.current);
            setPlayhead(approx);
            paintPlayhead(approx);
          }
        },
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = exportFileName(ext);
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (e) {
      // ExportError messages are FR + actionable (labels.ts); anything
      // else is an unexpected bug — still FR, never a raw dump or skip.
      setActionError(e instanceof ExportError ? e.message : exportErrorMessage("unexpected"));
    } finally {
      cancelRef.current = null;
      setExporting(false);
      setExportPct(0);
      setExportLabel(null);
      currentHtmlUrlRef.current = null;
    }
  }

  if (!pid)
    return (
      <div className="flex h-full items-center justify-center p-8">
        <EmptyState
          icon={Film}
          title={UI_LABELS.timeline.sansProjet}
          description={UI_LABELS.timeline.sansProjetAide}
        />
      </div>
    );

  const T = UI_LABELS.timeline;
  const empty = clips.length === 0;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[var(--surface-1)] text-xs text-[var(--text-muted)]">
      {/* Preview */}
      <div
        ref={previewRef}
        className="group relative flex min-h-0 flex-1 items-center justify-center bg-black"
      >
        <canvas
          ref={canvasRef}
          width={LOGICAL_W}
          height={LOGICAL_H}
          className="max-h-full max-w-full"
          style={{ aspectRatio: "16 / 9" }}
        />
        {activeHtmlClip && (
          <iframe
            ref={htmlOverlayRef}
            className="pointer-events-none absolute z-10"
            sandbox="allow-scripts"
            title={T.appercuCarte}
          />
        )}
        {exporting && (
          <div className="absolute inset-x-0 bottom-0 flex items-center gap-2 bg-black/70 px-3 py-2 text-[11px] text-white">
            <Loader2 className="h-3 w-3 animate-spin" />
            <span className="flex-1">{exportLabel ?? T.enregistrementExport(exportPct)}</span>
            <button
              onClick={() => cancelRef.current?.abort()}
              className="rounded border border-white/30 px-2 py-0.5 text-[10px] hover:bg-white/10"
            >
              {EXPORT_LABELS.cancel}
            </button>
          </div>
        )}
        {isFullscreen && (
          <div
            className={`absolute inset-x-0 bottom-0 z-20 flex items-center gap-2 bg-black/60 px-3 py-2 backdrop-blur-sm transition-opacity ${
              playing
                ? "pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100"
                : ""
            }`}
          >
            <button
              onClick={() => setPlaying(!playing)}
              className="flex h-7 w-7 items-center justify-center rounded bg-white/10 text-white hover:bg-white/25"
              title={T.astuceLecture}
            >
              {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
            </button>
            <button
              onClick={() => {
                setPlaying(false);
                seekTo(0);
              }}
              className="flex h-7 w-7 items-center justify-center rounded bg-white/10 text-white hover:bg-white/25"
              title={T.astuceArret}
            >
              <Square className="h-3 w-3" />
            </button>
            <span className="mono text-[11px] tabular-nums text-white/90">
              {fmt(playhead)} / {fmt(totalMs)}
            </span>
            <input
              type="range"
              min={0}
              max={totalMs}
              value={Math.round(playhead)}
              onChange={(e) => {
                setPlaying(false);
                seekTo(Number(e.target.value));
              }}
              title={T.astuceCurseur}
              className="flex-1 accent-[var(--accent)]"
            />
            <button
              onClick={toggleFullscreen}
              className="flex h-7 w-7 items-center justify-center rounded bg-white/10 text-white hover:bg-white/25"
              title={T.quitterPleinEcran}
            >
              <Minimize2 className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Transport */}
      <div className="flex h-11 shrink-0 items-center gap-2 border-y border-[var(--line)] bg-[var(--surface-2)] px-3">
        <button
          onClick={() => (playing ? setPlaying(false) : setPlaying(true))}
          disabled={exporting}
          className="flex h-7 w-7 items-center justify-center rounded bg-[var(--surface-3)] text-[var(--text)] hover:bg-[var(--accent-quiet)] disabled:opacity-40"
          title={T.astuceLecture}
        >
          {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
        </button>
        <button
          onClick={() => {
            setPlaying(false);
            seekTo(0);
          }}
          disabled={exporting}
          className="flex h-7 w-7 items-center justify-center rounded bg-[var(--surface-3)] text-[var(--text)] hover:bg-[var(--accent-quiet)] disabled:opacity-40"
          title={T.astuceArret}
        >
          <Square className="h-3 w-3" />
        </button>
        <div className="mono text-[11px] tabular-nums text-[var(--text-muted)]">
          {fmt(playhead)} / {fmt(totalMs)}
        </div>
        <input
          type="range"
          min={0}
          max={totalMs}
          value={Math.round(playhead)}
          onChange={(e) => {
            setPlaying(false);
            seekTo(Number(e.target.value));
          }}
          disabled={exporting}
          title={T.astuceCurseur}
          className="flex-1 accent-[var(--accent)]"
        />
        <div className="text-[11px] text-[var(--text-dim)]">{T.plans(clips.length)}</div>
        <ConnPill state={connState} />
        {selectedClipId ? (
          <button
            onClick={(e) => void deleteSelected(e.shiftKey)}
            title={T.astuceSupprimer}
            className="ml-1 flex h-6 items-center gap-1 rounded border border-[var(--status-err)]/40 px-2 text-[10px] font-medium text-[var(--status-err)] transition-colors hover:bg-[var(--status-err)]/10 disabled:opacity-40"
          >
            <Trash2 size={10} />
            {UI_LABELS.common.supprimer}
          </button>
        ) : null}
        <div className="ml-1 flex items-center gap-1 rounded border border-[var(--line)] bg-[var(--surface-2)] px-1 py-0.5">
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
            onClick={addSilence}
            disabled={exporting || addingSilence || !pid}
            title={T.insererSilence}
            className="flex h-6 items-center gap-1 rounded bg-[var(--surface-3)] px-1.5 text-[10px] font-medium text-[var(--text-muted)] transition-colors hover:text-[var(--text)] disabled:opacity-40"
          >
            <VolumeX size={10} />
            {T.silence}
          </button>
        </div>
        <button
          onClick={toggleFullscreen}
          disabled={exporting}
          className="ml-2 flex h-7 items-center gap-1.5 rounded bg-[var(--surface-3)] px-2.5 text-[11px] font-medium text-[var(--text)] hover:bg-[var(--accent-quiet)] disabled:opacity-40"
          title={T.aidePleinEcran}
        >
          <Maximize2 className="h-3.5 w-3.5" />
          {T.pleinEcran}
        </button>
        <button
          onClick={exportVideo}
          disabled={exporting || clips.length === 0}
          className="ml-2 flex items-center gap-1.5 rounded bg-[var(--accent)] px-3 py-1 text-[11px] font-medium text-[var(--accent-fg)] hover:bg-[var(--accent-strong)] disabled:opacity-40"
          title={T.exportVideo}
        >
          {exporting ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Download className="h-3 w-3" />
          )}
          {T.exportMp4}
        </button>
      </div>

      {loadError || actionError ? (
        <div
          role="alert"
          className="flex shrink-0 items-center justify-between gap-2 border-b border-[var(--status-err)]/30 bg-[var(--status-err)]/10 px-3 py-1.5 text-[11px] text-[var(--status-err)]"
        >
          <span>{loadError ?? actionError}</span>
          <button
            onClick={() => {
              setLoadError(null);
              setActionError(null);
              void loadClips();
            }}
            className="rounded border border-current px-1.5 py-px text-[10px] hover:bg-[var(--status-err)]/10"
          >
            {UI_LABELS.common.reessayer}
          </button>
        </div>
      ) : null}

      {/* Timeline tracks */}
      <div className="relative h-[42%] shrink-0 overflow-auto bg-[var(--surface-1)] p-3">
        {empty ? (
          <div className="mb-2">
            <EmptyState icon={Film} title={T.videTitre} description={T.videDescription} compact />
          </div>
        ) : null}
        <div className="flex gap-3">
          <div className="w-20 shrink-0 space-y-1">
            {TRACKS.map((t) => {
              const ducked = clips.some((c) => c.track === t && c.meta?.ducking);
              const gain = duckGains.get(t);
              const duckActive = ducked && gain != null && gain < 0.95;
              const db = gain != null ? gainToDb(gain) : null;
              return (
                <div
                  key={t}
                  className="flex h-12 items-center gap-1 rounded bg-[var(--surface-2)] px-2 text-[10px] uppercase tracking-widest text-[var(--text-dim)]"
                >
                  <span>{TRACK_LABELS[t] ?? t}</span>
                  {ducked ? (
                    <span
                      className="inline-flex items-center gap-1 rounded bg-[var(--accent-quiet)] px-1 py-px text-[8px] font-bold tracking-widest text-[var(--accent-strong)]"
                      title={db != null ? T.duckGain(db) : T.duckBadge}
                    >
                      {T.duckCourt}
                      <span
                        aria-hidden
                        className={`inline-block h-1.5 w-1.5 rounded-full bg-current transition-all duration-150 ${
                          playing && duckActive ? "animate-pulse scale-125" : "opacity-40"
                        }`}
                        style={
                          gain != null
                            ? { opacity: 1 - gain * 0.7, transform: `scale(${1.6 - gain * 0.6})` }
                            : undefined
                        }
                      />
                    </span>
                  ) : null}
                </div>
              );
            })}
          </div>
          <div
            className="relative flex-1"
            style={{ minWidth: totalMs * PX_PER_MS }}
            ref={trackAreaRef}
          >
            <div className="space-y-1">
              {TRACKS.map((t) => {
                const rowClips = clips.filter((c) => c.track === t);
                return (
                  <div
                    key={t}
                    onClick={() => selectClip(null)}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragOverTrack(t);
                    }}
                    onDragLeave={() => setDragOverTrack((cur) => (cur === t ? null : cur))}
                    onDrop={(e) => handleClipDrop(e, t)}
                    className={`relative h-12 rounded transition-colors ${
                      dragOverTrack === t ? "bg-[var(--accent-quiet)]" : "bg-[var(--surface-2)]"
                    }`}
                  >
                    {rowClips.map((c) => {
                      const isSilence = c.meta?.silence === true;
                      const isSelected = selectedClipId === c.id;
                      const meta = c.meta ?? {};
                      const fadeInMs = typeof meta.fade_in_ms === "number" ? meta.fade_in_ms : 0;
                      const fadeOutMs = typeof meta.fade_out_ms === "number" ? meta.fade_out_ms : 0;
                      const tInMs =
                        typeof meta.transition_in_ms === "number" ? meta.transition_in_ms : 0;
                      const tOutMs =
                        typeof meta.transition_out_ms === "number" ? meta.transition_out_ms : 0;
                      const hasFadeIn = fadeInMs > 0 || tInMs > 0;
                      const hasFadeOut = fadeOutMs > 0 || tOutMs > 0;
                      const chipTitle = `${c.assets?.prompt ?? (c.meta?.prompt as string | undefined) ?? ""}\n${T.astuceSelection} · ${T.astuceNudge} · ${T.astuceSupprimer}`;
                      return (
                        <div
                          key={c.id}
                          draggable
                          onDragStart={(e) => handleClipDragStart(e, c)}
                          onClick={(e) => {
                            e.stopPropagation();
                            selectClip(isSelected ? null : c.id);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.stopPropagation();
                              selectClip(isSelected ? null : c.id);
                            }
                          }}
                          tabIndex={0}
                          role="option"
                          aria-selected={isSelected}
                          aria-label={`${TRACK_LABELS[t] ?? t} — ${((c.assets?.prompt as string | undefined) ?? (c.meta?.prompt as string | undefined) ?? c.assets?.kind ?? "?").slice(0, 60)}`}
                          className={`absolute top-1 h-10 cursor-grab overflow-hidden rounded border bg-[var(--surface-3)] text-[10px] outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-[var(--accent)] active:cursor-grabbing ${
                            isSilence
                              ? "border-dashed border-[var(--line-strong)] bg-[var(--surface-2)] text-[var(--text-dim)]"
                              : "border-[var(--accent)]/40"
                          } ${isSelected ? "ring-2 ring-[var(--accent)]" : ""}`}
                          style={{
                            left: c.start_ms * PX_PER_MS,
                            width: Math.max(24, c.duration_ms * PX_PER_MS),
                          }}
                          title={chipTitle}
                        >
                          {isSilence ? (
                            <div className="flex h-full items-center gap-1 px-1">
                              <VolumeX size={11} className="shrink-0" />
                              <span className="truncate">
                                {T.silence} {(c.duration_ms / 1000).toFixed(1)}s
                              </span>
                            </div>
                          ) : c.assets?.kind === "image" && isHttpUrl(c.assets.url) ? (
                            <img
                              src={c.assets.url}
                              alt=""
                              loading="lazy"
                              draggable={false}
                              className="h-full w-full object-cover opacity-80"
                            />
                          ) : c.assets?.kind === "html" ? (
                            <div className="flex h-full items-center justify-center bg-white/10 p-1 text-[9px] uppercase tracking-wider text-white/70">
                              {kindLabel("html")}
                            </div>
                          ) : (
                            <div className="truncate p-1">{kindLabel(c.assets?.kind ?? "")}</div>
                          )}
                          <div
                            onMouseDown={(e) => handleResizeStart(e, c, "left")}
                            title={T.astuceRedimensionner}
                            className="absolute inset-y-0 left-0 w-1.5 cursor-ew-resize bg-transparent hover:bg-[var(--accent)]/50"
                          />
                          {hasFadeIn ? (
                            <div
                              className="absolute inset-y-0 left-0 w-[3px] bg-[var(--accent)]/80"
                              title={T.fonduEntree(Math.max(fadeInMs, tInMs))}
                            />
                          ) : null}
                          {hasFadeOut ? (
                            <div
                              className="absolute inset-y-0 right-0 w-[3px] bg-[var(--accent)]/80"
                              title={T.fonduSortie(Math.max(fadeOutMs, tOutMs))}
                            />
                          ) : null}
                          <div
                            onMouseDown={(e) => handleResizeStart(e, c, "right")}
                            title={T.astuceRedimensionner}
                            className="absolute inset-y-0 right-0 w-1.5 cursor-ew-resize bg-transparent hover:bg-[var(--accent)]/50"
                          />
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
            {/* Playhead — GPU transform, updated via ref at 60 fps */}
            <div
              ref={playheadLineRef}
              className="pointer-events-none absolute top-0 left-0 h-full w-px bg-[var(--accent)] will-change-transform"
              style={{ transform: `translateX(${playhead * PX_PER_MS}px)` }}
            >
              <div className="absolute -top-1 -left-[3px] h-2 w-2 rounded-sm bg-[var(--accent)]" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
