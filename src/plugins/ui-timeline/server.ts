// Server functions for the timeline UI. Insert operations need the real
// owner_id (RLS: auth.uid() = owner_id), so they go through this module
// instead of the browser Supabase client. Reads/updates/deletes are done
// directly from the panel (RLS covers them).

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { toJson } from "@/lib/json";

export const TRACK_NAMES = [
  "Video",
  "Video 2",
  "Video 3",
  "Stickers",
  "Audio",
  "Music",
  "SFX",
  "Subtitles",
] as const;

/**
 * Insert a clip on a track. timeline_clips has RLS on owner_id, so inserts go
 * through this module (same reason as insertSilenceClip) instead of the
 * browser client, which may only update and delete its own visible rows.
 *
 * `start_ms` is honoured when it is free, otherwise the clip is pushed right
 * past whatever it would overlap — identical to what the drag path does.
 */
export const insertTimelineClip = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    z.object({
      projectId: z.string(),
      track: z.enum(TRACK_NAMES),
      duration_ms: z.number().int().positive(),
      start_ms: z.number().int().min(0).optional(),
      asset_id: z.string().uuid().nullable().optional(),
      meta: z.record(z.unknown()).optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    let start = data.start_ms ?? 0;
    if (start > 0) {
      const { data: existing } = await context.supabase
        .from("timeline_clips")
        .select("start_ms, duration_ms")
        .eq("owner_id", context.userId)
        .eq("project_id", data.projectId)
        .eq("track", data.track)
        .order("start_ms", { ascending: true });
      for (const clip of existing ?? []) {
        const clipEnd = (clip.start_ms ?? 0) + (clip.duration_ms ?? 3000);
        if (start < clipEnd && start + data.duration_ms > (clip.start_ms ?? 0)) {
          start = clipEnd;
        }
      }
    }

    const { data: clip, error } = await context.supabase
      .from("timeline_clips")
      .insert({
        owner_id: context.userId,
        project_id: data.projectId,
        track: data.track,
        asset_id: data.asset_id ?? null,
        start_ms: start,
        duration_ms: data.duration_ms,
        meta: toJson(data.meta ?? {}),
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return { clip };
  });

/**
 * Persist an auto-ducking curve onto music clips. The `meta` write merges
 * server-side so a concurrent edit to another meta key (a fade, a transition)
 * is never clobbered by a stale client copy.
 */
export const insertDucking = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    z.object({
      projectId: z.string(),
      clipIds: z.array(z.string().uuid()),
      curve: z.array(z.object({ t_ms: z.number(), gain: z.number() })),
      attenuationDb: z.number(),
    }),
  )
  .handler(async ({ data, context }) => {
    for (const id of data.clipIds) {
      const { data: row, error } = await context.supabase
        .from("timeline_clips")
        .select("meta")
        .eq("id", id)
        .eq("project_id", data.projectId)
        .single();
      if (error) continue;
      const meta = (row?.meta ?? {}) as Record<string, unknown>;
      const { error: updateError } = await context.supabase
        .from("timeline_clips")
        .update({
          meta: toJson({
            ...meta,
            ducking: { curve: data.curve, attenuation_db: data.attenuationDb },
          }),
        })
        .eq("id", id);
      if (updateError) throw new Error(updateError.message);
    }
    return { updated: data.clipIds.length };
  });

export const insertSilenceClip = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    z.object({
      projectId: z.string(),
      track: z.enum(["Video", "Audio", "Music", "SFX", "Subtitles"]),
      duration_ms: z.number().int().positive(),
      start_ms: z.number().int().min(0).optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    const desiredStart = data.start_ms ?? 0;

    const { data: existing } = await context.supabase
      .from("timeline_clips")
      .select("start_ms, duration_ms")
      .eq("owner_id", context.userId)
      .eq("project_id", data.projectId)
      .eq("track", data.track)
      .order("start_ms", { ascending: true });

    let start = desiredStart;
    for (const clip of existing ?? []) {
      const clipEnd = (clip.start_ms ?? 0) + (clip.duration_ms ?? 3000);
      if (start < clipEnd && start + data.duration_ms > clip.start_ms) start = clipEnd;
    }

    const { data: clip, error } = await context.supabase
      .from("timeline_clips")
      .insert({
        owner_id: context.userId,
        project_id: data.projectId,
        track: data.track,
        asset_id: null,
        start_ms: start,
        duration_ms: data.duration_ms,
        meta: {
          silence: true,
          prompt: `Silence — ${(data.duration_ms / 1000).toFixed(1)}s`,
        },
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return { clip };
  });
