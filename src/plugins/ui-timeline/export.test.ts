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
  clipLabel,
  dissolveMix,
  envelopeForClip,
  ExportError,
  formatTimeMs,
  htmlFrameCount,
  htmlFrameIndex,
  isHttpUrl,
  pickExportMime,
  progressFraction,
  subtitleLayout,
  throwIfCancelled,
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
    expect(l.font).toBe("28px system-ui, sans-serif");
    expect(l.color).toBe("#ffffff");
    expect(l.box.y).toBe(EXPORT_HEIGHT - 70 - (28 + 16));
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
    expect(l.box.y).toBe(EXPORT_HEIGHT / 2 - (28 + 16) / 2);
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
