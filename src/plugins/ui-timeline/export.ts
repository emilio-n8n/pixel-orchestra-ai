/**
 * Timeline export engine — WS4 Export & Render.
 *
 * Plugin-first: the panel (`TimelinePanel.tsx`) stays thin (state + refs +
 * transport UI) and every export decision lives here.
 *
 * PREVIEW → FILE PARITY, by construction. The preview loop and the file
 * encode share the same single sources:
 * - canvas layout .............. logical 1920×1080 space (the preview canvas
 *                                may use a ×dpr HiDPI backing store; the file
 *                                is always exactly EXPORT_W×H — same geometry)
 * - volume envelope .............. volAt (fades × ducking, § below)
 * - video dissolves .............. dissolveMix (overlap blend)
 * - fade to/from black ........... blackFadeAlpha (transition_in/out_ms)
 * - subtitle box ................. subtitleLayout (font/size/color/position)
 * - HTML card timing ............. htmlFrameIndex + the deterministic
 *                                  prerender schedule (clip-local wall clock
 *                                  restarted at activation, see
 *                                  prerenderHtmlClip). The live preview
 *                                  iframe reloads its srcdoc at the same
 *                                  activation point, so both advance from
 *                                  the same origin at the same rate.
 *
 * Failure paths throw ExportError (FR copy from `lib/ui/labels.ts`) —
 * media is never silently skipped. All blob URLs, video elements,
 * iframes and AudioContexts are released in `finally` blocks.
 */

import {
  clipFades,
  clipTransitions,
  formatSubtitleText,
  resolveSubtitleStyle,
  type TimelineClip,
} from "./store";
import { duckGainAt } from "@/lib/director/ducking";
import { exportErrorMessage, type ExportPhase } from "@/lib/ui/labels";

/* ---------------- constants (single source for preview + file) ---------------- */

export const EXPORT_WIDTH = 1920;
export const EXPORT_HEIGHT = 1080;
export const EXPORT_FPS = 30;
/** Timeline step per encoded frame (≈33.33ms). */
export const FRAME_MS = 1000 / EXPORT_FPS;
/**
 * Audio graphs start 150ms after the recorder: lets the canvas
 * captureStream attach so the head of the file is never chopped.
 * Verified constant — preview and file both honour it.
 */
export const AUDIO_LEAD_S = 0.15;
export const VIDEO_BITS_PER_SECOND = 3_000_000;
export const AUDIO_BITS_PER_SECOND = 128_000;
/** Gain envelope resolution — matches the ducking curve step (25ms). */
export const ENVELOPE_STEP_MS = 25;

const TRACKS_REQUIRING_URL = new Set(["Video", "Audio", "Music", "SFX"]);

const MIME_CANDIDATES = [
  "video/mp4;codecs=avc1,mp4a",
  "video/mp4",
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
];

/* ---------------- pure helpers (unit-tested, no DOM) ---------------- */

/**
 * Asset urls come from Supabase storage. If a signed url failed at creation
 * time a relative filename can leak into the table; loading it against the
 * app origin 500s. Only ever load absolute http(s) urls.
 */
export function isHttpUrl(url: string | null | undefined): url is string {
  return typeof url === "string" && /^https?:\/\//i.test(url);
}

/** mm:ss readout for playheads and FR error details. */
export function formatTimeMs(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  return `${m.toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;
}

/** Short FR-safe clip designation for error details, e.g. "Audio à 00:04". */
export function clipLabel(clip: TimelineClip): string {
  return `${clip.track} à ${formatTimeMs(clip.start_ms)}`;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/**
 * Combined volume envelope of a clip at absolute time `absMs`:
 * fade-in/out (clipFades) × ducking gain (meta.ducking.curve).
 * THE single source used by the preview loop and the export envelope.
 */
export function volAt(clip: TimelineClip, absMs: number): number {
  const local = absMs - clip.start_ms;
  if (local < 0 || local > clip.duration_ms) return 0;
  let v = 1;
  const { fadeInMs, fadeOutMs } = clipFades(clip);
  if (fadeInMs > 0 && local < fadeInMs) v *= local / fadeInMs;
  const untilEnd = clip.duration_ms - local;
  if (fadeOutMs > 0 && untilEnd < fadeOutMs) v *= Math.max(0, untilEnd / fadeOutMs);
  const ducking = (clip.meta?.ducking ?? null) as {
    curve?: Array<{ t_ms: number; gain: number }>;
  } | null;
  if (ducking?.curve) v *= duckGainAt(ducking.curve, absMs);
  return clamp01(v);
}

/**
 * Gain envelope sampled every ENVELOPE_STEP_MS over the audible span of a
 * decoded buffer. Truncated buffers cut at the clip duration (a trimmed
 * clip never drags a silent tail); buffers shorter than the clip cover
 * their own length and the rest stays silent — exactly like the preview,
 * where the <audio> element ends and volAt returns 0 past the clip end.
 */
export function envelopeForClip(clip: TimelineClip, bufferDurationMs: number): number[] {
  const audibleMs = Math.max(0, Math.min(clip.duration_ms, bufferDurationMs));
  const gains: number[] = [];
  for (let t = 0; t <= audibleMs; t += ENVELOPE_STEP_MS) {
    gains.push(volAt(clip, clip.start_ms + Math.min(t, audibleMs)));
  }
  return gains;
}

/**
 * Dissolve blend while two Video clips overlap (B pulled over A's tail via
 * set_clip_transitions). Returns per-clip alphas at absolute time `ms`.
 */
export function dissolveMix(
  ms: number,
  aStartMs: number,
  aDurationMs: number,
  bStartMs: number,
): { alphaA: number; alphaB: number } {
  const span = aStartMs + aDurationMs - bStartMs;
  const prog = span > 0 ? (ms - bStartMs) / span : 1;
  const p = clamp01(prog);
  return { alphaA: 1 - p, alphaB: p };
}

/** Fade to/from black for a lone clip (transition_in/out_ms). */
export function blackFadeAlpha(ms: number, clip: TimelineClip): number {
  const local = ms - clip.start_ms;
  const { inMs, outMs } = clipTransitions(clip);
  let a = 0;
  if (inMs > 0 && local < inMs) a = Math.max(a, 1 - local / inMs);
  const untilEnd = clip.start_ms + clip.duration_ms - ms;
  if (outMs > 0 && untilEnd < outMs) a = Math.max(a, untilEnd / outMs);
  return clamp01(a);
}

export interface SubtitleLayout {
  text: string;
  font: string;
  color: string;
  box: { x: number; y: number; w: number; h: number };
  textPos: { x: number; y: number };
}

/**
 * Subtitle box geometry — THE single source for the canvas subtitle
 * (font/size/color/position). Style defaults and the 120-char clamp come
 * from the store helpers shared with the Inspector, and the renderer
 * passes ctx.measureText as `measure`, so Inspector, preview and file
 * compute identical boxes.
 */
export function subtitleLayout(
  clip: TimelineClip,
  canvasW: number,
  canvasH: number,
  measure: (font: string, text: string) => number,
): SubtitleLayout | null {
  const rawText = (clip.meta?.text as string | undefined) ?? clip.assets?.prompt;
  if (!rawText) return null;
  const style = resolveSubtitleStyle(clip.meta);
  const text = formatSubtitleText(rawText);
  const font = `${style.size}px ${style.font}`;
  const tw = measure(font, text);
  const boxH = style.size + 16;
  const y =
    style.position === "top"
      ? 70
      : style.position === "center"
        ? canvasH / 2 - boxH / 2
        : canvasH - 70 - boxH;
  return {
    text,
    font,
    color: style.color,
    box: { x: (canvasW - tw) / 2 - 12, y, w: tw + 24, h: boxH },
    textPos: { x: canvasW / 2, y: y + boxH - 8 },
  };
}

/** Frame count for an HTML card of `durationMs` at EXPORT_FPS. */
export function htmlFrameCount(durationMs: number): number {
  return Math.max(1, Math.ceil(durationMs / FRAME_MS));
}

/**
 * Unified HTML timing source: clip-local offset → deterministic frame
 * index. The prerender captures frame i at clip-local t = i·FRAME_MS and
 * the encode maps playback offset through this same function, so the card
 * motion in the file matches the preview activation origin frame by frame.
 */
export function htmlFrameIndex(offsetMs: number, durationMs: number): number {
  const frames = htmlFrameCount(durationMs);
  const frameDuration = durationMs / frames;
  return Math.min(frames - 1, Math.max(0, Math.floor(offsetMs / frameDuration)));
}

export interface PickedMime {
  mime: string;
  container: "video/mp4" | "video/webm";
  ext: "mp4" | "webm";
}

/**
 * MP4-first negotiation. The extension always matches the container, so
 * files open in VLC + Chrome + mobile without a rename.
 */
export function pickExportMime(isSupported: (m: string) => boolean): PickedMime {
  const mime = MIME_CANDIDATES.find(isSupported) ?? "video/webm";
  return mime.startsWith("video/mp4")
    ? { mime, container: "video/mp4", ext: "mp4" }
    : { mime, container: "video/webm", ext: "webm" };
}

export interface ExportProgress {
  phase: ExportPhase;
  done: number;
  total: number;
}

/** Overall 0..1 fraction across phases (weights: prerender .3 / audio .1 / encode .55 / finalize .05). */
export function progressFraction(p: ExportProgress): number {
  const sub = p.total > 0 ? clamp01(p.done / p.total) : 0;
  switch (p.phase) {
    case "prerender":
      return 0.3 * sub;
    case "audio":
      return 0.3 + 0.1 * sub;
    case "encode":
      return 0.4 + 0.55 * sub;
    case "finalize":
      return 0.95 + 0.05 * sub;
  }
}

/* ---------------- errors (FR, never silent) ---------------- */

export type ExportErrorCode =
  | "no-clips"
  | "relative-url"
  | "fetch-failed"
  | "decode-failed"
  | "prerender-failed"
  | "recorder-unsupported"
  | "cancelled"
  | "unexpected";

export class ExportError extends Error {
  code: ExportErrorCode;
  constructor(code: ExportErrorCode, detail?: string) {
    super(exportErrorMessage(code, detail));
    this.name = "ExportError";
    this.code = code;
  }
}

export function throwIfCancelled(signal?: AbortSignal): void {
  if (signal?.aborted) throw new ExportError("cancelled");
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Dedicated offscreen 1920×1080 encode canvas (never the live preview). */
function makeExportCanvas(): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = EXPORT_WIDTH;
  canvas.height = EXPORT_HEIGHT;
  return canvas;
}

/* ---------------- canvas renderer (preview + file share it) ---------------- */

export interface RenderFrameOpts {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  clips: TimelineClip[];
  ms: number;
  getImage: (url: string) => HTMLImageElement | undefined;
  /** Absent in preview (the live iframe overlay shows the card instead). */
  htmlVideoMap?: Map<string, string>;
  /** Optional: only touched when htmlVideoMap is present (export). */
  htmlVideoEls?: Map<string, HTMLVideoElement>;
}

export function renderTimelineFrame(opts: RenderFrameOpts): void {
  const { ctx, width, height, clips, ms, getImage, htmlVideoMap } = opts;
  const htmlVideoEls = opts.htmlVideoEls ?? new Map<string, HTMLVideoElement>();

  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, width, height);

  // Video / image / HTML clips — dissolve while two overlap on Video.
  const activeVideos = clips
    .filter((c) => c.track === "Video" && ms >= c.start_ms && ms < c.start_ms + c.duration_ms)
    .sort((a, b) => a.start_ms - b.start_ms);

  const drawV = (c: TimelineClip, alpha: number) => {
    ctx.save();
    if (alpha < 1) ctx.globalAlpha = clamp01(alpha);
    if (c.assets?.kind === "image" && c.assets.url) {
      const img = getImage(c.assets.url);
      if (img && img.complete && img.naturalWidth) {
        const iw = img.naturalWidth;
        const ih = img.naturalHeight;
        const scale = Math.min(width / iw, height / ih);
        const w = iw * scale;
        const h = ih * scale;
        ctx.drawImage(img, (width - w) / 2, (height - h) / 2, w, h);
      }
    } else if (c.assets?.kind === "html" && htmlVideoMap) {
      const vidUrl = htmlVideoMap.get(c.id);
      if (vidUrl) {
        let ve = htmlVideoEls.get(c.id);
        if (!ve) {
          ve = document.createElement("video");
          ve.src = vidUrl;
          ve.preload = "auto";
          ve.muted = true;
          htmlVideoEls.set(c.id, ve);
        }
        if (ve.readyState >= 2) ctx.drawImage(ve, 0, 0, width, height);
      }
    }
    ctx.restore();
  };

  if (activeVideos.length >= 2) {
    const a = activeVideos[activeVideos.length - 2];
    const b = activeVideos[activeVideos.length - 1];
    const { alphaA, alphaB } = dissolveMix(ms, a.start_ms, a.duration_ms, b.start_ms);
    drawV(a, alphaA);
    drawV(b, alphaB);
  } else if (activeVideos.length === 1) {
    const c = activeVideos[0];
    drawV(c, 1);
    const blackAlpha = blackFadeAlpha(ms, c);
    if (blackAlpha > 0) {
      ctx.fillStyle = `rgba(0,0,0,${blackAlpha})`;
      ctx.fillRect(0, 0, width, height);
    }
  }

  // Subtitles — geometry from the shared subtitleLayout source.
  const sub = clips.find(
    (c) => c.track === "Subtitles" && ms >= c.start_ms && ms < c.start_ms + c.duration_ms,
  );
  if (sub) {
    const layout = subtitleLayout(sub, width, height, (font, text) => {
      ctx.font = font;
      return ctx.measureText(text).width;
    });
    if (layout) {
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(layout.box.x, layout.box.y, layout.box.w, layout.box.h);
      ctx.fillStyle = layout.color;
      ctx.textAlign = "center";
      // "alphabetic" — matches the preview canvas exactly (same renderer).
      ctx.textBaseline = "alphabetic";
      ctx.fillText(layout.text, layout.textPos.x, layout.textPos.y);
    }
  }
}

/* ---------------- HTML pre-render (deterministic timing) ---------------- */

export interface PrerenderOpts {
  signal?: AbortSignal;
  onFrame?: (done: number, total: number) => void;
}

/**
 * Pre-render an HTML card to a WebM blob URL at EXPORT_W×H / EXPORT_FPS.
 *
 * Deterministic timing: after a warm load (fonts/cache), the document is
 * restarted and every Web Animation is paused, then frame i is captured
 * with all animations seeking to clip-local t = i·FRAME_MS. Capture
 * overruns skip ahead on the wall-clock schedule so the resulting video
 * lasts exactly `durationMs` — the encode then plays it back in realtime
 * from the clip activation, the same origin the preview iframe reloads
 * from. Card motion in the file mirrors the preview instead of drifting
 * with capture speed.
 *
 * Throws ExportError (FR) on any failure — a card is never silently
 * dropped from the file. The hidden iframe is always removed.
 */
export async function prerenderHtmlClip(clip: TimelineClip, opts?: PrerenderOpts): Promise<string> {
  const label = clipLabel(clip);
  const url = clip.assets?.url;
  if (!isHttpUrl(url)) throw new ExportError("relative-url", `carte ${label}`);

  let html: string;
  try {
    const res = await fetch(url, { signal: opts?.signal });
    if (!res.ok) throw new Error(`http ${res.status}`);
    html = await res.text();
  } catch (e) {
    throwIfCancelled(opts?.signal);
    if (e instanceof ExportError) throw e;
    throw new ExportError("fetch-failed", `carte ${label}`);
  }

  const iframe = document.createElement("iframe");
  iframe.style.cssText = `position:absolute;left:-9999px;width:${EXPORT_WIDTH}px;height:${EXPORT_HEIGHT}px;border:none`;
  document.body.appendChild(iframe);

  try {
    throwIfCancelled(opts?.signal);
    // Warm load (fonts, sub-resources), then restart so animations run
    // from t=0 at capture start — the same origin as the preview reload.
    await loadSrcdoc(iframe, html);
    throwIfCancelled(opts?.signal);
    await loadSrcdoc(iframe, html);
    throwIfCancelled(opts?.signal);

    const doc = iframe.contentDocument;
    const body = doc?.body;
    if (!body) throw new ExportError("prerender-failed", `carte ${label}`);

    // Pause every Web Animation (CSS keyframes + transitions are all
    // Animation objects) so each frame seeks deterministically. Cards
    // without WAAPI support fall back to wall-clock capture.
    let animations: Animation[] = [];
    try {
      const all = doc.getAnimations();
      for (const a of all) {
        try {
          a.pause();
        } catch {
          /* keep the animation running */
        }
      }
      animations = all;
    } catch {
      animations = [];
    }

    const offscreen = document.createElement("canvas");
    offscreen.width = EXPORT_WIDTH;
    offscreen.height = EXPORT_HEIGHT;
    const octx = offscreen.getContext("2d");
    if (!octx) throw new ExportError("prerender-failed", `carte ${label}`);
    // Lazy: unit tests of the pure helpers never load browser-only code.
    const { default: html2canvas } = await import("html2canvas");

    const stream = offscreen.captureStream(EXPORT_FPS);
    const recMime =
      typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
        ? "video/webm;codecs=vp9"
        : "video/webm";
    const rec = new MediaRecorder(stream, { mimeType: recMime });
    const chunks: BlobPart[] = [];
    rec.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    const stopped = new Promise<void>((res) => {
      rec.onstop = () => res();
    });
    rec.start();

    const totalFrames = htmlFrameCount(clip.duration_ms);
    const safetyTimeout = setTimeout(() => {
      try {
        if (rec.state !== "inactive") rec.stop();
      } catch {
        /* recorder already gone */
      }
    }, clip.duration_ms + 10_000);

    try {
      const t0 = performance.now();
      for (let frame = 0; frame < totalFrames; frame++) {
        throwIfCancelled(opts?.signal);
        // Stay on the wall-clock schedule under overrun: the video must
        // last exactly durationMs for realtime playback to stay in sync.
        const scheduled = Math.floor((performance.now() - t0) / FRAME_MS);
        if (scheduled > frame) frame = Math.min(scheduled, totalFrames - 1);
        const t = frame * FRAME_MS;
        for (const a of animations) {
          try {
            a.currentTime = t;
          } catch {
            /* animation ignores seeks */
          }
        }
        try {
          // Let a seeked frame paint before capturing it.
          await new Promise((r) => requestAnimationFrame(r));
          const captured = await html2canvas(body, {
            width: EXPORT_WIDTH,
            height: EXPORT_HEIGHT,
            scale: 1,
            useCORS: true,
          });
          octx.clearRect(0, 0, EXPORT_WIDTH, EXPORT_HEIGHT);
          octx.drawImage(captured, 0, 0, EXPORT_WIDTH, EXPORT_HEIGHT);
        } catch {
          /* dropped frame — keep the previous one */
        }
        opts?.onFrame?.(frame + 1, totalFrames);
        const target = t0 + (frame + 1) * FRAME_MS;
        const wait = target - performance.now();
        if (wait > 0) await sleep(wait);
      }
    } finally {
      clearTimeout(safetyTimeout);
      try {
        if (rec.state !== "inactive") rec.stop();
      } catch {
        /* already stopped */
      }
      await stopped;
      stream.getTracks().forEach((t) => {
        try {
          t.stop();
        } catch {
          /* noop */
        }
      });
    }

    return URL.createObjectURL(new Blob(chunks, { type: "video/webm" }));
  } catch (e) {
    throwIfCancelled(opts?.signal);
    if (e instanceof ExportError) throw e;
    throw new ExportError("prerender-failed", `carte ${label}`);
  } finally {
    iframe.remove();
  }
}

function loadSrcdoc(iframe: HTMLIFrameElement, html: string, timeoutMs = 15_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("iframe load timeout")), timeoutMs);
    iframe.onload = () => {
      clearTimeout(timer);
      resolve();
    };
    iframe.onerror = () => {
      clearTimeout(timer);
      reject(new Error("iframe load error"));
    };
    iframe.srcdoc = html;
  });
}

/* ---------------- full export orchestration ---------------- */

export interface RunExportOpts {
  /**
   * Capture canvas. When omitted the engine encodes on a dedicated
   * offscreen 1920×1080 canvas (deterministic file, preview untouched).
   * Callers that pass one must provide a dedicated 1920×1080 canvas —
   * never the live preview canvas (HiDPI backing stores would shift the
   * file layout and the encode would flash the preview).
   */
  canvas?: HTMLCanvasElement;
  clips: TimelineClip[];
  totalMs: number;
  getImage: (url: string) => HTMLImageElement | undefined;
  signal?: AbortSignal;
  onProgress?: (p: ExportProgress) => void;
}

export interface RunExportResult {
  blob: Blob;
  ext: "mp4" | "webm";
  mime: string;
}

/**
 * Export the timeline to an MP4-first file.
 *
 * Phases (reported via onProgress, FR labels live in labels.ts):
 *  1. prerender — HTML cards → WebM blob URLs (x/y per card)
 *  2. audio .... — decode + schedule the WebAudio graph (volAt envelope)
 *  3. encode ... — realtime-paced canvas capture (n% of frames)
 *  4. finalize . — stop the recorder, build the blob
 *
 * The encode loop advances on the wall clock (performance.now), exactly
 * like the preview tick — never frame-counted per rAF, so the file plays
 * at 1× on 60Hz and 120Hz displays alike. HTML card videos restart
 * (seek 0 + play) at clip activation, mirroring the preview iframe
 * reload. Cancellable via `signal`; every resource is released in
 * `finally`, including on cancel and on failure.
 */
export async function runExport(opts: RunExportOpts): Promise<RunExportResult> {
  const { clips, totalMs, getImage, signal, onProgress } = opts;
  if (clips.length === 0) throw new ExportError("no-clips");
  if (typeof MediaRecorder === "undefined") throw new ExportError("recorder-unsupported");

  // Upfront URL validation: silence clips are mute by design and
  // subtitles carry their text in meta — everything else needs a signed
  // http(s) URL, otherwise the file would silently drop media.
  for (const c of clips) {
    if (c.meta?.silence === true || c.track === "Subtitles") continue;
    if (!TRACKS_REQUIRING_URL.has(c.track)) continue;
    if (!isHttpUrl(c.assets?.url)) throw new ExportError("relative-url", clipLabel(c));
  }
  throwIfCancelled(signal);

  const prerendered = new Map<string, string>();
  const htmlVideoEls = new Map<string, HTMLVideoElement>();
  let ac: AudioContext | null = null;
  let stream: MediaStream | null = null;

  const cleanup = () => {
    prerendered.forEach((u) => {
      try {
        URL.revokeObjectURL(u);
      } catch {
        /* noop */
      }
    });
    prerendered.clear();
    htmlVideoEls.forEach((ve) => {
      try {
        ve.pause();
      } catch {
        /* noop */
      }
      ve.removeAttribute("src");
      ve.remove();
    });
    htmlVideoEls.clear();
  };

  try {
    // ---- phase 1: pre-render HTML cards ----
    const htmlClips = clips.filter((c) => c.assets?.kind === "html");
    onProgress?.({ phase: "prerender", done: 0, total: htmlClips.length });
    for (let i = 0; i < htmlClips.length; i++) {
      throwIfCancelled(signal);
      const clip = htmlClips[i];
      const blobUrl = await prerenderHtmlClip(clip, {
        signal,
        onFrame: (done, total) => {
          // Per-card frame progress rolls into the phase fraction.
          onProgress?.({
            phase: "prerender",
            done: i + done / Math.max(1, total),
            total: Math.max(1, htmlClips.length),
          });
        },
      });
      prerendered.set(clip.id, blobUrl);
      onProgress?.({ phase: "prerender", done: i + 1, total: htmlClips.length });
    }

    // ---- phase 2: audio graph (volAt envelope, truncated buffers) ----
    onProgress?.({ phase: "audio", done: 0, total: 1 });
    // Dedicated offscreen canvas by default: the file is always exactly
    // 1920×1080 regardless of the preview canvas backing store (HiDPI
    // ×dpr), and the preview never flashes while the file encodes.
    const canvas = opts.canvas ?? makeExportCanvas();
    stream = canvas.captureStream(EXPORT_FPS);
    const AC: typeof AudioContext =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ac = new AC();
    if (ac.state === "suspended") await ac.resume();
    const dest = ac.createMediaStreamDestination();

    const audioClips = clips.filter(
      (c) =>
        (c.track === "Audio" || c.track === "Music" || c.track === "SFX") && isHttpUrl(c.assets?.url),
    );
    const decoded = await Promise.all(
      audioClips.map(async (c) => {
        throwIfCancelled(signal);
        try {
          const res = await fetch(c.assets!.url, { signal });
          if (!res.ok) throw new Error(`http ${res.status}`);
          const buf = await res.arrayBuffer();
          const audio = await ac!.decodeAudioData(buf);
          return { c, audio };
        } catch (e) {
          throwIfCancelled(signal);
          if (e instanceof ExportError) throw e;
          const label = clipLabel(c);
          throw new ExportError(
            e instanceof Error && /decode|encode/i.test(e.message) ? "decode-failed" : "fetch-failed",
            label,
          );
        }
      }),
    );
    // +0.15s: the captureStream needs a head start so the file head is
    // never chopped (AUDIO_LEAD_S, verified).
    const startAt = ac.currentTime + AUDIO_LEAD_S;
    for (const item of decoded) {
      const c = item.c;
      const src = ac.createBufferSource();
      src.buffer = item.audio;
      const gain = ac.createGain();
      // Envelope: fade-in/out × ducking, sampled at ENVELOPE_STEP_MS.
      // Truncated buffers stop at the clip end — no silent tail.
      const gains = envelopeForClip(c, item.audio.duration * 1000);
      const audibleMs = Math.max(0, Math.min(c.duration_ms, item.audio.duration * 1000));
      const t0 = startAt + c.start_ms / 1000;
      gains.forEach((v, i) => {
        const at = t0 + Math.min(i * ENVELOPE_STEP_MS, audibleMs) / 1000;
        if (i === 0) gain.gain.setValueAtTime(v, at);
        else gain.gain.linearRampToValueAtTime(v, at);
      });
      src.connect(gain);
      gain.connect(dest);
      src.start(t0);
      src.stop(t0 + audibleMs / 1000);
    }
    dest.stream.getAudioTracks().forEach((t) => stream!.addTrack(t));
    onProgress?.({ phase: "audio", done: 1, total: 1 });

    // ---- mime negotiation (MP4 first, extension always matches) ----
    const picked = pickExportMime((m) => MediaRecorder.isTypeSupported(m));
    const rec = new MediaRecorder(stream, {
      mimeType: picked.mime,
      videoBitsPerSecond: VIDEO_BITS_PER_SECOND,
      audioBitsPerSecond: AUDIO_BITS_PER_SECOND,
    });
    const chunks: BlobPart[] = [];
    rec.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    const done = new Promise<Blob>((res) => {
      rec.onstop = () => res(new Blob(chunks, { type: picked.container }));
    });

    // Pre-create (preloaded) video elements for the pre-rendered cards.
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new ExportError("unexpected", "canvas 2d indisponible");
    for (const [clipId, blobUrl] of prerendered) {
      const ve = document.createElement("video");
      ve.src = blobUrl;
      ve.preload = "auto";
      ve.muted = true;
      (ve as HTMLVideoElement & { playsInline?: boolean }).playsInline = true;
      ve.style.display = "none";
      document.body.appendChild(ve);
      htmlVideoEls.set(clipId, ve);
    }

    // ---- phase 3: realtime-paced encode ----
    const totalFrames = Math.max(1, Math.ceil(totalMs / FRAME_MS));
    const render = (p: number) =>
      renderTimelineFrame({
        ctx,
        width: canvas.width,
        height: canvas.height,
        clips,
        ms: p,
        getImage,
        htmlVideoMap: prerendered,
        htmlVideoEls,
      });
    render(0);
    rec.start(100);
    const startedAt = performance.now();
    let activeHtmlId: string | null = null;

    await new Promise<void>((resolve, reject) => {
      const onAbort = () => reject(new ExportError("cancelled"));
      if (signal?.aborted) return onAbort();
      signal?.addEventListener("abort", onAbort, { once: true });
      const tick = () => {
        if (signal?.aborted) {
          signal.removeEventListener("abort", onAbort);
          return reject(new ExportError("cancelled"));
        }
        const p = Math.min(totalMs, performance.now() - startedAt);
        // Restart card videos at clip activation — mirrors the preview
        // iframe srcdoc reload at the same point.
        const active =
          clips.find(
            (c) => c.assets?.kind === "html" && p >= c.start_ms && p < c.start_ms + c.duration_ms,
          ) ?? null;
        const activeId = active ? active.id : null;
        if (activeId !== activeHtmlId) {
          const prev = activeHtmlId ? htmlVideoEls.get(activeHtmlId) : undefined;
          if (prev) {
            try {
              prev.pause();
            } catch {
              /* noop */
            }
          }
          activeHtmlId = activeId;
          if (activeId) {
            const ve = htmlVideoEls.get(activeId);
            if (ve) {
              try {
                ve.currentTime = 0;
                void ve.play().catch(() => {});
              } catch {
                /* first frames stay black until the video can play */
              }
            }
          }
        }
        render(p);
        onProgress?.({
          phase: "encode",
          done: Math.min(totalFrames, Math.floor(p / FRAME_MS)),
          total: totalFrames,
        });
        if (p >= totalMs) {
          signal?.removeEventListener("abort", onAbort);
          return resolve();
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });

    // ---- phase 4: finalize ----
    onProgress?.({ phase: "finalize", done: 0, total: 1 });
    rec.stop();
    const blob = await done;
    onProgress?.({ phase: "finalize", done: 1, total: 1 });
    return { blob, ext: picked.ext, mime: picked.mime };
  } finally {
    cleanup();
    if (stream) {
      stream.getTracks().forEach((t) => {
        try {
          t.stop();
        } catch {
          /* noop */
        }
      });
    }
    if (ac) {
      try {
        await ac.close();
      } catch {
        /* already closed */
      }
    }
  }
}
