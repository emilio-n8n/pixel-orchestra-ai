/**
 * WS4 Export & Render — parity engine unit tests.
 *
 * Every preview→file parity rule that can be checked without a DOM lives
 * here: volume envelope (fades × ducking, truncated buffers), dissolves,
 * black fades, subtitle geometry, HTML timing, mime negotiation and the
 * FR-only user copy. Run with `bun test`.
 */
import { describe, it, expect } from "bun:test";
import { computeDuckingCurve } from "@/lib/director/ducking";
import { exportErrorMessage, exportFileName, exportPhaseLabel } from "@/lib/ui/labels";
import {
  blackFadeAlpha,
  clipKeyframes,
  clipLabel,
  clipTransform,
  clipTransformAt,
  dissolveMix,
  envelopeForClip,
  ExportError,
  formatTimeMs,
  hasKeyframes,
  htmlFrameCount,
  htmlFrameIndex,
  htmlFrameMs,
  isHttpUrl,
  pickExportMime,
  previewFrameTime,
  progressFraction,
  renderTimelineFrame,
  subtitleLayout,
  throwIfCancelled,
  topmostActiveVideoClip,
  transformRect,
  volAt,
  AUDIO_LEAD_S,
  ENVELOPE_STEP_MS,
  EXPORT_FPS,
  EXPORT_HEIGHT,
  EXPORT_WIDTH,
  FRAME_MS,
  VIDEO_BITS_PER_SECOND,
} from "./export";
import type { TimelineClip } from "./store";

function clip(over: Partial<TimelineClip> = {}): TimelineClip {
  return {
    id: "c1",
    track: "Audio",
    start_ms: 1000,
    duration_ms: 4000,
    asset_id: "a1",
    assets: { kind: "audio", url: "https://cdn.example/voice.mp3", prompt: null },
    meta: {},
    ...over,
  };
}

describe("isHttpUrl", () => {
  it("accepts absolute http(s) urls", () => {
    expect(isHttpUrl("https://cdn.example/a.mp3")).toBe(true);
    expect(isHttpUrl("http://localhost:5432/x")).toBe(true);
  });
  it("rejects relative filename leaks, blanks and nulls", () => {
    expect(isHttpUrl("voice-take-1.mp3")).toBe(false);
    expect(isHttpUrl("/storage/v1/voice.mp3")).toBe(false);
    expect(isHttpUrl("")).toBe(false);
    expect(isHttpUrl(null)).toBe(false);
    expect(isHttpUrl(undefined)).toBe(false);
  });
});

describe("formatTimeMs / clipLabel", () => {
  it("formats mm:ss", () => {
    expect(formatTimeMs(0)).toBe("00:00");
    expect(formatTimeMs(4000)).toBe("00:04");
    expect(formatTimeMs(65000)).toBe("01:05");
  });
  it("designates the clip for FR errors", () => {
    expect(clipLabel(clip())).toBe("Audio à 00:01");
  });
});

describe("volAt — fades × ducking", () => {
  it("is 1 inside a plain clip, 0 outside", () => {
    const c = clip();
    expect(volAt(c, 1000)).toBe(1);
    expect(volAt(c, 3000)).toBe(1);
    expect(volAt(c, 999)).toBe(0);
    expect(volAt(c, 5001)).toBe(0);
  });
  it("ramps fade-in/out linearly", () => {
    const c = clip({ meta: { fade_in_ms: 1000, fade_out_ms: 1000 } });
    expect(volAt(c, 1000)).toBe(0);
    expect(volAt(c, 1500)).toBeCloseTo(0.5, 5);
    expect(volAt(c, 2000)).toBe(1);
    expect(volAt(c, 4500)).toBeCloseTo(0.5, 5);
    expect(volAt(c, 5000)).toBe(0);
  });
  it("multiplies the ducking curve (ducked voice + music)", () => {
    // Voice on Audio [1s, 5s); music ducked under it.
    const curve = computeDuckingCurve({
      sourceIntervals: [{ start_ms: 1000, end_ms: 5000 }],
      totalMs: 10000,
      attenuationDb: -12,
      attackMs: 200,
      releaseMs: 400,
    });
    const duckedGain = Math.pow(10, -12 / 20);
    const music = clip({
      id: "m1",
      track: "Music",
      start_ms: 0,
      duration_ms: 10000,
      meta: { ducking: { source_track: "Audio", curve } },
    });
    // Settled mid-voice: music sits at the ducked floor.
    expect(volAt(music, 3000)).toBeCloseTo(duckedGain, 2);
    // Before the voice: full gain.
    expect(volAt(music, 100)).toBeCloseTo(1, 2);
    // After release: back to full gain.
    expect(volAt(music, 9000)).toBeCloseTo(1, 2);
  });
});

describe("envelopeForClip — truncated buffers", () => {
  it("cuts at the clip duration when the buffer is longer", () => {
    const c = clip({ duration_ms: 2000 });
    const gains = envelopeForClip(c, 8000);
    // The envelope spans the clip only — the engine stops the source at
    // the clip end, so no silent tail drags past it.
    expect(gains.length).toBe(Math.floor(2000 / ENVELOPE_STEP_MS) + 1);
    const spanMs = (gains.length - 1) * ENVELOPE_STEP_MS;
    expect(spanMs).toBeLessThanOrEqual(2000);
    // Inclusive endpoint: gain still holds, then src.stop() cuts.
    expect(gains[gains.length - 1]).toBe(volAt(c, c.start_ms + 2000));
  });
  it("covers the buffer when the file is shorter than the clip", () => {
    const c = clip({ duration_ms: 8000 });
    const gains = envelopeForClip(c, 2000);
    const spanMs = (gains.length - 1) * ENVELOPE_STEP_MS;
    expect(spanMs).toBeLessThanOrEqual(2000);
    // Interior stays audible — the rest is silence, like the preview.
    expect(gains[10]).toBe(1);
  });
  it("honours fades × ducking per sample", () => {
    const curve = computeDuckingCurve({
      sourceIntervals: [{ start_ms: 1000, end_ms: 9000 }],
      totalMs: 10000,
      attenuationDb: -12,
      attackMs: 1,
      releaseMs: 1,
    });
    const c = clip({ meta: { fade_in_ms: 100, ducking: { curve } } });
    const gains = envelopeForClip(c, 4000);
    expect(gains[0]).toBe(0);
    expect(gains[gains.length - 1]).toBe(volAt(c, c.start_ms + 4000));
    expect(Math.max(...gains)).toBeLessThan(1);
  });
});

describe("dissolveMix", () => {
  it("blends 0→1 across the overlap", () => {
    // A [0, 4000), B pulled to 3000 → 1000ms overlap.
    expect(dissolveMix(3000, 0, 4000, 3000)).toEqual({ alphaA: 1, alphaB: 0 });
    const mid = dissolveMix(3500, 0, 4000, 3000);
    expect(mid.alphaA).toBeCloseTo(0.5, 5);
    expect(mid.alphaB).toBeCloseTo(0.5, 5);
    expect(dissolveMix(4000, 0, 4000, 3000)).toEqual({ alphaA: 0, alphaB: 1 });
  });
  it("snaps to B on a degenerate span", () => {
    expect(dissolveMix(1000, 0, 1000, 1000)).toEqual({ alphaA: 0, alphaB: 1 });
  });
});

describe("blackFadeAlpha", () => {
  it("fades from/to black on transition_in/out_ms", () => {
    const c = clip({
      track: "Video",
      start_ms: 0,
      duration_ms: 4000,
      meta: { transition_in_ms: 1000, transition_out_ms: 1000 },
    });
    expect(blackFadeAlpha(0, c)).toBe(1);
    expect(blackFadeAlpha(500, c)).toBeCloseTo(0.5, 5);
    expect(blackFadeAlpha(2000, c)).toBe(0);
    expect(blackFadeAlpha(3500, c)).toBeCloseTo(0.5, 5);
  });
  it("is 0 without transitions", () => {
    expect(blackFadeAlpha(1500, clip({ track: "Video" }))).toBe(0);
  });
});

describe("subtitleLayout", () => {
  const measure = () => 100;
  it("defaults to bottom / 28px / white", () => {
    const c = clip({
      track: "Subtitles",
      assets: { kind: "doc", url: "https://cdn.example/s.vtt", prompt: "Bonjour" },
    });
    const l = subtitleLayout(c, EXPORT_WIDTH, EXPORT_HEIGHT, measure)!;
    expect(l.text).toBe("Bonjour");
    expect(l.lines).toEqual(["Bonjour"]);
    expect(l.font).toBe("28px system-ui, sans-serif");
    expect(l.color).toBe("#ffffff");
    // lineHeight 35 (28×1.25) + 16 padding.
    expect(l.box.y).toBe(EXPORT_HEIGHT - 70 - (Math.round(28 * 1.25) + 16));
    expect(l.textPos.x).toBe(EXPORT_WIDTH / 2);
  });
  it("honours font/size/color/position", () => {
    const c = clip({
      track: "Subtitles",
      assets: null,
      meta: {
        text: "Titre",
        style: { font: "Georgia, serif", size: 48, color: "#ff0", position: "top" },
      },
    });
    const l = subtitleLayout(c, EXPORT_WIDTH, EXPORT_HEIGHT, measure)!;
    expect(l.font).toBe("48px Georgia, serif");
    expect(l.color).toBe("#ff0");
    expect(l.box.y).toBe(70);
  });
  it("centers vertically on center", () => {
    const c = clip({
      track: "Subtitles",
      assets: null,
      meta: { text: "Milieu", style: { position: "center" } },
    });
    const l = subtitleLayout(c, EXPORT_WIDTH, EXPORT_HEIGHT, measure)!;
    const boxH = Math.round(28 * 1.25) + 16;
    expect(l.box.y).toBe(EXPORT_HEIGHT / 2 - boxH / 2);
  });
  it("clamps long texts like the Inspector (shared helper)", () => {
    const c = clip({
      track: "Subtitles",
      assets: null,
      meta: { text: `x`.repeat(200) },
    });
    const l = subtitleLayout(c, EXPORT_WIDTH, EXPORT_HEIGHT, measure)!;
    expect(l.text.length).toBeLessThanOrEqual(120);
    expect(l.text.endsWith("…")).toBe(true);
  });
  it("wraps long sentences to 2 lines inside the frame", () => {
    const words = Array.from({ length: 30 }, (_, i) => `mot${i}`).join(" ");
    const c = clip({
      track: "Subtitles",
      assets: null,
      meta: { text: words },
    });
    const propMeasure = (font: string, text: string) => text.length * 20;
    const l = subtitleLayout(c, EXPORT_WIDTH, EXPORT_HEIGHT, propMeasure)!;
    expect(l.lines.length).toBe(2);
    expect(l.box.x).toBeGreaterThanOrEqual(0);
    expect(l.box.x + l.box.w).toBeLessThanOrEqual(EXPORT_WIDTH);
  });
  it("shrinks the font so unbreakable words stay in frame", () => {
    const c = clip({
      track: "Subtitles",
      assets: null,
      meta: { text: "a".repeat(120) },
    });
    const propMeasure = (font: string, text: string) => {
      const size = Number.parseInt(font, 10) || 28;
      return text.length * size * 0.6;
    };
    const l = subtitleLayout(c, EXPORT_WIDTH, EXPORT_HEIGHT, propMeasure)!;
    expect(Number.parseInt(l.font, 10)).toBeLessThan(28);
    expect(l.box.x).toBeGreaterThanOrEqual(0);
    expect(l.box.x + l.box.w).toBeLessThanOrEqual(EXPORT_WIDTH);
  });
  it("returns null without text", () => {
    expect(
      subtitleLayout(clip({ track: "Subtitles", assets: null, meta: {} }), 1920, 1080, measure),
    ).toBeNull();
  });
});

describe("htmlFrameIndex — unified HTML timing", () => {
  it("maps offsets to frame indices, clamped", () => {
    const dur = 3000;
    const frames = htmlFrameCount(dur);
    expect(frames).toBe(Math.ceil(dur / FRAME_MS));
    expect(htmlFrameIndex(0, dur)).toBe(0);
    expect(htmlFrameIndex(dur - 1, dur)).toBe(frames - 1);
    expect(htmlFrameIndex(dur + 5000, dur)).toBe(frames - 1);
    expect(htmlFrameIndex(-50, dur)).toBe(0);
  });
  it("is monotonic across the card", () => {
    const dur = 5000;
    let prev = -1;
    for (let t = 0; t < dur; t += 17) {
      const i = htmlFrameIndex(t, dur);
      expect(i).toBeGreaterThanOrEqual(prev);
      prev = i;
    }
  });
});

describe("pickExportMime — MP4 first, extension always matches", () => {
  it("prefers MP4 with avc1 when supported", () => {
    const p = pickExportMime(() => true);
    expect(p.mime).toBe("video/mp4;codecs=avc1,mp4a");
    expect(p.container).toBe("video/mp4");
    expect(p.ext).toBe("mp4");
    expect(exportFileName(p.ext)).toBe("lilium-timeline.mp4");
  });
  it("falls back to WebM when MP4 is unsupported", () => {
    const p = pickExportMime((m) => m.startsWith("video/webm"));
    expect(p.container).toBe("video/webm");
    expect(p.ext).toBe("webm");
    expect(exportFileName(p.ext)).toBe("lilium-timeline.webm");
  });
  it("defaults to WebM when nothing is supported", () => {
    const p = pickExportMime(() => false);
    expect(p.mime).toBe("video/webm");
    expect(p.ext).toBe("webm");
  });
});

describe("progressFraction", () => {
  it("stays in [0,1] and grows across phases", () => {
    const seq = [
      progressFraction({ phase: "prerender", done: 0, total: 2 }),
      progressFraction({ phase: "prerender", done: 2, total: 2 }),
      progressFraction({ phase: "audio", done: 1, total: 1 }),
      progressFraction({ phase: "encode", done: 50, total: 100 }),
      progressFraction({ phase: "encode", done: 100, total: 100 }),
      progressFraction({ phase: "finalize", done: 1, total: 1 }),
    ];
    for (const v of seq) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
    for (let i = 1; i < seq.length; i++) expect(seq[i]).toBeGreaterThanOrEqual(seq[i - 1]);
    expect(seq[seq.length - 1]).toBe(1);
  });
});

describe("FR copy — single source in labels.ts", () => {
  it("labels every phase in French", () => {
    expect(exportPhaseLabel("prerender", 1, 3, 0)).toBe("Pré-rendu des cartes… 1/3");
    expect(exportPhaseLabel("audio", 0, 1, 0)).toBe("Préparation de l'audio…");
    expect(exportPhaseLabel("encode", 0, 100, 42)).toBe("Encodage… 42%");
    expect(exportPhaseLabel("finalize", 0, 1, 0)).toBe("Finalisation…");
  });
  it("explains every failure actionably in French", () => {
    const codes = [
      "cancelled",
      "no-clips",
      "relative-url",
      "fetch-failed",
      "decode-failed",
      "prerender-failed",
      "recorder-unsupported",
      "unexpected",
    ];
    for (const code of codes) {
      const msg = exportErrorMessage(code, "Audio à 00:04");
      expect(msg.length).toBeGreaterThan(10);
      expect(new ExportError(code as never, "Audio à 00:04").message).toBe(msg);
    }
    // Actionable: the message tells the creator what to do.
    expect(exportErrorMessage("relative-url", "Audio à 00:04")).toMatch(/régénérez|réimportez/);
    expect(exportErrorMessage("fetch-failed")).toMatch(/expiré/);
  });
  it("throwIfCancelled raises the FR cancel error", () => {
    const ctrl = new AbortController();
    expect(() => throwIfCancelled(ctrl.signal)).not.toThrow();
    ctrl.abort();
    try {
      throwIfCancelled(ctrl.signal);
      expect(true).toBe(false);
    } catch (e) {
      expect((e as ExportError).code).toBe("cancelled");
      expect((e as Error).message).toBe("Export annulé.");
    }
  });
});

describe("export constants", () => {
  it("locks the AAA file spec", () => {
    expect(EXPORT_WIDTH).toBe(1920);
    expect(EXPORT_HEIGHT).toBe(1080);
    expect(EXPORT_FPS).toBe(30);
    expect(FRAME_MS).toBeCloseTo(33.333, 2);
    expect(VIDEO_BITS_PER_SECOND).toBe(3_000_000);
    expect(AUDIO_LEAD_S).toBe(0.15);
  });
});

describe("htmlFrameMs — canonical card frame step", () => {
  it("splits the duration into htmlFrameCount frames", () => {
    expect(htmlFrameMs(3000)).toBeCloseTo(3000 / htmlFrameCount(3000), 9);
    expect(htmlFrameMs(100)).toBeCloseTo(100 / htmlFrameCount(100), 9);
  });
});

describe("progressFraction — exact phase weights", () => {
  it("locks prerender .3 / audio .1 / encode .55 / finalize .05", () => {
    expect(progressFraction({ phase: "prerender", done: 1, total: 2 })).toBeCloseTo(0.15, 9);
    expect(progressFraction({ phase: "audio", done: 1, total: 2 })).toBeCloseTo(0.35, 9);
    expect(progressFraction({ phase: "encode", done: 1, total: 2 })).toBeCloseTo(0.675, 9);
    expect(progressFraction({ phase: "finalize", done: 1, total: 2 })).toBeCloseTo(0.975, 9);
  });
});

/** Recording 2d context stand-in (bun has no DOM canvas). */
function mockCtx() {
  const calls: Array<{ op: string; args: unknown[] }> = [];
  const fills: string[] = [];
  const alphas: number[] = [];
  const ctx = {
    calls,
    fills,
    font: "",
    textAlign: "",
    textBaseline: "",
    save() {
      calls.push({ op: "save", args: [] });
    },
    restore() {
      calls.push({ op: "restore", args: [] });
    },
    fillRect(x: number, y: number, w: number, h: number) {
      calls.push({ op: "fillRect", args: [x, y, w, h] });
    },
    fillText(t: string, x: number, y: number) {
      calls.push({ op: "fillText", args: [t, x, y] });
    },
    drawImage(...a: unknown[]) {
      calls.push({ op: "drawImage", args: a });
    },
    measureText(t: string) {
      return { width: t.length * 10 };
    },
  };
  Object.defineProperty(ctx, "globalAlpha", {
    set(v: number) {
      alphas.push(v);
      calls.push({ op: "globalAlpha", args: [v] });
    },
    get() {
      return alphas[alphas.length - 1] ?? 1;
    },
  });
  Object.defineProperty(ctx, "fillStyle", {
    set(v: string) {
      fills.push(v);
      calls.push({ op: "fillStyle", args: [v] });
    },
    get() {
      return fills[fills.length - 1] ?? "#000";
    },
  });
  return ctx;
}

function imgClip(over: Partial<TimelineClip> = {}) {
  return clip({
    id: "v1",
    track: "Video",
    start_ms: 0,
    duration_ms: 3000,
    asset_id: "img1",
    assets: { kind: "image", url: "https://cdn.example/a.png", prompt: "plage" },
    ...over,
  });
}

describe("renderTimelineFrame — shared preview/file renderer", () => {
  it("blends two overlapping video clips (dissolve, 2 draws)", () => {
    const a = imgClip({ id: "a", start_ms: 0, duration_ms: 3000 });
    const b = imgClip({ id: "b", start_ms: 2000, duration_ms: 3000 });
    const ctx = mockCtx();
    renderTimelineFrame({
      ctx: ctx as unknown as CanvasRenderingContext2D,
      width: 1920,
      height: 1080,
      clips: [a, b],
      ms: 2500,
      getImage: () => ({ complete: true, naturalWidth: 800, naturalHeight: 600 }) as never,
    });
    const draws = ctx.calls.filter((c) => c.op === "drawImage");
    expect(draws.length).toBe(2);
  });
  it("fades a lone clip to black at its tail", () => {
    const c = imgClip({ meta: { transition_out_ms: 500 } });
    const ctx = mockCtx();
    renderTimelineFrame({
      ctx: ctx as unknown as CanvasRenderingContext2D,
      width: 1920,
      height: 1080,
      clips: [c],
      // 100ms before the end of a 500ms fade → alpha 0.2 black veil.
      ms: 2900,
      getImage: () => ({ complete: true, naturalWidth: 800, naturalHeight: 600 }) as never,
    });
    const veil = ctx.calls.find(
      (x) =>
        x.op === "fillStyle" &&
        typeof x.args[0] === "string" &&
        x.args[0].startsWith("rgba(0,0,0,"),
    );
    expect(veil).toBeDefined();
  });
  it("draws each subtitle line", () => {
    const c = clip({
      track: "Subtitles",
      start_ms: 0,
      duration_ms: 3000,
      assets: null,
      meta: { text: "un deux trois quatre cinq six sept huit neuf dix onze douze" },
    });
    const ctx = mockCtx();
    renderTimelineFrame({
      ctx: ctx as unknown as CanvasRenderingContext2D,
      width: 1920,
      height: 1080,
      clips: [c],
      ms: 100,
      getImage: () => undefined,
    });
    const texts = ctx.calls.filter((x) => x.op === "fillText");
    expect(texts.length).toBeGreaterThanOrEqual(1);
    expect(ctx.font).toContain("system-ui");
  });
  it("draws ready video elements, skips unready ones silently in-frame (validated upfront)", () => {
    const c = clip({
      id: "vv",
      track: "Video",
      start_ms: 0,
      duration_ms: 3000,
      asset_id: "vid1",
      assets: { kind: "video", url: "https://cdn.example/b.mp4", prompt: null },
    });
    const ready = { readyState: 3, videoWidth: 640, videoHeight: 360 };
    const ctx = mockCtx();
    renderTimelineFrame({
      ctx: ctx as unknown as CanvasRenderingContext2D,
      width: 1920,
      height: 1080,
      clips: [c],
      ms: 100,
      getImage: () => undefined,
      videoFrameMap: new Map([["vv", ready as never]]),
    });
    expect(ctx.calls.filter((x) => x.op === "drawImage").length).toBe(1);
    const ctx2 = mockCtx();
    renderTimelineFrame({
      ctx: ctx2 as unknown as CanvasRenderingContext2D,
      width: 1920,
      height: 1080,
      clips: [c],
      ms: 100,
      getImage: () => undefined,
      videoFrameMap: new Map([["vv", { readyState: 0, videoWidth: 0, videoHeight: 0 } as never]]),
    });
    expect(ctx2.calls.filter((x) => x.op === "drawImage").length).toBe(0);
  });
});

describe("previewFrameTime — Director preview_frame capture time", () => {
  const c = { start_ms: 1000, duration_ms: 4000 };
  it("keeps an explicit time inside the clip", () => {
    expect(previewFrameTime(c, 2500)).toBe(2500);
  });
  it("clamps before the clip to its start", () => {
    expect(previewFrameTime(c, 0)).toBe(1000);
  });
  it("clamps after the clip to its last ms", () => {
    expect(previewFrameTime(c, 99999)).toBe(4999);
  });
  it("defaults to the middle of the clip", () => {
    expect(previewFrameTime(c)).toBe(3000);
  });
  it("ignores a non-finite time", () => {
    expect(previewFrameTime(c, Number.NaN)).toBe(3000);
  });
  it("survives a zero-duration clip", () => {
    expect(previewFrameTime({ start_ms: 500, duration_ms: 0 })).toBe(500);
  });
});

describe("clipTransform — static clip transform (meta.transform)", () => {
  it("defaults to untouched (fit, centered, opaque)", () => {
    expect(clipTransform(clip())).toEqual({ scale: 1, x: 0.5, y: 0.5, opacity: 1 });
  });
  it("reads meta.transform values", () => {
    const c = clip({ meta: { transform: { scale: 0.35, x: 0.8, y: 0.2, opacity: 0.6 } } });
    expect(clipTransform(c)).toEqual({ scale: 0.35, x: 0.8, y: 0.2, opacity: 0.6 });
  });
  it("clamps out-of-range and non-finite values", () => {
    const c = clip({ meta: { transform: { scale: 99, x: -5, y: Number.NaN, opacity: -1 } } });
    const t = clipTransform(c);
    expect(t.scale).toBe(4);
    expect(t.x).toBe(-1);
    expect(t.y).toBe(0.5);
    expect(t.opacity).toBe(0);
  });
});

describe("transformRect — fit then scale around the frame center", () => {
  it("centers a fitted 16:9 source on a 1920×1080 frame", () => {
    const r = transformRect({ scale: 1, x: 0.5, y: 0.5, opacity: 1 }, 1920, 1080, 1920, 1080);
    expect(r).toEqual({ x: 0, y: 0, w: 1920, h: 1080 });
  });
  it("scales a PiP around the requested center", () => {
    const r = transformRect({ scale: 0.35, x: 0.8, y: 0.2, opacity: 1 }, 1920, 1080, 1920, 1080);
    expect(r.w).toBeCloseTo(672);
    expect(r.h).toBeCloseTo(378);
    expect(r.x).toBeCloseTo(1536 - 336);
    expect(r.y).toBeCloseTo(216 - 189);
  });
  it("letterboxes a portrait source before scaling", () => {
    const r = transformRect({ scale: 1, x: 0.5, y: 0.5, opacity: 1 }, 1920, 1080, 1080, 1920);
    expect(r.w).toBeCloseTo(607.5);
    expect(r.h).toBeCloseTo(1080);
    expect(r.x).toBeCloseTo((1920 - 607.5) / 2);
    expect(r.y).toBeCloseTo(0);
  });
});

describe("renderTimelineFrame — multi-track compositing", () => {
  it("draws the base track first, then the overlay (Video 2) on top", () => {
    const base = imgClip({ id: "base", track: "Video", start_ms: 0, duration_ms: 3000 });
    const pip = imgClip({
      id: "pip",
      track: "Video 2",
      start_ms: 0,
      duration_ms: 3000,
      meta: { transform: { scale: 0.35, x: 0.8, y: 0.2, opacity: 1 } },
    });
    const ctx = mockCtx();
    renderTimelineFrame({
      ctx: ctx as unknown as CanvasRenderingContext2D,
      width: 1920,
      height: 1080,
      clips: [pip, base],
      ms: 1000,
      getImage: () => ({ complete: true, naturalWidth: 1920, naturalHeight: 1080 }) as never,
    });
    const draws = ctx.calls.filter((c) => c.op === "drawImage");
    expect(draws.length).toBe(2);
    // base = full frame, overlay = PiP rect
    expect(draws[0].args[1]).toBe(0);
    expect(draws[0].args[3]).toBe(1920);
    expect(draws[1].args[3]).toBeCloseTo(672);
    expect(draws[1].args[1]).toBeCloseTo(1536 - 336);
  });
  it("applies clip opacity to the overlay", () => {
    const base = imgClip({ id: "base", track: "Video", start_ms: 0, duration_ms: 3000 });
    const pip = imgClip({
      id: "pip",
      track: "Video 2",
      start_ms: 0,
      duration_ms: 3000,
      meta: { transform: { opacity: 0.5 } },
    });
    const ctx = mockCtx();
    renderTimelineFrame({
      ctx: ctx as unknown as CanvasRenderingContext2D,
      width: 1920,
      height: 1080,
      clips: [base, pip],
      ms: 1000,
      getImage: () => ({ complete: true, naturalWidth: 1920, naturalHeight: 1080 }) as never,
    });
    const alphas = ctx.calls.filter((c) => c.op === "globalAlpha").map((c) => c.args[0]);
    expect(alphas).toContain(0.5);
  });
});

describe("topmostActiveVideoClip — overlay priority", () => {
  const at = (id: string, track: string, start: number, dur: number, kind = "image") =>
    imgClip({
      id,
      track,
      start_ms: start,
      duration_ms: dur,
      assets: { kind, url: `https://cdn.example/${id}.png`, prompt: null },
    });
  it("prefers the topmost track when several clips overlap", () => {
    const clips = [at("base", "Video", 0, 5000), at("over", "Video 2", 0, 5000)];
    expect(topmostActiveVideoClip(clips, 1000)?.id).toBe("over");
  });
  it("falls back to the base track outside the overlay range", () => {
    const clips = [at("base", "Video", 0, 5000), at("over", "Video 2", 1000, 1000)];
    expect(topmostActiveVideoClip(clips, 3000)?.id).toBe("base");
  });
  it("returns null when nothing is active", () => {
    expect(topmostActiveVideoClip([at("base", "Video", 0, 1000)], 5000)).toBeNull();
  });
  it("filters on the asset kind", () => {
    const clips = [at("base", "Video", 0, 5000, "html"), at("over", "Video 2", 0, 5000, "image")];
    expect(topmostActiveVideoClip(clips, 1000, "html")?.id).toBe("base");
  });
});

describe("clipKeyframes — validated meta.transform.keyframes", () => {
  it("returns nothing without keyframes", () => {
    expect(clipKeyframes(clip())).toEqual([]);
    expect(hasKeyframes(clip())).toBe(false);
  });
  it("drops malformed entries and sorts by time", () => {
    const c = clip({
      meta: {
        transform: {
          keyframes: [{ t_ms: 2000, scale: 2 }, "nope", { scale: 3 }, { t_ms: 0, scale: 1 }, null],
        },
      },
    });
    expect(clipKeyframes(c)).toEqual([
      { t_ms: 0, scale: 1 },
      { t_ms: 2000, scale: 2 },
    ]);
    expect(hasKeyframes(c)).toBe(true);
  });
  it("clamps values and negative times", () => {
    const c = clip({ meta: { transform: { keyframes: [{ t_ms: -50, scale: 99, opacity: -1 }] } } });
    expect(clipKeyframes(c)).toEqual([{ t_ms: 0, scale: 4, opacity: 0 }]);
  });
  it("caps the list at 50 keyframes", () => {
    const many = Array.from({ length: 60 }, (_, i) => ({ t_ms: i * 100 }));
    const c = clip({ meta: { transform: { keyframes: many } } });
    expect(clipKeyframes(c).length).toBe(50);
  });
});

describe("clipTransformAt — linear interpolation", () => {
  const animated = (keyframes: unknown[], transform: Record<string, unknown> = {}) =>
    clip({ meta: { transform: { ...transform, keyframes } } });

  it("falls back to the static transform without keyframes", () => {
    const c = clip({ meta: { transform: { scale: 0.35 } } });
    expect(clipTransformAt(c, 1234)).toEqual({ scale: 0.35, x: 0.5, y: 0.5, opacity: 1 });
  });
  it("interpolates scale between two keyframes", () => {
    const c = animated([
      { t_ms: 0, scale: 1 },
      { t_ms: 2000, scale: 2 },
    ]);
    expect(clipTransformAt(c, 0).scale).toBe(1);
    expect(clipTransformAt(c, 1000).scale).toBeCloseTo(1.5);
    expect(clipTransformAt(c, 2000).scale).toBe(2);
  });
  it("clamps outside the keyframe range", () => {
    const c = animated([
      { t_ms: 500, opacity: 0.2 },
      { t_ms: 1500, opacity: 0.8 },
    ]);
    expect(clipTransformAt(c, 0).opacity).toBe(0.2);
    expect(clipTransformAt(c, 99999).opacity).toBe(0.8);
  });
  it("keeps omitted properties on the static base", () => {
    const c = animated(
      [
        { t_ms: 0, scale: 1 },
        { t_ms: 1000, scale: 2 },
      ],
      { x: 0.8, y: 0.2, opacity: 0.5 },
    );
    const t = clipTransformAt(c, 500);
    expect(t.scale).toBeCloseTo(1.5);
    expect(t.x).toBe(0.8);
    expect(t.y).toBe(0.2);
    expect(t.opacity).toBe(0.5);
  });
  it("handles duplicate timestamps without dividing by zero", () => {
    const c = animated([
      { t_ms: 0, opacity: 0 },
      { t_ms: 0, opacity: 1 },
      { t_ms: 1000, opacity: 0 },
    ]);
    expect(Number.isFinite(clipTransformAt(c, 0).opacity)).toBe(true);
    expect(clipTransformAt(c, 1000).opacity).toBe(0);
  });
  it("interpolates position (slide-in)", () => {
    const c = animated([
      { t_ms: 0, x: 0.2 },
      { t_ms: 800, x: 0.5 },
    ]);
    expect(clipTransformAt(c, 400).x).toBeCloseTo(0.35);
  });
});

describe("renderTimelineFrame — animated transform", () => {
  it("draws the clip with the interpolated keyframe scale", () => {
    const c = imgClip({
      id: "zoom",
      start_ms: 1000,
      duration_ms: 3000,
      meta: {
        transform: {
          keyframes: [
            { t_ms: 0, scale: 1 },
            { t_ms: 2000, scale: 2 },
          ],
        },
      },
    });
    const ctx = mockCtx();
    renderTimelineFrame({
      ctx: ctx as unknown as CanvasRenderingContext2D,
      width: 1920,
      height: 1080,
      clips: [c],
      ms: 2000, // 1000ms into the clip → scale 1.5
      getImage: () => ({ complete: true, naturalWidth: 1920, naturalHeight: 1080 }) as never,
    });
    const draw = ctx.calls.find((x) => x.op === "drawImage");
    expect(draw).toBeDefined();
    expect(draw!.args[3]).toBeCloseTo(2880);
  });
});
