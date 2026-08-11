/**
 * Deterministic decorative waveform. It derives its bars from a seed string so
 * the same asset always renders the same shape (no decoding cost in a grid).
 */
export function Waveform({
  seed,
  bars = 40,
  className = "",
  active = false,
}: {
  seed: string;
  bars?: number;
  className?: string;
  active?: boolean;
}) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const values = Array.from({ length: bars }, (_, i) => {
    h = (h * 1664525 + 1013904223) >>> 0;
    const base = ((h >>> 8) % 100) / 100;
    const envelope = Math.sin((i / bars) * Math.PI) * 0.6 + 0.4;
    return Math.max(0.12, base * envelope);
  });

  return (
    <div className={`flex h-full w-full items-center gap-[2px] ${className}`} aria-hidden>
      {values.map((v, i) => (
        <span
          key={i}
          className="flex-1 rounded-full transition-[height] duration-300"
          style={{
            height: `${Math.round(v * 100)}%`,
            background: active ? "var(--accent)" : "var(--text-dim)",
            opacity: active ? 0.9 : 0.55,
          }}
        />
      ))}
    </div>
  );
}