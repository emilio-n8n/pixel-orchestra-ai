import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLibraryProject } from "@/plugins/library/project";
import { supabase } from "@/integrations/supabase/client";
import { Play, Pause, Square, Download, Loader2 } from "lucide-react";
import html2canvas from "html2canvas";

const TRACKS = ["Video", "Audio", "Music", "SFX", "Subtitles"] as const;
const AUDIO_TRACKS = new Set(["Audio", "Music", "SFX"]);

type Clip = {
  id: string;
  track: string;
  start_ms: number;
  duration_ms: number;
  asset_id: string | null;
  assets: { kind: string; url: string; prompt: string | null } | null;
};

function fmt(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  return `${m.toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export function TimelinePanel() {
  const pid = useLibraryProject();
  const [clips, setClips] = useState<Clip[]>([]);
  const [playing, setPlaying] = useState(false);
  const [playhead, setPlayhead] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [exportPct, setExportPct] = useState(0);
  const [activeHtmlClip, setActiveHtmlClip] = useState<Clip | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const rafRef = useRef<number | null>(null);
  const audiosRef = useRef<HTMLAudioElement[]>([]);
  const timersRef = useRef<number[]>([]);
  const clipsRef = useRef<Clip[]>([]);
  const htmlOverlayRef = useRef<HTMLIFrameElement>(null);
  const prerenderedRef = useRef<Map<string, string>>(new Map());
  const htmlVideoElsRef = useRef<Map<string, HTMLVideoElement>>(new Map());
  clipsRef.current = clips;

  // --------------- load + subscribe clips ---------------
  useEffect(() => {
    if (!pid) return;
    const projectId = pid;
    let alive = true;
    async function load() {
      const { data } = await supabase
        .from("timeline_clips")
        .select("id, track, start_ms, duration_ms, asset_id, assets(kind, url, prompt)")
        .eq("project_id", projectId)
        .order("track")
        .order("start_ms");
      if (alive) setClips((data ?? []) as unknown as Clip[]);
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
      if (c.assets?.kind === "image" && url && !imgCacheRef.current.has(url)) {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.src = url;
        imgCacheRef.current.set(url, img);
      }
    }
  }, [clips]);

  // --------------- HTML overlay effect (preview) ---------------
  const currentHtmlUrlRef = useRef<string | null>(null);
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

    fetch(url)
      .then((r) => r.text())
      .then((html) => {
        const iframe = htmlOverlayRef.current;
        if (iframe) {
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

      // Draw video / image clips
      const vlist = clipsRef.current
        .filter((c) => c.track === "Video" && ms >= c.start_ms && ms < c.start_ms + c.duration_ms)
        .sort((a, b) => b.start_ms - a.start_ms);
      const active = vlist[0];
      if (active?.assets?.kind === "image" && active.assets.url) {
        const img = imgCacheRef.current.get(active.assets.url);
        if (img && img.complete && img.naturalWidth) {
          const iw = img.naturalWidth, ih = img.naturalHeight;
          const cw = canvas.width, ch = canvas.height;
          const scale = Math.min(cw / iw, ch / ih);
          const w = iw * scale, h = ih * scale;
          ctx.drawImage(img, (cw - w) / 2, (ch - h) / 2, w, h);
        }
      }

      // Draw pre-rendered HTML video (during export)
      if (active?.assets?.kind === "html" && htmlVideoMap) {
        const vidUrl = htmlVideoMap.get(active.id);
        if (vidUrl) {
          let ve = htmlVideoElsRef.current.get(active.id);
          if (!ve) {
            ve = document.createElement("video");
            ve.src = vidUrl;
            ve.preload = "auto";
            ve.muted = true;
            htmlVideoElsRef.current.set(active.id, ve);
          }
          const offset = ms - active.start_ms;
          const frames = Math.ceil(active.duration_ms / 33.33);
          const frameDuration = active.duration_ms / frames;
          const frame = Math.min(frames - 1, Math.floor(offset / frameDuration));
          ve.currentTime = frame * (frameDuration / 1000);

          const cw = canvas.width, ch = canvas.height;
          ctx.drawImage(ve, (cw - 1280) / 2, (ch - 720) / 2, 1280, 720);
        }
      }

      // Subtitles
      const sub = clipsRef.current.find(
        (c) => c.track === "Subtitles" && ms >= c.start_ms && ms < c.start_ms + c.duration_ms,
      );
      if (sub?.assets?.prompt) {
        ctx.fillStyle = "rgba(0,0,0,0.55)";
        ctx.font = "28px system-ui, sans-serif";
        const text = sub.assets.prompt.slice(0, 120);
        const tw = ctx.measureText(text).width;
        ctx.fillRect((canvas.width - tw) / 2 - 12, canvas.height - 70, tw + 24, 44);
        ctx.fillStyle = "#fff";
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";
        ctx.fillText(text, canvas.width / 2, canvas.height - 34);
      }
    },
    [],
  );

  useEffect(() => {
    draw(playhead);
  }, [playhead, clips, draw]);

  // --------------- playback controls ---------------
  const stopAudios = useCallback(() => {
    audiosRef.current.forEach((a) => { try { a.pause(); } catch { /* noop */ } });
    audiosRef.current = [];
    timersRef.current.forEach((t) => clearTimeout(t));
    timersRef.current = [];
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
      if (!AUDIO_TRACKS.has(c.track) || !c.assets?.url) continue;
      const a = new Audio(c.assets.url);
      a.crossOrigin = "anonymous";
      const offset = (startFrom - c.start_ms) / 1000;
      if (startFrom >= c.start_ms && startFrom < c.start_ms + c.duration_ms) {
        a.currentTime = Math.max(0, offset);
        a.play().catch(() => {});
        audiosRef.current.push(a);
      } else if (startFrom < c.start_ms) {
        const t = window.setTimeout(() => a.play().catch(() => {}), c.start_ms - startFrom);
        timersRef.current.push(t);
        audiosRef.current.push(a);
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
  async function prerenderHtmlClip(clip: Clip): Promise<string | null> {
    const url = clip.assets?.url;
    if (!url) return null;

    try {
      const html = await fetch(url).then((r) => r.text());

      const iframe = document.createElement("iframe");
      iframe.style.cssText = "position:absolute;left:-9999px;width:1280px;height:720px;border:none";
      document.body.appendChild(iframe);

      return new Promise((resolve) => {
        iframe.onload = async () => {
          try {
            const offscreen = document.createElement("canvas");
            offscreen.width = 1280;
            offscreen.height = 720;
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
                const targetMs = frame * 33.33;
                const elapsed = performance.now() - loopStart;
                if (targetMs > elapsed) await sleep(targetMs - elapsed);

                try {
                  const captured = await html2canvas(iframe.contentDocument!.body, {
                    width: 1280,
                    height: 720,
                    scale: 1,
                    useCORS: true,
                  });
                  octx.clearRect(0, 0, 1280, 720);
                  octx.drawImage(captured, 0, 0, 1280, 720);
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
        (c) => AUDIO_TRACKS.has(c.track) && c.assets?.url,
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
        const src = ac.createBufferSource();
        src.buffer = item.audio;
        src.connect(dest);
        src.start(startAt + item.c.start_ms / 1000);
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
      const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 6_000_000 });
      const chunks: BlobPart[] = [];
      rec.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);
      const done = new Promise<Blob>((res) => {
        rec.onstop = () => res(new Blob(chunks, { type: containerMime }));
      });
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

      await new Promise<void>((res) => {
        function loop() {
          const p = performance.now() - startedAt;
          setPlayhead(Math.min(totalMs, p));
          setExportPct(Math.min(1, p / totalMs));
          draw(p, prerenderedRef.current);
          if (p >= totalMs) return res();
          requestAnimationFrame(loop);
        }
        loop();
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

  const PX_PER_MS = 0.08;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[var(--surface-1)] text-xs text-[var(--text-muted)]">
      {/* Preview */}
      <div className="relative flex min-h-0 flex-1 items-center justify-center bg-black">
        <canvas
          ref={canvasRef}
          width={1280}
          height={720}
          className="max-h-full max-w-full"
          style={{ aspectRatio: "16 / 9" }}
        />
        {activeHtmlClip && (
          <iframe
            ref={htmlOverlayRef}
            className="pointer-events-none absolute z-10"
            style={{ aspectRatio: "16 / 9", width: "100%", maxHeight: "100%" }}
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
            {TRACKS.map((t) => (
              <div
                key={t}
                className="flex h-12 items-center rounded bg-[var(--surface-2)] px-2 text-[10px] uppercase tracking-widest text-[var(--text-dim)]"
              >
                {t}
              </div>
            ))}
          </div>
          <div className="relative flex-1" style={{ minWidth: totalMs * PX_PER_MS }}>
            <div className="space-y-1">
              {TRACKS.map((t) => {
                const rowClips = clips.filter((c) => c.track === t);
                return (
                  <div key={t} className="relative h-12 rounded bg-[var(--surface-2)]">
                    {rowClips.map((c) => (
                      <div
                        key={c.id}
                        className="absolute top-1 h-10 overflow-hidden rounded border border-[var(--accent)]/40 bg-[var(--surface-3)] text-[10px]"
                        style={{
                          left: c.start_ms * PX_PER_MS,
                          width: Math.max(20, c.duration_ms * PX_PER_MS),
                        }}
                        title={c.assets?.prompt ?? ""}
                      >
                        {c.assets?.kind === "image" && c.assets.url ? (
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
                      </div>
                    ))}
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
