/**
 * The single owner of the project's timeline state (spec A.3 / B).
 *
 * The NLE, the player monitor, the library panel and the agent all read and
 * write the same clips, playhead and selection, so that state lives here
 * instead of inside a 1 700-line panel component. Responsibilities:
 *
 *  - load + realtime-subscribe the clip list and the markers
 *  - own the playhead, transport state and the rAF playback loop
 *  - persist every mutation to Supabase (with the offline write queue)
 *  - mirror user edits onto the event bus so the agent stays in sync
 *
 * Rendering (canvas, tracks, toolbar) lives in the sibling modules; this
 * provider deliberately renders nothing.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { supabase } from "@/integrations/supabase/client";
import { useKernel } from "@/kernel/react";
import { useSupabaseChannel, type ConnState } from "@/lib/realtime/channel";
import { isOfflineError, nextBackoff, useOnlineStatus } from "@/lib/realtime/online";
import { useLibraryProject } from "@/plugins/library/project";
import { UI_LABELS } from "@/lib/ui/labels";
import { AUDIO_LOOKAHEAD_MS, MIN_DURATION_MS, snapMs, type TimelineClip } from "./store";
import { clipsUnderPlayhead, splitClipAt } from "./split";
import { insertTimelineClip, TRACK_NAMES } from "./server";
import { registerTimelineReload } from "@/plugins/director/useTimelineReload";

export interface ProjectMarker {
  id: string;
  t_ms: number;
  label: string;
}

type ClipPatch = { start_ms?: number; duration_ms?: number; track?: string };

interface TimelineContextValue {
  projectId: string | null;
  clips: TimelineClip[];
  markers: ProjectMarker[];
  totalMs: number;
  /** Minimum project length so an empty timeline still has a usable range. */
  MIN_TOTAL_MS: number;
  playing: boolean;
  playhead: number;
  selectedClipId: string | null;
  selectedClip: TimelineClip | null;
  selectClip: (id: string | null) => void;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  stop: () => void;
  /** Absolute seek, clamped to the project length. */
  seek: (ms: number) => void;
  /** Fast seek used by the rAF loop: no React re-render. */
  seekFast: (ms: number) => void;
  /** Split the selected clip, or every clip under the playhead. */
  splitAtPlayhead: (scope: "selected" | "all") => Promise<number>;
  deleteClip: (id: string, opts?: { ripple?: boolean }) => Promise<void>;
  updateClip: (id: string, patch: ClipPatch) => Promise<void>;
  /** Optimistic local patch — the realtime channel confirms a frame later. */
  patchClipLocal: (id: string, patch: Partial<TimelineClip>) => void;
  /** Move a clip after any overlap on `track` (shared with the server). */
  resolveNoOverlap: (
    track: string,
    startMs: number,
    durationMs: number,
    excludeId?: string,
  ) => number;
  insertAssetClip: (args: {
    assetId: string;
    track: string;
    startMs: number;
    durationMs: number;
    name: string;
    mime: string;
  }) => Promise<void>;
  reload: () => Promise<void>;
  conn: ConnState;
  loadError: string | null;
  actionError: string | null;
  clearActionError: () => void;
}

const TimelineContext = createContext<TimelineContextValue | null>(null);

/** Floor for the project length: an empty timeline is still 10 s wide. */
const MIN_TOTAL_MS = 10000;

export function ProjectTimelineProvider({ children }: { children: ReactNode }) {
  const projectId = useLibraryProject();
  const { events } = useKernel();
  const [clips, setClips] = useState<TimelineClip[]>([]);
  const [markers, setMarkers] = useState<ProjectMarker[]>([]);
  const [playing, setPlaying] = useState(false);
  const [playhead, setPlayhead] = useState(0);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Hot-path refs: the rAF loop and the drag handlers must never read React
  // state (a 60 fps loop through setState would re-render the whole studio).
  const clipsRef = useRef<TimelineClip[]>([]);
  const playheadRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const lastUiUpdateRef = useRef(0);
  const totalMsRef = useRef(MIN_TOTAL_MS);
  const pendingWritesRef = useRef<Map<string, ClipPatch>>(new Map());
  const selectedRef = useRef<string | null>(null);

  clipsRef.current = clips;
  selectedRef.current = selectedClipId;

  const totalMs = useMemo(
    () => Math.max(MIN_TOTAL_MS, ...clips.map((c) => c.start_ms + c.duration_ms)),
    [clips],
  );
  useEffect(() => {
    totalMsRef.current = totalMs;
  }, [totalMs]);

  const selectedClip = useMemo(
    () => clips.find((c) => c.id === selectedClipId) ?? null,
    [clips, selectedClipId],
  );

  /* ----------------- load + realtime ----------------- */
  const online = useOnlineStatus();
  const loadAttempt = useRef(0);
  const loadTimer = useRef<number | null>(null);

  const loadMarkers = useCallback(async () => {
    if (!projectId) return;
    try {
      const { data, error } = await supabase
        .from("project_markers")
        .select("id, t_ms, label")
        .eq("project_id", projectId)
        .order("t_ms", { ascending: true });
      if (error) throw error;
      setMarkers((data ?? []) as ProjectMarker[]);
    } catch {
      /* markers are decorative — the timeline works without them */
    }
  }, [projectId]);

  const loadClips = useCallback(async () => {
    if (!projectId) return;
    if (loadTimer.current != null) {
      window.clearTimeout(loadTimer.current);
      loadTimer.current = null;
    }
    try {
      const { data, error } = await supabase
        .from("timeline_clips")
        .select("id, track, start_ms, duration_ms, asset_id, meta, assets(kind, url, prompt)")
        .eq("project_id", projectId)
        .order("track")
        .order("start_ms");
      if (error) throw error;
      loadAttempt.current = 0;
      setLoadError(null);
      setClips((data ?? []) as unknown as TimelineClip[]);
    } catch (e) {
      if (isOfflineError(e)) return; // silent; the online event reloads
      setLoadError(UI_LABELS.timeline.erreurChargement);
      const delay = nextBackoff(loadAttempt.current++);
      loadTimer.current = window.setTimeout(() => {
        loadTimer.current = null;
        void loadClips();
      }, delay);
    }
  }, [projectId]);

  const reload = useCallback(async () => {
    await Promise.all([loadClips(), loadMarkers()]);
  }, [loadClips, loadMarkers]);

  useEffect(() => {
    setClips([]);
    setMarkers([]);
    setPlayhead(0);
    playheadRef.current = 0;
    void loadClips();
    void loadMarkers();
    return () => {
      if (loadTimer.current != null) window.clearTimeout(loadTimer.current);
    };
  }, [loadClips, loadMarkers]);

  // Auto-flush on reconnect: reload server truth, then replay queued writes.
  const wasOnline = useRef(online);
  useEffect(() => {
    const back = online && !wasOnline.current;
    wasOnline.current = online;
    if (!back) return;
    loadAttempt.current = 0;
    void loadClips();
    const queued = [...pendingWritesRef.current];
    pendingWritesRef.current.clear();
    if (queued.length === 0) return;
    void (async () => {
      for (const [id, patch] of queued) {
        try {
          await supabase.from("timeline_clips").update(patch).eq("id", id);
        } catch (e) {
          if (isOfflineError(e)) {
            pendingWritesRef.current.set(id, {
              ...(pendingWritesRef.current.get(id) ?? {}),
              ...patch,
            });
          }
        }
      }
      void loadClips();
    })();
  }, [online, loadClips]);

  const conn = useSupabaseChannel({
    name: projectId ? `clips:${projectId}` : null,
    build: (signal) =>
      supabase
        .channel(`clips:${projectId}` as string)
        .on(
          "postgres_changes" as never,
          {
            event: "*",
            schema: "public",
            table: "timeline_clips",
            filter: `project_id=eq.${projectId}`,
          },
          signal,
        )
        .on(
          "postgres_changes" as never,
          { event: "*", schema: "public", table: "assets", filter: `project_id=eq.${projectId}` },
          signal,
        )
        .on(
          "postgres_changes" as never,
          {
            event: "*",
            schema: "public",
            table: "project_markers",
            filter: `project_id=eq.${projectId}`,
          },
          signal,
        ),
    onEvent: () => {
      void loadClips();
      void loadMarkers();
    },
  });
  const connState: ConnState = online ? conn : "offline";

  /* ----------------- mutations ----------------- */
  const patchClipLocal = useCallback((id: string, patch: Partial<TimelineClip>) => {
    setClips((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }, []);

  const emitEdit = useCallback(
    (payload: {
      clipId: string;
      track: string;
      action: "move" | "trim" | "split" | "delete" | "volume";
      start_ms?: number;
      duration_ms?: number;
    }) => {
      events.emit({
        ...payload,
        type: "TimelineClipEdited",
        projectId: projectId ?? undefined,
      });
    },
    [events, projectId],
  );

  const updateClip = useCallback(
    async (id: string, patch: ClipPatch) => {
      try {
        await supabase.from("timeline_clips").update(patch).eq("id", id);
        pendingWritesRef.current.delete(id);
        const clip = clipsRef.current.find((c) => c.id === id);
        if (clip) {
          emitEdit({
            clipId: id,
            track: patch.track ?? clip.track,
            action: patch.start_ms != null ? "move" : "trim",
            start_ms: patch.start_ms ?? clip.start_ms,
            duration_ms: patch.duration_ms ?? clip.duration_ms,
          });
        }
      } catch (e) {
        if (isOfflineError(e)) {
          // Offline: queue last-write-wins per clip, replayed on reconnect.
          pendingWritesRef.current.set(id, {
            ...(pendingWritesRef.current.get(id) ?? {}),
            ...patch,
          });
          return;
        }
        /* the realtime channel keeps the UI in sync; ignore transient errors */
      }
    },
    [emitEdit],
  );

  const resolveNoOverlap = useCallback(
    (track: string, startMs: number, durationMs: number, excludeId?: string) => {
      let start = Math.max(0, snapMs(startMs));
      const others = clipsRef.current
        .filter((c) => c.track === track && c.id !== excludeId)
        .sort((a, b) => a.start_ms - b.start_ms);
      for (const o of others) {
        const oEnd = o.start_ms + o.duration_ms;
        if (start < oEnd && start + durationMs > o.start_ms) start = oEnd;
      }
      return start;
    },
    [],
  );

  const selectClip = useCallback((id: string | null) => setSelectedClipId(id), []);

  // Selection changes reach the event bus from an effect so the emitter
  // always sees the current projectId without re-creating the callback.
  useEffect(() => {
    events.emit({
      type: "TimelineSelectionChanged",
      clipId: selectedClipId,
      projectId: projectId ?? undefined,
      track: selectedClip?.track,
    });
  }, [events, selectedClipId, selectedClip?.track, projectId]);

  const deleteClip = useCallback(
    async (id: string, opts: { ripple?: boolean } = {}) => {
      const clip = clipsRef.current.find((c) => c.id === id);
      if (!clip) return;
      const ripple = opts.ripple ?? false;
      setActionError(null);
      const removedEnd = clip.start_ms + clip.duration_ms;
      const later = ripple
        ? clipsRef.current.filter(
            (c) => c.track === clip.track && c.start_ms >= removedEnd && c.id !== id,
          )
        : [];
      // Optimistic: the realtime channel confirms a frame later.
      setClips((prev) => {
        const rest = prev.filter((c) => c.id !== id);
        if (!ripple) return rest;
        return rest.map((c) =>
          later.some((l) => l.id === c.id)
            ? { ...c, start_ms: Math.max(0, c.start_ms - clip.duration_ms) }
            : c,
        );
      });
      if (selectedRef.current === id) setSelectedClipId(null);
      try {
        await supabase.from("timeline_clips").delete().eq("id", id);
        if (later.length > 0) {
          await Promise.all(
            later.map((c) =>
              supabase
                .from("timeline_clips")
                .update({ start_ms: Math.max(0, c.start_ms - clip.duration_ms) })
                .eq("id", c.id),
            ),
          );
        }
        emitEdit({
          clipId: id,
          track: clip.track,
          action: "delete",
          start_ms: clip.start_ms,
          duration_ms: clip.duration_ms,
        });
      } catch (e) {
        if (isOfflineError(e)) {
          // The server never saw the delete: roll back and say so once.
          setClips((prev) => {
            const restored = [...prev, clip];
            if (!ripple) return restored;
            return restored.map((c) =>
              later.some((l) => l.id === c.id)
                ? { ...c, start_ms: c.start_ms + clip.duration_ms }
                : c,
            );
          });
          setActionError(UI_LABELS.timeline.erreurHorsLigne);
          return;
        }
        setActionError(UI_LABELS.timeline.erreurSuppression);
      }
    },
    [emitEdit],
  );

  const splitAtPlayhead = useCallback(
    async (scope: "selected" | "all") => {
      const at = playheadRef.current;
      const targets =
        scope === "selected"
          ? clipsRef.current.filter((c) => c.id === selectedRef.current)
          : clipsUnderPlayhead(clipsRef.current, at);
      if (targets.length === 0) return 0;
      setActionError(null);
      let done = 0;
      for (const clip of targets) {
        const result = splitClipAt(clip, at);
        if (!result) continue;
        try {
          // The left half keeps the original id (no row churn); the right
          // half is a new row inserted right after it.
          await supabase
            .from("timeline_clips")
            .update({ duration_ms: result.left.duration_ms })
            .eq("id", clip.id);
          // The right half is a new row: inserts need the owner id, so they
          // go through the server helper rather than the browser client.
          const inserted = await insertTimelineClip({
            data: {
              projectId: projectId ?? "",
              track: clip.track as (typeof TRACK_NAMES)[number],
              asset_id: clip.asset_id,
              start_ms: result.right.start_ms,
              duration_ms: result.right.duration_ms,
              meta: result.right.meta ?? {},
            },
          });
          pendingWritesRef.current.delete(clip.id);
          emitEdit({
            clipId: clip.id,
            track: clip.track,
            action: "split",
            start_ms: at,
            duration_ms: result.left.duration_ms,
          });
          done += 1;
          if (inserted.clip) selectClip(inserted.clip.id);
        } catch (e) {
          setActionError(
            isOfflineError(e)
              ? UI_LABELS.timeline.erreurHorsLigne
              : UI_LABELS.timeline.erreurSuppression,
          );
          break;
        }
      }
      void loadClips();
      return done;
    },
    [projectId, emitEdit, loadClips, selectClip],
  );

  const insertAssetClip = useCallback(
    async (args: {
      assetId: string;
      track: string;
      startMs: number;
      durationMs: number;
      name: string;
      mime: string;
    }) => {
      if (!projectId) return;
      setActionError(null);
      try {
        // Inserts go through the server helper: timeline_clips has RLS on
        // owner_id, so the browser client cannot author new rows.
        await insertTimelineClip({
          data: {
            projectId,
            track: args.track as (typeof TRACK_NAMES)[number],
            asset_id: args.assetId,
            start_ms: Math.max(0, snapMs(args.startMs)),
            duration_ms: Math.max(MIN_DURATION_MS, Math.round(args.durationMs)),
            meta: { prompt: args.name, mime: args.mime },
          },
        });
      } catch (e) {
        setActionError(
          isOfflineError(e) ? UI_LABELS.timeline.erreurHorsLigne : (e as Error).message,
        );
        return;
      }
      await loadClips();
    },
    [projectId, loadClips],
  );

  const clearActionError = useCallback(() => setActionError(null), []);

  /* ----------------- transport ----------------- */
  const seekFast = useCallback(
    (ms: number) => {
      const clamped = Math.max(0, Math.min(totalMsRef.current, Math.round(ms)));
      playheadRef.current = clamped;
      setPlayhead(clamped);
      events.emit({ type: "TimelineSeeked", t_ms: clamped, projectId: projectId ?? undefined });
    },
    [events, projectId],
  );

  const seek = useCallback(
    (ms: number) => {
      seekFast(ms);
    },
    [seekFast],
  );

  const play = useCallback(() => setPlaying(true), []);
  const pause = useCallback(() => setPlaying(false), []);
  const toggle = useCallback(() => setPlaying((p) => !p), []);
  const stop = useCallback(() => {
    setPlaying(false);
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    playheadRef.current = 0;
    setPlayhead(0);
  }, []);

  // rAF transport: the UI mirror updates at ~10 Hz, the ref at 60 fps.
  useEffect(() => {
    if (!playing) return;
    const startFrom = playheadRef.current >= totalMsRef.current ? 0 : playheadRef.current;
    playheadRef.current = startFrom;
    const startedAt = performance.now();

    function tick() {
      const p = startFrom + (performance.now() - startedAt);
      if (p >= totalMsRef.current) {
        playheadRef.current = totalMsRef.current;
        setPlayhead(totalMsRef.current);
        setPlaying(false);
        return;
      }
      playheadRef.current = p;
      const now = performance.now();
      if (now - lastUiUpdateRef.current >= 100) {
        lastUiUpdateRef.current = now;
        setPlayhead(p);
      }
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [playing]);

  // Publish an imperative reload handle for callers that live outside the
  // provider's subtree (the prompt bar, the SFX generator).
  useEffect(() => {
    registerTimelineReload(reload);
    return () => registerTimelineReload(null);
  }, [reload]);

  const value = useMemo<TimelineContextValue>(
    () => ({
      projectId,
      clips,
      markers,
      totalMs,
      MIN_TOTAL_MS,
      playing,
      playhead,
      selectedClipId,
      selectedClip,
      selectClip,
      play,
      pause,
      toggle,
      stop,
      seek,
      seekFast,
      splitAtPlayhead,
      deleteClip,
      updateClip,
      patchClipLocal,
      resolveNoOverlap,
      insertAssetClip,
      reload,
      conn: connState,
      loadError,
      actionError,
      clearActionError,
    }),
    [
      projectId,
      clips,
      markers,
      totalMs,
      playing,
      playhead,
      selectedClipId,
      selectedClip,
      selectClip,
      play,
      pause,
      toggle,
      stop,
      seek,
      seekFast,
      splitAtPlayhead,
      deleteClip,
      updateClip,
      patchClipLocal,
      resolveNoOverlap,
      insertAssetClip,
      reload,
      connState,
      loadError,
      actionError,
      clearActionError,
    ],
  );

  return <TimelineContext.Provider value={value}>{children}</TimelineContext.Provider>;
}

export function useProjectTimeline(): TimelineContextValue {
  const ctx = useContext(TimelineContext);
  if (!ctx) throw new Error("useProjectTimeline must be used within <ProjectTimelineProvider>");
  return ctx;
}

/** Audio-lookahead constant re-exported for the player engine. */
export { AUDIO_LOOKAHEAD_MS };
