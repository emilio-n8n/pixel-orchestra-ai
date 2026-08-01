// Measure the real duration of an MP3 file by parsing its frame headers.
// Works for CBR and VBR MP3s (Layer III). Pure TypeScript, no dependencies.
// Returns duration in milliseconds, or 0 if the file is not a valid MP3.

const SAMPLE_RATES: Record<number, Record<number, number>> = {
  3: { 0: 44100, 1: 48000, 2: 32000 }, // MPEG1
  2: { 0: 22050, 1: 24000, 2: 16000 }, // MPEG2
  0: { 0: 11025, 1: 12000, 2: 8000 }, // MPEG2.5
};

const SAMPLES_PER_FRAME: Record<number, number> = { 3: 1152, 2: 576, 0: 576 };

// Layer III bitrate tables (kbps) by version.
const BITRATES_L3: Record<number, number[]> = {
  3: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0],
  2: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0],
  0: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0],
};

export function measureMp3DurationMs(bytes: Uint8Array): number {
  let totalSamples = 0;
  let lastSampleRate = 44100;
  let frames = 0;
  let pos = 0;

  while (pos < bytes.length - 4) {
    // Frame sync: 11 set bits (0xFFE)
    if (bytes[pos] !== 0xff || (bytes[pos + 1] & 0xe0) !== 0xe0) {
      pos++;
      continue;
    }
    const version = (bytes[pos + 1] >> 3) & 0x3;
    const layer = (bytes[pos + 1] >> 1) & 0x3;
    const bitrateIdx = (bytes[pos + 2] >> 4) & 0xf;
    const sampleRateIdx = (bytes[pos + 2] >> 2) & 0x3;
    const padding = (bytes[pos + 2] >> 1) & 0x1;

    // Only Layer III
    if (layer !== 1) {
      pos++;
      continue;
    }
    const sampleRate = SAMPLE_RATES[version]?.[sampleRateIdx];
    const samplesPerFrame = SAMPLES_PER_FRAME[version];
    const bitrateKbps = BITRATES_L3[version]?.[bitrateIdx];
    if (!sampleRate || !samplesPerFrame || !bitrateKbps) {
      pos++;
      continue;
    }

    const frameLength =
      Math.floor(((samplesPerFrame / 8) * bitrateKbps * 1000) / sampleRate) + padding;
    if (frameLength < 24) {
      pos++;
      continue;
    }

    totalSamples += samplesPerFrame;
    lastSampleRate = sampleRate;
    frames++;
    pos += frameLength;
  }

  if (frames === 0) return 0;
  return Math.round((totalSamples / lastSampleRate) * 1000);
}
