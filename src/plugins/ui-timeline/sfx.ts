/**
 * Built-in SFX library (spec E.2): short, ready-to-drop sound effects.
 *
 * Each preset is a pure DSP recipe rendered offline into a WAV by
 * `renderSfxWav` — no network, no asset row, no model. That keeps the
 * catalogue instant and deterministic, and the produced Blob URL can be
 * imported as a normal asset so it flows through the same timeline path as
 * any other audio (ducking, envelopes, export) with zero special cases.
 */

export type SfxKind = "whoosh" | "pop" | "shutter" | "ding" | "paper" | "chime";

export interface SfxPreset {
  id: SfxKind;
  /** FR label shown in the picker. */
  label: string;
  /** One-line description of the sound, for the tooltip. */
  hint: string;
  /** Default length on the SFX track when dropped. */
  durationMs: number;
}

export const SFX_PRESETS: readonly SfxPreset[] = [
  { id: "whoosh", label: "Whoosh", hint: "Transition rapide — coupe de plan", durationMs: 420 },
  { id: "pop", label: "Pop", hint: "Clic sourd — révélation, point d’intérêt", durationMs: 180 },
  { id: "shutter", label: "Shutter", hint: "Obturateur — photo prise", durationMs: 240 },
  { id: "ding", label: "Ding", hint: "Cloche aigu — confirmation, notification", durationMs: 900 },
  { id: "paper", label: "Paper", hint: "Feuillet — texte qui apparaît", durationMs: 320 },
  { id: "chime", label: "Chime", hint: "Carillon — transition de section", durationMs: 1400 },
] as const;

export function sfxPreset(id: string): SfxPreset | undefined {
  return SFX_PRESETS.find((p) => p.id === id);
}

const SAMPLE_RATE = 44100;

/**
 * Render a preset to a WAV blob. Pure synthesis: envelopes + a couple of
 * oscillators (and a little shaped noise for the paper/shutter transients),
 * normalised to −1 dBFS so every preset sits at the same perceived level.
 */
export function renderSfxWav(preset: SfxPreset): Blob {
  const n = Math.max(1, Math.round((preset.durationMs / 1000) * SAMPLE_RATE));
  const out = new Float32Array(n);
  renderSfxSamples(preset, out, SAMPLE_RATE);

  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(out[i]));
  const gain = peak > 0 ? Math.pow(10, -1 / 20) / peak : 1;

  return encodeWav(out, gain, SAMPLE_RATE);
}

/** Exposed for unit tests: fill `out` with the raw (un-normalised) samples. */
export function renderSfxSamples(preset: SfxPreset, out: Float32Array, sampleRate: number): void {
  const n = out.length;
  const t = (i: number) => i / sampleRate;
  // Deterministic noise source (no Math.random → reproducible renders).
  let seed = 0x2f6e2b1 ^ (preset.id.length * 2654435761);
  const noise = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return (seed / 0xffffffff) * 2 - 1;
  };

  for (let i = 0; i < n; i++) {
    const time = t(i);
    let v = 0;
    switch (preset.id) {
      case "whoosh": {
        // Filtered noise sweeping up then down, with a soft body.
        const p = i / n;
        const env = Math.sin(Math.PI * Math.pow(p, 0.7));
        v = noise() * env * 0.9 + Math.sin(2 * Math.PI * (180 + 900 * p) * time) * env * 0.18;
        break;
      }
      case "pop": {
        // Sharp attack, very fast decay, a touch of pitch drop.
        const p = i / n;
        const env = Math.exp(-p * 22);
        const freq = 520 * (1 - 0.45 * p);
        v = Math.sin(2 * Math.PI * freq * time) * env;
        break;
      }
      case "shutter": {
        // Two mechanical clicks (mirror + curtain) over a low body.
        const p = i / n;
        const clickA = Math.exp(-p * 60);
        const clickB = Math.exp(-Math.max(0, p - 0.42) * 55) * (p > 0.42 ? 1 : 0);
        const body = Math.sin(2 * Math.PI * 90 * time) * Math.exp(-p * 6) * 0.35;
        v = (noise() * (clickA + clickB * 0.85) + body) * 0.9;
        break;
      }
      case "ding": {
        // Struck bell: inharmonic partials, fast attack, long ring.
        const env = Math.exp(-time * 4.2);
        v =
          (Math.sin(2 * Math.PI * 880 * time) * 1 +
            Math.sin(2 * Math.PI * 1320 * time) * 0.5 +
            Math.sin(2 * Math.PI * 2640 * time) * 0.22) *
          env;
        break;
      }
      case "paper": {
        // High-passed noise bursts = the rustle of a sheet.
        const p = i / n;
        const env = Math.sin(Math.PI * Math.pow(p, 0.55)) ** 2;
        v = noise() * env;
        break;
      }
      case "chime": {
        // Three ascending notes, soft attack, gentle overlap.
        const notes = [523.25, 659.25, 783.99];
        const step = n / 3;
        v = 0;
        for (let k = 0; k < notes.length; k++) {
          const local = (i - k * step) / sampleRate;
          if (local < 0) continue;
          const env = Math.exp(-local * 3.1) * (1 - Math.exp(-local * 90));
          v += Math.sin(2 * Math.PI * notes[k] * local) * env;
        }
        v /= 1.4;
        break;
      }
    }
    out[i] = v;
  }
}

/** 16-bit PCM WAV container. */
function encodeWav(samples: Float32Array, gain: number, sampleRate: number): Blob {
  const bytesPerSample = 2;
  const dataSize = samples.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeAscii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };

  writeAscii(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(8, "WAVE");
  writeAscii(12, "fmt ");
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // format = PCM
  view.setUint16(22, 1, true); // channels = mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true); // byte rate
  view.setUint16(32, bytesPerSample, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeAscii(36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i] * gain));
    view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
    offset += bytesPerSample;
  }
  return new Blob([buffer], { type: "audio/wav" });
}
