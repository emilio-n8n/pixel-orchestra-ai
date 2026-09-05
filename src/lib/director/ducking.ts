// Automatic ducking: compute a gain curve over the project timeline where
// the target track (music) is attenuated while the source track (voice)
// is active. The curve is stored on the target clips (meta.ducking) and
// consumed by both the preview (HTMLAudioElement.volume) and the export
// (GainNode envelope).

export interface DuckingInput {
  /** Absolute ms intervals during which the source (voice) is active. */
  sourceIntervals: Array<{ start_ms: number; end_ms: number }>;
  totalMs: number;
  /** e.g. -12 → the target drops to 10^(-12/20) ≈ 0.25. */
  attenuationDb: number;
  attackMs: number;
  releaseMs: number;
  stepMs?: number;
}

export interface GainPoint {
  t_ms: number;
  gain: number;
}

/** One-pole smoothed gain curve sampled every stepMs over [0, totalMs]. */
export function computeDuckingCurve(input: DuckingInput): GainPoint[] {
  const { sourceIntervals, totalMs, attenuationDb, attackMs, releaseMs } = input;
  const stepMs = input.stepMs ?? 25;
  const duckedGain = Math.pow(10, attenuationDb / 20);
  const dt = stepMs / 1000;

  const isActive = (t: number) =>
    sourceIntervals.some((iv) => t >= iv.start_ms && t < iv.end_ms);

  let gain = 1;
  const points: GainPoint[] = [];
  for (let t = 0; t <= totalMs; t += stepMs) {
    const target = isActive(t) ? duckedGain : 1;
    const tau = (target < gain ? attackMs : releaseMs) / 1000;
    if (tau > 0) gain += (target - gain) * (1 - Math.exp(-dt / tau));
    else gain = target;
    points.push({ t_ms: t, gain: Math.round(gain * 10000) / 10000 });
  }
  return points;
}

/** Interpolate the curve at an absolute time (1 outside the sampled range). */
export function duckGainAt(
  curve: GainPoint[] | undefined,
  absMs: number,
): number {
  if (!curve || curve.length === 0) return 1;
  if (absMs <= curve[0].t_ms) return curve[0].gain;
  const last = curve[curve.length - 1];
  if (absMs >= last.t_ms) return last.gain;
  for (let i = 1; i < curve.length; i++) {
    if (absMs <= curve[i].t_ms) {
      const a = curve[i - 1];
      const b = curve[i];
      const span = b.t_ms - a.t_ms;
      if (span <= 0) return b.gain;
      const f = (absMs - a.t_ms) / span;
      return a.gain + (b.gain - a.gain) * f;
    }
  }
  return last.gain;
}
