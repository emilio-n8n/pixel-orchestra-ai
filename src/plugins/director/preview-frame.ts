/**
 * `preview_frame` — the Director looks at an actual timeline frame.
 *
 * The chat loop runs on the server (no renderer there): the tool is
 * declared without `execute`, so the browser fulfils it — fetch the clips,
 * capture the frame with the export engine, ask the vision model for a
 * description, then hand that text back as the tool result.
 */
import { supabase } from "@/integrations/supabase/client";
import { UI_LABELS } from "@/lib/ui/labels";
import type { TimelineClip } from "@/plugins/ui-timeline/store";

export interface PreviewFrameInput {
  toolCallId: string;
  clipId: string;
  tMs?: number;
  focus?: string;
  projectId: string;
  apiKey: string;
  sessionId?: string;
  token: string | null;
}

export interface PreviewFrameOutput {
  clip_id: string;
  t_ms: number;
  description: string;
}

const CLIP_COLUMNS = "id, track, start_ms, duration_ms, asset_id, meta, assets(kind, url, prompt)";

/**
 * Last captured frames, keyed by tool call id — lets the panel show the
 * user exactly what the Director looked at. Bounded, never persisted
 * (the tool result itself stays text-only: a data URL in the history
 * would blow up every later request).
 */
const THUMB_LIMIT = 12;
const thumbnails = new Map<string, string>();

export function previewFrameThumbnail(toolCallId?: string): string | undefined {
  return toolCallId ? thumbnails.get(toolCallId) : undefined;
}

function rememberFrameThumbnail(toolCallId: string, dataUrl: string): void {
  thumbnails.set(toolCallId, dataUrl);
  while (thumbnails.size > THUMB_LIMIT) {
    const oldest = thumbnails.keys().next().value;
    if (oldest === undefined) break;
    thumbnails.delete(oldest);
  }
}

export async function runPreviewFrame(input: PreviewFrameInput): Promise<PreviewFrameOutput> {
  if (!input.projectId) throw new Error(UI_LABELS.director.sansProjet);
  if (!input.apiKey) throw new Error(UI_LABELS.director.cleRequise);

  const { data, error } = await supabase
    .from("timeline_clips")
    .select(CLIP_COLUMNS)
    .eq("project_id", input.projectId)
    .order("start_ms");
  if (error) throw new Error(UI_LABELS.director.frameChargement);

  const clips = (data ?? []) as unknown as TimelineClip[];
  const clip = clips.find((c) => c.id === input.clipId);
  if (!clip) throw new Error(UI_LABELS.director.planIntrouvable);

  // Browser-only engine: loaded on demand so the panel stays SSR-safe.
  const { captureTimelineFrame, previewFrameTime } = await import("@/plugins/ui-timeline/export");
  const t = previewFrameTime(clip, input.tMs);
  const imageDataUrl = await captureTimelineFrame(clips, clip, t);
  rememberFrameThumbnail(input.toolCallId, imageDataUrl);

  const res = await fetch("/api/director", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(input.token ? { Authorization: `Bearer ${input.token}` } : {}),
    },
    body: JSON.stringify({
      kind: "preview_frame",
      projectId: input.projectId,
      apiKey: input.apiKey,
      sessionId: input.sessionId,
      imageDataUrl,
      focus: input.focus,
    }),
  });
  if (!res.ok) {
    let extrait = "";
    try {
      extrait = (await res.text()).slice(0, 200);
    } catch {
      /* body unreadable */
    }
    throw new Error(`${UI_LABELS.director.frameVision}${extrait ? ` — ${extrait}` : ""}`);
  }
  const json = (await res.json()) as { description?: string };
  return {
    clip_id: clip.id,
    t_ms: t,
    description: String(json.description ?? "").trim(),
  };
}
