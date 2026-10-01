/**
 * One-click SFX generation and placement (spec E.2).
 *
 * The built-in catalogue is synthesised in the browser (sfx.ts), imported as a
 * normal asset, then dropped on the SFX track at the playhead. Going through
 * the regular import path means the result inherits everything the pipeline
 * already has: envelopes, ducking, export, and the agent's view of the track.
 */

import { useCallback, useState } from "react";
import { importAsset } from "@/plugins/library/server";
import { useLibraryProject } from "@/plugins/library/project";
import { useProjectTimeline } from "./ProjectTimelineProvider";
import { renderSfxWav, sfxPreset } from "./sfx";
import { primeWaveform } from "./AudioWaveformCanvas";
import { insertTimelineClip, TRACK_NAMES } from "./server";
import { UI_LABELS } from "@/lib/ui/labels";
import { snapMs } from "./store";

const SFX_TRACK = "SFX";

export function useSfxDrop() {
  const projectId = useLibraryProject();
  const { playhead, resolveNoOverlap, reload, clips } = useProjectTimeline();
  const [busy, setBusy] = useState(false);

  const dropSfx = useCallback(
    async (id: string) => {
      const preset = sfxPreset(id);
      if (!preset || !projectId || busy) return;
      setBusy(true);
      try {
        const blob = renderSfxWav(preset);
        const bytes = new Uint8Array(await blob.arrayBuffer());
        let bin = "";
        for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]);

        const res = await importAsset({
          data: {
            projectId,
            name: `${preset.label}.wav`,
            mime: "audio/wav",
            bytesBase64: btoa(bin),
          },
        });
        const asset = res.asset;
        if (!asset) return;

        // Append after the last SFX clip, or at the playhead — whichever the
        // user is looking at, snapped and overlap-resolved like a manual drop.
        const lastSfxEnd = clips
          .filter((c) => c.track === SFX_TRACK)
          .reduce((max, c) => Math.max(max, c.start_ms + c.duration_ms), 0);
        const start = resolveNoOverlap(
          SFX_TRACK,
          snapMs(Math.max(playhead, lastSfxEnd)),
          preset.durationMs,
        );

        await insertClipRow({
          projectId,
          assetId: asset.id,
          track: SFX_TRACK,
          startMs: start,
          durationMs: preset.durationMs,
          name: preset.label,
          mime: "audio/wav",
        });
        // Warm the waveform cache so the new chip shows peaks on first paint
        // instead of a flat line while it decodes.
        if (asset.url) primeWaveform(asset.url);
        await reload();
      } catch {
        /* the import surfaces its own error; never crash the toolbar */
      } finally {
        setBusy(false);
      }
    },
    [projectId, busy, playhead, clips, resolveNoOverlap, reload],
  );

  return { dropSfx, busy, label: UI_LABELS.timeline.sfxTitre };
}

/**
 * Insert the generated clip. timeline_clips has RLS on owner_id, so the write
 * goes through the server helper — the same path the agent's own
 * `add_to_timeline` tool uses.
 */
async function insertClipRow(args: {
  projectId: string;
  assetId: string;
  track: string;
  startMs: number;
  durationMs: number;
  name: string;
  mime: string;
}): Promise<void> {
  await insertTimelineClip({
    data: {
      projectId: args.projectId,
      track: args.track as (typeof TRACK_NAMES)[number],
      asset_id: args.assetId,
      start_ms: Math.max(0, Math.round(args.startMs)),
      duration_ms: Math.max(100, Math.round(args.durationMs)),
      meta: { prompt: args.name, mime: args.mime, sfx: true },
    },
  });
}
