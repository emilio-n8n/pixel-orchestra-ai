/**
 * Undo / redo for timeline edits (spec B.1).
 *
 * Snapshot-based rather than inverse-command-based: every mutation pushes the
 * pre-edit clip list onto the undo stack, and undo/redo swaps whole lists.
 * A project holds hundreds of clips, not millions, so snapshots are cheap —
 * and unlike per-command inverses they cannot drift out of sync when a drag,
 * a trim and a split land on the same clip in one session.
 *
 * The caller supplies `getCurrent` (the live clip list) and `onRestore` (how
 * to persist a restored list); the store stays pure bookkeeping.
 */

import { create } from "zustand";
import type { TimelineClip } from "./store";

/** Deep-ish copy: clips are flat objects with a `meta` bag. */
function snapshot(clips: TimelineClip[]): TimelineClip[] {
  return clips.map((c) => ({ ...c, meta: c.meta ? { ...c.meta } : c.meta }));
}

const MAX_HISTORY = 50;

interface HistoryState {
  past: TimelineClip[][];
  future: TimelineClip[][];
  /** Live clip list — used to build the opposite branch on undo/redo. */
  getCurrent: (() => TimelineClip[]) | null;
  /** Persist + display a restored list. */
  onRestore: ((clips: TimelineClip[]) => void) | null;
  bind: (getCurrent: () => TimelineClip[], onRestore: (clips: TimelineClip[]) => void) => void;
  /** Record `before` as the state to return to on the next undo. */
  push: (before: TimelineClip[]) => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  undo: () => TimelineClip[] | null;
  redo: () => TimelineClip[] | null;
  clear: () => void;
}

export const useHistoryStore = create<HistoryState>((set, get) => ({
  past: [],
  future: [],
  getCurrent: null,
  onRestore: null,

  bind: (getCurrent, onRestore) => set({ getCurrent, onRestore }),

  push: (before) =>
    set((s) => ({
      // A new edit invalidates the redo branch.
      past: [...s.past, snapshot(before)].slice(-MAX_HISTORY),
      future: [],
    })),

  canUndo: () => get().past.length > 0,
  canRedo: () => get().future.length > 0,

  undo: () => {
    const { past, future, getCurrent, onRestore } = get();
    const previous = past[past.length - 1];
    if (!previous) return null;
    const current = getCurrent ? snapshot(getCurrent()) : [];
    set({ past: past.slice(0, -1), future: [...future, current] });
    onRestore?.(previous);
    return previous;
  },

  redo: () => {
    const { past, future, getCurrent, onRestore } = get();
    const next = future[future.length - 1];
    if (!next) return null;
    const current = getCurrent ? snapshot(getCurrent()) : [];
    set({ future: future.slice(0, -1), past: [...past, current] });
    onRestore?.(next);
    return next;
  },

  clear: () => set({ past: [], future: [] }),
}));
