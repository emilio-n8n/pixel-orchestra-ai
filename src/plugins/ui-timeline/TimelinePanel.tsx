import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLibraryProject } from "@/plugins/library/project";
import { supabase } from "@/integrations/supabase/client";
import { Play, Pause, Square, Download, Loader2, Maximize2, Minimize2, VolumeX, Trash2 } from "lucide-react";
import html2canvas from "html2canvas";
import { useTimelineUi, clipFades, type TimelineClip } from "./store";
import { insertSilenceClip } from "./server";
import { duckGainAt } from "@/lib/director/ducking";

const TRACKS = ["Video", "Audio", "Music", "SFX", "Subtitles"] as const;
const AUDIO_TRACKS = new Set(["Audio", "Music", "SFX"]);
const PX_PER_MS = 0.08;

/**
 * Combined volume envelope of a clip at absolute time `absMs`:
 * fade-in/out (clipFades) × ducking gain (meta.ducking.curve).
 * Used by both the preview loop and the export envelope.
 */
function volAt(c: TimelineClip, absMs: number): number {
  const local = absMs - c.start_ms;
  if (local < 0 || local > c.duration_ms) return 0;
  let v = 1;
  const { fadeInMs, fadeOutMs } = clipFades(c);
  if (fadeInMs > 0 && local < fadeInMs) v *= local / fadeInMs;
  const untilEnd = c.duration_ms - local;
  if (fadeOutMs > 0 && untilEnd < fadeOutMs) v *= Math.max(0, untilEnd / fadeOutMs);
  const ducking = (c.meta?.ducking ?? null) as { curve?: Array<{ t_ms: number; gain: number }> } | null;
  if (ducking?.curve) v *= duckGainAt(ducking.curve, absMs);
  return Math.max(0, Math.min(1, v));
}

/** mm:ss formatting for the playhead readout. */
function fmt(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  return `${m.toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Asset urls come from Supabase storage. If a signed url failed at creation
 * time a relative filename can leak into the table; loading it against the
 * app origin 500s. Only ever load absolute http(s) urls.
 */
function isHttpUrl(url: string | null | undefined): url is string {
  return typeof url === "string" && /^https?:\/\//i.test(url);
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
  const selectedClipId = useTimelineUi((s) => s.selectedClipId);
  const selectClip = useTimelineUi((s) => s.selectClip);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const imgCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const rafRef = useRef<number | null>(null);
  const audiosRef = useRef<HTMLAudioElement[]>([]);
  const audioMapRef = useRef<Map<string, { el: HTMLAudioElement; clip: TimelineClip }>>(new Map());
  const timersRef = useRef<number[]>([]);
  const clipsRef = useRef<TimelineClip[]>([]);
  const htmlOverlayRef = useRef<HTMLIFrameElement>(null);
  const prerenderedRef = useRef<Map<string, string>>(new Map());
  const htmlVideoElsRef = useRef<Map<string, HTMLVideoElement>>(new Map());
  const trackAreaRef = useRef<HTMLDivElement>(null);
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

  // Keep the Inspector's selection in sync when clips reload (realtime).
  useEffect(() => {
    const clip = clips.find((c) => c.id === selectedClipId) ?? null;
    useTimelineUi.setState({ selectedClip: clip });
    if (selectedClipId && !clip) selectClip(null);
  }, [clips, selectedClipId, selectClip]);

  // --------------- load + subscribe clips ---------------
  useEffect(() => {
    if (!pid) return;
    const projectId = pid;
    let alive = true;
    async function load() {
      const { data } = await supabase
        .from("timeline_clips")
        .select("id, track, start_ms, duration_ms, asset_id, meta, assets(kind, url, prompt)")
        .eq("project_id", projectId)
        .order("track")
        .order("start_ms");
      if (alive) setClips((data ?? []) as unknown as TimelineClip[]);
    }
    load();
    const ch = supabase
      .channel(`clips:${projectId}`)
      .on("postgres_changes" as never, { event: "*", schema: "public", table: "timeline_clips", filter: `project_id=eq.${projectId}` }, load)
      .on("postgres_changes" as never, { event: "*", schema: "public", table: "assets", filter: `project_id=eq.${projectId}` }, load)
      .subscribe();
    return () => {
      alive = false;
      supabase.removeChannel(ch);
    };
  }, [pid]);

  const totalMs = useMemo(
    () => Math.max(10000, ...clips.map((c) => c.start_ms + c.duration_ms)),
    [clips],
  );

  // --------------- preload images ---------------
  useEffect(() => {
    for (const c of clips) {
      const url = c.assets?.url;
      if (c.assets?.kind === "image" && isHttpUrl(url) && !imgCacheRef.current.has(url)) {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.src = url;
        imgCacheRef.current.set(url, img);
      }
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

  useEffect(() => {
    if (!playing && !exporting) return;
    const active = clipsRef.current.find(
      (c) =>
        c.assets?.kind === "html" &&
        playhead >= c.start_ms &&
        playhead < c.start_ms + c.duration_ms,
    );
    setActiveHtmlClip(active ?? null);

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
  }, [playhead, playing, exporting]);

  // --------------- draw ---------------
  const draw = useCallback(
    (ms: number, htmlVideoMap?: Map<string, string>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Draw video / image clips — supports a dissolve when two clips
      // overlap on the Video track (set via set_clip_transitions).
      const activeVideos = clipsRef.current
        .filter((c) => c.track === "Video" && ms >= c.start_ms && ms < c.start_ms + c.duration_ms)
        .sort((a, b) => a.start_ms - b.start_ms);

      const drawV = (c: TimelineClip, alpha: number) => {
        ctx.save();
        if (alpha < 1) ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
        if (c.assets?.kind === "image" && c.assets.url) {
          const img = imgCacheRef.current.get(c.assets.url);
          if (img && img.complete && img.naturalWidth) {
            const iw = img.naturalWidth, ih = img.naturalHeight;
            const cw = canvas.width, ch = canvas.height;
            const scale = Math.min(cw / iw, ch / ih);
            const w = iw * scale, h = ih * scale;
            ctx.drawImage(img, (cw - w) / 2, (ch - h) / 2, w, h);
          }
        } else if (c.assets?.kind === "html" && htmlVideoMap) {
          const vidUrl = htmlVideoMap.get(c.id);
          if (vidUrl) {
            let ve = htmlVideoElsRef.current.get(c.id);
            if (!ve) {
              ve = document.createElement("video");
              ve.src = vidUrl;
              ve.preload = "auto";
              ve.muted = true;
              htmlVideoElsRef.current.set(c.id, ve);
            }
            const offset = ms - c.start_ms;
            const frames = Math.ceil(c.duration_ms / 33.33);
            const frameDuration = c.duration_ms / frames;
            const frame = Math.min(frames - 1, Math.floor(offset / frameDuration));
            ve.currentTime = frame * (frameDuration / 1000);
            const cw = canvas.width, ch = canvas.height;
            ctx.drawImage(ve, 0, 0, cw, ch);
          }
        }
        ctx.restore();
      };

      if (activeVideos.length >= 2) {
        const a = activeVideos[activeVideos.length - 2];
        const b = activeVideos[activeVideos.length - 1];
        const span = a.start_ms + a.duration_ms - b.start_ms;
        const prog = span > 0 ? (ms - b.start_ms) / span : 1;
        drawV(a, 1 - prog);
        drawV(b, prog);
      } else if (activeVideos.length === 1) {
        const c = activeVideos[0];
        drawV(c, 1);
        // Fade to/from black (transition_in_ms / transition_out_ms).
        const local = ms - c.start_ms;
        const inMs = typeof c.meta?.transition_in_ms === "number" ? c.meta.transition_in_ms : 0;
        const outMs = typeof c.meta?.transition_out_ms === "number" ? c.meta.transition_out_ms : 0;
        let blackAlpha = 0;
        if (inMs > 0 && local < inMs) blackAlpha = Math.max(blackAlpha, 1 - local / inMs);
        const untilEnd = c.start_ms + c.duration_ms - ms;
        if (outMs > 0 && untilEnd < outMs) blackAlpha = Math.max(blackAlpha, untilEnd / outMs);
        if (blackAlpha > 0) {
          ctx.fillStyle = `rgba(0,0,0,${blackAlpha})`;
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
      }

      // Subtitles
      const sub = clipsRef.current.find(
        (c) => c.track === "Subtitles" && ms >= c.start_ms && ms < c.start_ms + c.duration_ms,
      );
      if (sub) {
        const rawText = (sub.meta?.text as string | undefined) ?? sub.assets?.prompt;
        if (rawText) {
          const style = (sub.meta?.style ?? {}) as {
            font?: string;
            size?: number;
            color?: string;
            position?: string;
          };
          const size = style.size ?? 28;
          const font = style.font ? `${size}px ${style.font}` : `${size}px system-ui, sans-serif`;
          const color = style.color ?? "#fff";
          const position = style.position ?? "bottom";
          const text = rawText.slice(0, 120);
          ctx.font = font;
          const tw = ctx.measureText(text).width;
          const boxH = size + 16;
          const y =
            position === "top"
              ? 70
              : position === "center"
                ? canvas.height / 2 - boxH / 2
                : canvas.height - 70 - boxH;
          ctx.fillStyle = "rgba(0,0,0,0.55)";
          ctx.fillRect((canvas.width - tw) / 2 - 12, y, tw + 24, boxH);
          ctx.fillStyle = color;
          ctx.textAlign = "center";
          ctx.textBaseline = "bottom";
          ctx.fillText(text, canvas.width / 2, y + boxH - 8);
        }
      }
    },
    [],
  );

  useEffect(() => {
    draw(playhead);
  }, [playhead, clips, draw]);

  // --------------- fullscreen preview ---------------
  useEffect(() => {
    const onFs = () => {
      const fs = document.fullscreenElement === previewRef.current;
      setIsFullscreen(fs);
      if (fs) {
        setPlayhead((p) => (p >= totalMs ? 0 : p));
        setPlaying(true);
      }
    };
    document.addEventListener("fullscreenchange", onFs);
    document.addEventListener("webkitfullscreenchange", onFs as EventListener);
    return () => {
      document.removeEventListener("fullscreenchange", onFs);
      document.removeEventListener("webkitfullscreenchange", onFs as EventListener);
    };
  }, [totalMs]);

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
  function msFromClientX(clientX: number): number {
    const el = trackAreaRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    const scrollLeft = (el.parentElement as HTMLElement | null)?.scrollLeft ?? 0;
    return Math.max(0, (clientX - rect.left + scrollLeft) / PX_PER_MS);
  }

  /** Push `startMs` after any overlapping clip on `track` (same logic as add_to_timeline). */
  function resolveNoOverlap(track: string, startMs: number, durationMs: number, excludeId?: string): number {
    let start = Math.max(0, Math.round(startMs / 10) * 10);
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

  async function updateClip(id: string, patch: { start_ms?: number; duration_ms?: number; track?: string }) {
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
      console.error("[timeline] insert silence failed", e);
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
    try {
      await supabase.from("timeline_clips").delete().eq("id", id);
      if (ripple) {
        const removedEnd = (clip.start_ms ?? 0) + (clip.duration_ms ?? 0);
        const later = clipsRef.current.filter(
          (c) => c.track === clip.track && (c.start_ms ?? 0) >= removedEnd && c.id !== id,
        );
        for (const c of later) {
          await supabase
            .from("timeline_clips")
            .update({ start_ms: Math.max(0, (c.start_ms ?? 0) - (clip.duration_ms ?? 0)) })
            .eq("id", c.id);
        }
      }
      selectClip(null);
    } catch (e) {
      console.error("[timeline] delete failed", e);
    }
  }

  // Keyboard: Delete = remove, Shift+Delete = ripple remove. Never while typing.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      if ((e.key === "Delete" || e.key === "Backspace") && selectedClipId) {
        e.preventDefault();
        void deleteSelected(e.shiftKey);
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
    const start = resolveNoOverlap(track, msFromClientX(e.clientX) - drag.offsetMs, duration, clip.id);
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

  useEffect(() => {
    function onMove(e: MouseEvent) {
      const r = resizeRef.current;
      if (!r) return;
      const dx = (e.clientX - r.startClientX) / PX_PER_MS;
      if (r.side === "left") {
        const newStart = Math.max(0, Math.min(r.startMs + dx, r.startMs + r.durationMs - 100));
        patchClipLocal(r.clipId, {
          start_ms: Math.round(newStart),
          duration_ms: Math.round(r.durationMs - (newStart - r.startMs)),
        });
      } else {
        patchClipLocal(r.clipId, { duration_ms: Math.round(Math.max(100, r.durationMs + dx)) });
      }
    }
    function onUp(e: MouseEvent) {
      const r = resizeRef.current;
      if (r) {
        const dx = (e.clientX - r.startClientX) / PX_PER_MS;
        if (r.side === "left") {
          const newStart = Math.max(0, Math.min(r.startMs + dx, r.startMs + r.durationMs - 100));
          void updateClip(r.clipId, {
            start_ms: Math.round(newStart),
            duration_ms: Math.round(r.durationMs - (newStart - r.startMs)),
          });
        } else {
          void updateClip(r.clipId, { duration_ms: Math.round(Math.max(100, r.durationMs + dx)) });
        }
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
    audiosRef.current.forEach((a) => { try { a.pause(); } catch { /* noop */ } });
    audiosRef.current = [];
    timersRef.current.forEach((t) => clearTimeout(t));
    timersRef.current = [];
    audioMapRef.current.clear();
  }, []);

  const stop = useCallback(() => {
    setPlaying(false);
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    stopAudios();
  }, [stopAudios]);

  useEffect(() => {
    if (!playing) return;
    const startFrom = playhead >= totalMs ? 0 : playhead;
    const startedAt = performance.now();

    for (const c of clipsRef.current) {
      if (!AUDIO_TRACKS.has(c.track) || !isHttpUrl(c.assets?.url)) continue;
      const a = new Audio(c.assets!.url);
      a.crossOrigin = "anonymous";
      const offset = (startFrom - c.start_ms) / 1000;
      if (startFrom >= c.start_ms && startFrom < c.start_ms + c.duration_ms) {
        a.currentTime = Math.max(0, offset);
        a.volume = volAt(c, startFrom);
        a.play().catch(() => {});
        audiosRef.current.push(a);
        audioMapRef.current.set(c.id, { el: a, clip: c });
      } else if (startFrom < c.start_ms) {
        const t = window.setTimeout(() => {
          a.volume = volAt(c, c.start_ms);
          a.play().catch(() => {});
        }, c.start_ms - startFrom);
        timersRef.current.push(t);
        audiosRef.current.push(a);
        audioMapRef.current.set(c.id, { el: a, clip: c });
      }
    }

    function tick() {
      const p = startFrom + (performance.now() - startedAt);
      if (p >= totalMs) {
        setPlayhead(totalMs);
        setPlaying(false);
        stopAudios();
        return;
      }
      // Volume envelope each frame: fades + ducking gain.
      for (const [, entry] of audioMapRef.current) {
        try {
          entry.el.volume = volAt(entry.clip, p);
        } catch { /* element already gone */ }
      }
      setPlayhead(p);
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      stopAudios();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);

  useEffect(() => () => stop(), [stop]);

  // --------------- pre-render HTML clip to video ---------------
  async function prerenderHtmlClip(clip: TimelineClip): Promise<string | null> {
    const url = clip.assets?.url;
    if (!isHttpUrl(url)) return null;

    try {
      const html = await fetch(url).then((r) => r.text());

      const iframe = document.createElement("iframe");
      iframe.style.cssText = "position:absolute;left:-9999px;width:1920px;height:1080px;border:none";
      document.body.appendChild(iframe);

      return new Promise((resolve) => {
        iframe.onload = async () => {
          try {
            const offscreen = document.createElement("canvas");
            offscreen.width = 1920;
            offscreen.height = 1080;
            const octx = offscreen.getContext("2d")!;

            const stream = offscreen.captureStream(30);
            const rec = new MediaRecorder(stream, {
              mimeType: MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
                ? "video/webm;codecs=vp9"
                : "video/webm",
            });
            const chunks: BlobPart[] = [];
            rec.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);
            rec.onstop = () => {
              document.body.removeChild(iframe);
              const blob = new Blob(chunks, { type: "video/webm" });
              resolve(URL.createObjectURL(blob));
            };
            rec.start();

            const totalFrames = Math.max(1, Math.ceil(clip.duration_ms / 33.33));
            const loopStart = performance.now();
            const safetyTimeout = setTimeout(() => rec.stop(), clip.duration_ms + 10_000);

            (async () => {
              for (let frame = 0; frame < totalFrames; frame++) {
                try {
                  const captured = await html2canvas(iframe.contentDocument!.body, {
                    width: 1920,
                    height: 1080,
                    scale: 1,
                    useCORS: true,
                  });
                  octx.clearRect(0, 0, 1920, 1080);
                  octx.drawImage(captured, 0, 0, 1920, 1080);
                } catch {
                  /* skip dropped frame */
                }
              }
              clearTimeout(safetyTimeout);
              rec.stop();
            })();
          } catch {
            document.body.removeChild(iframe);
            resolve(null);
          }
        };
        iframe.onerror = () => {
          document.body.removeChild(iframe);
          resolve(null);
        };
        iframe.srcdoc = html;
      });
    } catch {
      return null;
    }
  }

  // --------------- export ---------------
  async function exportVideo() {
    const canvas = canvasRef.current;
    if (!canvas || exporting) return;
    stop();
    setExporting(true);
    setExportPct(0);

    try {
      // Pre-render all HTML clips to video
      const htmlClips = clipsRef.current.filter((c) => c.assets?.kind === "html");
      prerenderedRef.current.clear();
      for (const clip of htmlClips) {
        const blobUrl = await prerenderHtmlClip(clip);
        if (blobUrl) prerenderedRef.current.set(clip.id, blobUrl);
      }

      const stream = canvas.captureStream(30);
      const AC: typeof AudioContext = (window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext);
      const ac = new AC();
      if (ac.state === "suspended") await ac.resume();
      const dest = ac.createMediaStreamDestination();

      const audioClips = clipsRef.current.filter(
        (c) => AUDIO_TRACKS.has(c.track) && isHttpUrl(c.assets?.url),
      );
      const decoded = await Promise.all(
        audioClips.map(async (c) => {
          try {
            const buf = await fetch(c.assets!.url).then((r) => r.arrayBuffer());
            const audio = await ac.decodeAudioData(buf);
            return { c, audio };
          } catch {
            return null;
          }
        }),
      );
      const startAt = ac.currentTime + 0.15;
      for (const item of decoded) {
        if (!item) continue;
        const c = item.c;
        const src = ac.createBufferSource();
        src.buffer = item.audio;
        const gain = ac.createGain();
        const t0 = startAt + c.start_ms / 1000;
        // Envelope: fade-in/out × ducking gain, sampled every 50ms.
        const durMs = item.audio.duration * 1000;
        const STEP = 50;
        for (let t = 0; t <= durMs + STEP; t += STEP) {
          const v = volAt(c, c.start_ms + t);
          if (t === 0) gain.gain.setValueAtTime(v, t0);
          else gain.gain.linearRampToValueAtTime(v, t0 + Math.min(t, durMs) / 1000);
        }
        src.connect(gain);
        gain.connect(dest);
        src.start(t0);
      }
      dest.stream.getAudioTracks().forEach((t) => stream.addTrack(t));

      const candidates = [
        "video/mp4;codecs=avc1,mp4a",
        "video/mp4",
        "video/webm;codecs=vp9,opus",
        "video/webm;codecs=vp8,opus",
        "video/webm",
      ];
      const mime =
        candidates.find((m) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m)) ??
        "video/webm";
      const containerMime = mime.startsWith("video/mp4") ? "video/mp4" : "video/webm";
      const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 3_000_000 });
      const chunks: BlobPart[] = [];
      rec.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);
      const done = new Promise<Blob>((res) => {
        rec.onstop = () => res(new Blob(chunks, { type: containerMime }));
      });
      draw(0, prerenderedRef.current);
      rec.start(100);
      const startedAt = performance.now();

      // Pre-create video elements for pre-rendered HTML clips
      htmlVideoElsRef.current.forEach((ve) => ve.remove());
      htmlVideoElsRef.current.clear();
      for (const [clipId, blobUrl] of prerenderedRef.current) {
        const ve = document.createElement("video");
        ve.src = blobUrl;
        ve.preload = "auto";
        ve.muted = true;
        ve.style.display = "none";
        document.body.appendChild(ve);
        htmlVideoElsRef.current.set(clipId, ve);
      }

      const totalExportFrames = Math.max(1, Math.ceil(totalMs / 33.33));
      await new Promise<void>((res) => {
        let frame = 0;
        function loop() {
          const p = Math.min(totalMs, frame * 33.33);
          setPlayhead(p);
          setExportPct(frame / totalExportFrames);
          draw(p, prerenderedRef.current);
          frame++;
          if (frame >= totalExportFrames) return res();
          requestAnimationFrame(loop);
        }
        requestAnimationFrame(loop);
      });
      rec.stop();
      const blob = await done;
      await ac.close();
      const ext = containerMime === "video/mp4" ? "mp4" : "webm";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `lilium-timeline.${ext}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      // Cleanup pre-rendered blobs
      prerenderedRef.current.forEach((u) => URL.revokeObjectURL(u));
      prerenderedRef.current.clear();
      htmlVideoElsRef.current.forEach((ve) => ve.remove());
      htmlVideoElsRef.current.clear();
    } finally {
      setExporting(false);
      setExportPct(0);
      currentHtmlUrlRef.current = null;
    }
  }

  if (!pid)
    return (
      <div className="flex h-full items-center justify-center p-8 text-sm text-[var(--text-muted)]">
        No project.
      </div>
    );

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[var(--surface-1)] text-xs text-[var(--text-muted)]">
      {/* Preview */}
      <div ref={previewRef} className="group relative flex min-h-0 flex-1 items-center justify-center bg-black">
        <canvas
          ref={canvasRef}
          width={1920}
          height={1080}
          className="max-h-full max-w-full"
          style={{ aspectRatio: "16 / 9" }}
        />
        {activeHtmlClip && (
          <iframe
            ref={htmlOverlayRef}
            className="pointer-events-none absolute z-10 max-h-full max-w-full"
            style={{ aspectRatio: "16 / 9" }}
            sandbox="allow-scripts"
            title="html-preview"
          />
        )}
        {exporting && (
          <div className="absolute inset-x-0 bottom-0 flex items-center gap-2 bg-black/70 px-3 py-2 text-[11px] text-white">
            <Loader2 className="h-3 w-3 animate-spin" />
            Recording… {Math.round(exportPct * 100)}%
          </div>
        )}
        {isFullscreen && (
          <div
            className={`absolute inset-x-0 bottom-0 z-20 flex items-center gap-2 bg-black/60 px-3 py-2 backdrop-blur-sm transition-opacity ${
              playing ? "pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100" : ""
            }`}
          >
            <button
              onClick={() => setPlaying(!playing)}
              className="flex h-7 w-7 items-center justify-center rounded bg-white/10 text-white hover:bg-white/25"
              title={playing ? "Pause" : "Play"}
            >
              {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
            </button>
            <button
              onClick={() => { setPlaying(false); setPlayhead(0); }}
              className="flex h-7 w-7 items-center justify-center rounded bg-white/10 text-white hover:bg-white/25"
              title="Stop"
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
              onChange={(e) => { setPlaying(false); setPlayhead(Number(e.target.value)); }}
              className="flex-1 accent-[var(--accent)]"
            />
            <button
              onClick={toggleFullscreen}
              className="flex h-7 w-7 items-center justify-center rounded bg-white/10 text-white hover:bg-white/25"
              title="Exit fullscreen"
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
          title={playing ? "Pause" : "Play"}
        >
          {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
        </button>
        <button
          onClick={() => { setPlaying(false); setPlayhead(0); }}
          disabled={exporting}
          className="flex h-7 w-7 items-center justify-center rounded bg-[var(--surface-3)] text-[var(--text)] hover:bg-[var(--accent-quiet)] disabled:opacity-40"
          title="Stop"
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
          onChange={(e) => { setPlaying(false); setPlayhead(Number(e.target.value)); }}
          disabled={exporting}
          className="flex-1 accent-[var(--accent)]"
        />
        <div className="text-[11px] text-[var(--text-dim)]">{clips.length} clips</div>
        {selectedClipId ? (
          <button
            onClick={() => void deleteSelected(false)}
            onShiftClick={() => void deleteSelected(true)}
            title="Supprimer le clip sélectionné — ⇧Suppr ou Maj+clic pour compacter (ripple)"
            className="ml-1 flex h-6 items-center gap-1 rounded border border-[var(--status-err)]/40 px-2 text-[10px] font-medium text-[var(--status-err)] transition-colors hover:bg-[var(--status-err)]/10 disabled:opacity-40"
          >
            <Trash2 size={10} />
            Supprimer
          </button>
        ) : null}
        <div className="ml-1 flex items-center gap-1 rounded border border-[var(--line)] bg-[var(--surface-2)] px-1 py-0.5">
          <input
            value={silenceSecs}
            onChange={(e) => setSilenceSecs(e.target.value)}
            disabled={exporting || addingSilence}
            title="Durée du silence en secondes"
            className="w-9 bg-transparent text-center text-[10.5px] text-[var(--text)] outline-none"
            inputMode="decimal"
          />
          <button
            onClick={addSilence}
            disabled={exporting || addingSilence || !pid}
            title="Insérer un silence (Audio) à la fin de la piste"
            className="flex h-6 items-center gap-1 rounded bg-[var(--surface-3)] px-1.5 text-[10px] font-medium text-[var(--text-muted)] transition-colors hover:text-[var(--text)] disabled:opacity-40"
          >
            <VolumeX size={10} />
            Silence
          </button>
        </div>
        <button
          onClick={toggleFullscreen}
          disabled={exporting}
          className="ml-2 flex h-7 items-center gap-1.5 rounded bg-[var(--surface-3)] px-2.5 text-[11px] font-medium text-[var(--text)] hover:bg-[var(--accent-quiet)] disabled:opacity-40"
          title="Fullscreen preview (record with Cmd+Shift+5)"
        >
          <Maximize2 className="h-3.5 w-3.5" />
          Fullscreen
        </button>
        <button
          onClick={exportVideo}
          disabled={exporting || clips.length === 0}
          className="ml-2 flex items-center gap-1.5 rounded bg-[var(--accent)] px-3 py-1 text-[11px] font-medium text-[var(--accent-fg)] hover:bg-[var(--accent-strong)] disabled:opacity-40"
          title="Export final video"
        >
          {exporting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
          Export MP4
        </button>
      </div>

      {/* Timeline tracks */}
      <div className="relative h-[42%] shrink-0 overflow-auto bg-[var(--surface-1)] p-3">
        <div className="flex gap-3">
          <div className="w-20 shrink-0 space-y-1">
            {TRACKS.map((t) => {
              const ducked = clips.some((c) => c.track === t && c.meta?.ducking);
              return (
                <div
                  key={t}
                  className="flex h-12 items-center gap-1 rounded bg-[var(--surface-2)] px-2 text-[10px] uppercase tracking-widest text-[var(--text-dim)]"
                >
                  <span>{t}</span>
                  {ducked ? (
                    <span
                      className="rounded bg-[var(--accent-quiet)] px-1 py-px text-[8px] font-bold tracking-widest text-[var(--accent-strong)]"
                      title="Ducking appliqué sur cette piste"
                    >
                      duck
                    </span>
                  ) : null}
                </div>
              );
            })}
          </div>
          <div className="relative flex-1" style={{ minWidth: totalMs * PX_PER_MS }} ref={trackAreaRef}>
            <div className="space-y-1">
              {TRACKS.map((t) => {
                const rowClips = clips.filter((c) => c.track === t);
                return (
                  <div
                    key={t}
                    onDragOver={(e) => { e.preventDefault(); setDragOverTrack(t); }}
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
                      const tInMs = typeof meta.transition_in_ms === "number" ? meta.transition_in_ms : 0;
                      const tOutMs = typeof meta.transition_out_ms === "number" ? meta.transition_out_ms : 0;
                      const hasFadeIn = fadeInMs > 0 || tInMs > 0;
                      const hasFadeOut = fadeOutMs > 0 || tOutMs > 0;
                      return (
                        <div
                          key={c.id}
                          draggable={!isSilence}
                          onDragStart={(e) => handleClipDragStart(e, c)}
                          onClick={(e) => {
                            e.stopPropagation();
                            selectClip(isSelected ? null : c.id);
                          }}
                          className={`absolute top-1 h-10 cursor-grab overflow-hidden rounded border bg-[var(--surface-3)] text-[10px] active:cursor-grabbing ${
                            isSilence
                              ? "border-dashed border-[var(--line-strong)] bg-[var(--surface-2)] text-[var(--text-dim)]"
                              : "border-[var(--accent)]/40"
                          } ${isSelected ? "ring-2 ring-[var(--accent)]" : ""}`}
                          style={{
                            left: c.start_ms * PX_PER_MS,
                            width: Math.max(24, c.duration_ms * PX_PER_MS),
                          }}
                          title={c.assets?.prompt ?? c.meta?.prompt ?? ""}
                        >
                          {isSilence ? (
                            <div className="flex h-full items-center gap-1 px-1">
                              <VolumeX size={11} className="shrink-0" />
                              <span className="truncate">
                                Silence {(c.duration_ms / 1000).toFixed(1)}s
                              </span>
                            </div>
                          ) : c.assets?.kind === "image" && isHttpUrl(c.assets.url) ? (
                            <img
                              src={c.assets.url}
                              alt=""
                              className="h-full w-full object-cover opacity-80"
                            />
                          ) : c.assets?.kind === "html" ? (
                            <div className="flex h-full items-center justify-center bg-white/10 p-1 text-[9px] uppercase tracking-wider text-white/70">
                              HTML
                            </div>
                          ) : (
                            <div className="truncate p-1">{c.assets?.kind ?? "?"}</div>
                          )}
                          {!isSilence && (
                            <div
                              onMouseDown={(e) => handleResizeStart(e, c, "left")}
                              className="absolute inset-y-0 left-0 w-1.5 cursor-ew-resize bg-transparent hover:bg-[var(--accent)]/50"
                            />
                          )}
                          {hasFadeIn ? (
                            <div
                              className="absolute inset-y-0 left-0 w-[3px] bg-[var(--accent)]/80"
                              title={`Fondu d'entrée ${Math.max(fadeInMs, tInMs)}ms`}
                            />
                          ) : null}
                          {hasFadeOut ? (
                            <div
                              className="absolute inset-y-0 right-0 w-[3px] bg-[var(--accent)]/80"
                              title={`Fondu de sortie ${Math.max(fadeOutMs, tOutMs)}ms`}
                            />
                          ) : null}
                          <div
                            onMouseDown={(e) => handleResizeStart(e, c, "right")}
                            className="absolute inset-y-0 right-0 w-1.5 cursor-ew-resize bg-transparent hover:bg-[var(--accent)]/50"
                          />
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
            {/* Playhead */}
            <div
              className="pointer-events-none absolute top-0 h-full w-px bg-[var(--accent)]"
              style={{ left: playhead * PX_PER_MS }}
            >
              <div className="absolute -top-1 -left-[3px] h-2 w-2 rounded-sm bg-[var(--accent)]" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
                                                                                                                                                                                                                                                                                                                                                                                   