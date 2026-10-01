/**
 * Auto-ducking of the music bed (spec E.1).
 *
 * Recomputed whenever the clip list settles (the realtime channel batches
 * agent edits, so we debounce rather than firing on every intermediate
 * frame). The result is written to `meta.ducking` on every Music clip, which
 * is the single field `volAt` (preview) and the export envelope both read —
 * so the mix the user hears is the mix the file gets, with no second path.
 */

import { useEffect, useRef } from "react";
import { useKernel } from "@/kernel/react";
import { useProjectTimeline } from "./ProjectTimelineProvider";
import { computeAutoDucking } from "./ducking";
import { insertDucking } from "./server";
import { DUCKING_SOURCE_TRACKS, DUCKING_TARGET_TRACK } from "@/lib/ui/labels";

/** Realtime delivers a burst of row changes; settle before recomputing. */
const DEBOUNCE_MS = 600;

export function useAutoDucking(): void {
  const { events } = useKernel();
  const { clips, totalMs, projectId } = useProjectTimeline();
  const timerRef = useRef<number | null>(null);
  // Track the last curve we wrote so an unrelated clip edit (a move, a trim)
  // does not re-persist an identical curve.
  const lastSignatureRef = useRef<string>("");

  useEffect(() => {
    if (!projectId) return;
    if (timerRef.current != null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      void run(clips, totalMs, projectId, lastSignatureRef, events.emit);
    }, DEBOUNCE_MS);
    return () => {
      if (timerRef.current != null) window.clearTimeout(timerRef.current);
      timerRef.current = null;
    };
  }, [clips, totalMs, projectId, events]);
}

async function run(
  clips: Parameters<typeof computeAutoDucking>[0],
  totalMs: number,
  projectId: string,
  lastSignatureRef: { current: string },
  emit: (event: {
    type: "TimelineDuckingApplied";
    clipIds: string[];
    attenuationDb: number;
    sourceTracks: string[];
    projectId: string;
  }) => void,
): Promise<void> {
  const result = computeAutoDucking(clips, totalMs);
  if (result.empty) return;
  // Signature of the inputs that matter: the music clip ids + the intervals
  // that trigger the duck. A pure move of a music clip changes it (the duck
  // must follow the clip), so that is intentional.
  const signature = `${result.attenuationDb}|${result.clipIds.join(",")}|${totalMs}`;
  if (signature === lastSignatureRef.current) return;
  lastSignatureRef.current = signature;

  try {
    // Updates are allowed from the browser client (RLS only guards rows the
    // user already owns), but the meta payload is JSON — the helper keeps the
    // one shape in one place.
    await insertDucking({
      data: {
        projectId,
        clipIds: result.clipIds,
        curve: result.curve,
        attenuationDb: result.attenuationDb,
      },
    });
    emit({
      type: "TimelineDuckingApplied",
      clipIds: result.clipIds,
      attenuationDb: result.attenuationDb,
      sourceTracks: [...DUCKING_SOURCE_TRACKS],
      projectId,
    });
  } catch {
    // Offline or RLS failure: the previous curve stays in place, so the mix
    // is never left in a half-applied state. The next settle retries.
    lastSignatureRef.current = "";
  }
}

export { DUCKING_TARGET_TRACK };
