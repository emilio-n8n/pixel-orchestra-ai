// Server functions for the timeline UI. Insert operations need the real
// owner_id (RLS: auth.uid() = owner_id), so they go through this module
// instead of the browser Supabase client. Reads/updates/deletes are done
// directly from the panel (RLS covers them).

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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
