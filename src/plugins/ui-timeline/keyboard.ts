/**
 * Timeline keyboard map (spec B.1) + history wiring.
 *
 *  V              select tool
 *  C              split: the selected clip, or every clip under the playhead
 *  Suppr/Backspace delete the selection (Maj+Suppr = ripple/compact)
 *  ←/→            nudge ±100 ms (Maj = ±1 s)
 *  Space          play / pause
 *  ⌘Z / ⇧⌘Z      undo / redo
 *  ⌘- / ⌘+       zoom out / in
 *
 * Every mutation goes through the shared timeline context, so a keypress and
 * a click land on exactly the same code path (and emit the same events).
 */

import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toJson } from "@/lib/json";
import { useProjectTimeline } from "./ProjectTimelineProvider";
import { useHistoryStore } from "./history";
import { useZoomStore } from "./zoom";
import { useToolStore } from "./tools";
import { isTypingTarget, NUDGE_MS, NUDGE_SHIFT_MS, snapMs, type TimelineClip } from "./store";

/**
 * Bind the history store to the live clip list. Undo/redo restores by
 * rewriting the differing rows: the realtime channel then re-reads the table,
 * so a restored list converges without any bespoke reverse operations.
 */
/**
 * Bind the history store to the live clip list and to the persistence path.
 * A hook (not a plain function) so it can read the timeline context and
 * register its cleanup with React.
 */
export function useTimelineHistoryBinding(): void {
  const tl = useProjectTimeline();
  const bind = useHistoryStore((s) => s.bind);
  const latest = useRef(tl);
  latest.current = tl;

  useEffect(() => {
    bind(
      () => latest.current.clips,
      (clips) => void persistClipList(clips),
    );
    return () =>
      bind(
        () => [],
        () => {},
      );
  }, [bind]);
}

/**
 * Make `clips` the persisted truth: upsert every row, delete the ones that
 * no longer exist. Realtime refreshes the panel right after.
 */
async function persistClipList(clips: TimelineClip[]): Promise<void> {
  const { data, error } = await supabase.from("timeline_clips").select("id");
  if (error || !data) return;
  const keep = new Set(clips.map((c) => c.id));
  const gone = data.map((r) => r.id as string).filter((id) => !keep.has(id));
  if (gone.length > 0) {
    await supabase.from("timeline_clips").delete().in("id", gone);
  }
  if (clips.length > 0) {
    await Promise.all(
      clips.map((c) =>
        supabase
          .from("timeline_clips")
          .update({
            track: c.track,
            start_ms: c.start_ms,
            duration_ms: c.duration_ms,
            meta: toJson(c.meta ?? {}),
          })
          .eq("id", c.id),
      ),
    );
  }
}

/** Install the global key map. Returns nothing; the effect owns the listener. */
export function useTimelineKeyboard(): void {
  const tl = useProjectTimeline();
  const latest = useRef(tl);
  latest.current = tl;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = latest.current;
      const target = e.target as HTMLElement | null;
      const isMod = e.metaKey || e.ctrlKey;
      // Range sliders keep native arrow/Delete behaviour; Space is dead
      // natively there, so we still take it for play/pause.
      const isRange = target?.tagName === "INPUT" && (target as HTMLInputElement).type === "range";
      if (isTypingTarget(target) && !(isRange && isSpace(e))) return;
      const onButtonOrLink =
        !!target?.closest?.('button, a, [role="button"]') || target?.tagName === "BUTTON";

      if (isMod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        const h = useHistoryStore.getState();
        if (e.shiftKey) h.redo();
        else h.undo();
        return;
      }
      if (isMod && (e.key === "-" || e.key === "_")) {
        e.preventDefault();
        useZoomStore.getState().step(1 / 1.25);
        return;
      }
      if (isMod && (e.key === "=" || e.key === "+")) {
        e.preventDefault();
        useZoomStore.getState().step(1.25);
        return;
      }
      if (isMod) return;

      if (e.key === "Escape") {
        // Escape backs out one level: disarm the scissors first, then drop
        // the selection. A single Escape should never leave the user stuck
        // in a tool they can no longer see as active.
        if (useToolStore.getState().tool === "scissors") {
          useToolStore.getState().setTool("select");
          return;
        }
        if (t.selectedClipId) {
          e.preventDefault();
          t.selectClip(null);
        }
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        if (t.selectedClipId) {
          e.preventDefault();
          useHistoryStore.getState().push(t.clips);
          // Deleting returns the tool to select: a scissors-armed state left
          // behind after a delete is a classic source of surprise.
          useToolStore.getState().setTool("select");
          void t.deleteClip(t.selectedClipId, { ripple: e.shiftKey });
        }
        return;
      }
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        if (!t.selectedClipId) return;
        e.preventDefault();
        const clip = t.clips.find((c) => c.id === t.selectedClipId);
        if (!clip) return;
        const delta = (e.key === "ArrowLeft" ? -1 : 1) * (e.shiftKey ? NUDGE_SHIFT_MS : NUDGE_MS);
        useHistoryStore.getState().push(t.clips);
        const desired = snapMs(Math.max(0, clip.start_ms + delta));
        const start = t.resolveNoOverlap(clip.track, desired, clip.duration_ms, clip.id);
        t.patchClipLocal(clip.id, { start_ms: start });
        void t.updateClip(clip.id, { start_ms: start });
        return;
      }
      if (e.key.toLowerCase() === "v") {
        if (onButtonOrLink) return;
        e.preventDefault();
        useToolStore.getState().setTool("select");
        return;
      }
      if (e.key.toLowerCase() === "c") {
        if (onButtonOrLink || isTypingTarget(target)) return;
        e.preventDefault();
        // C both arms the scissors tool and cuts immediately: the tool makes
        // the next click a cut, the immediate cut means the shortcut is
        // useful without a second gesture.
        useToolStore.getState().setTool("scissors");
        useHistoryStore.getState().push(t.clips);
        void t.splitAtPlayhead(t.selectedClipId ? "selected" : "all");
        return;
      }
      if (isSpace(e)) {
        // Focused buttons keep their native Space activation.
        if (onButtonOrLink && !isRange) return;
        e.preventDefault();
        t.toggle();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

function isSpace(e: KeyboardEvent): boolean {
  return e.key === " " || e.code === "Space";
}
