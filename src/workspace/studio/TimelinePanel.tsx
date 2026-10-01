/**
 * The bottom zone: the full-width NLE timeline (spec A.3).
 *
 * Composition only — the toolbar, the track grid and the state live in their
 * own modules, and everything they need comes from the shared
 * ProjectTimelineProvider. This component also owns the timeline keyboard
 * map (V / C / Delete / arrows / space / undo / redo), which has to live above
 * both the toolbar and the tracks to catch keys aimed at either.
 */

import { useProjectTimeline } from "@/plugins/ui-timeline/ProjectTimelineProvider";
import { UI_LABELS } from "@/lib/ui/labels";
import { ConnPill } from "@/lib/realtime/ConnPill";
import { Clapperboard } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { TimelineToolbar } from "./TimelineToolbar";
import { TimelineTracks } from "./TimelineTracks";
import { useTimelineHistoryBinding, useTimelineKeyboard } from "@/plugins/ui-timeline/keyboard";

const T = UI_LABELS.timeline;

export function TimelinePanel() {
  const { projectId, loadError, actionError, clearActionError, reload, conn } =
    useProjectTimeline();

  // Undo/redo needs the live clip list and a way to persist a restored one;
  // the keyboard map has to sit above both the toolbar and the tracks.
  useTimelineHistoryBinding();
  useTimelineKeyboard();

  if (!projectId) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <EmptyState icon={Clapperboard} title={T.sansProjet} description={T.sansProjetAide} />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[var(--surface-1)]">
      <div className="relative">
        <TimelineToolbar />
        <ConnPill state={conn} />
      </div>

      {loadError || actionError ? (
        <div
          role="alert"
          className="flex shrink-0 items-center justify-between gap-2 border-b border-[var(--status-err)]/30 bg-[var(--status-err)]/10 px-3 py-1.5 text-[11px] text-[var(--status-err)]"
        >
          <span className="truncate">{loadError ?? actionError}</span>
          <button
            onClick={() => {
              clearActionError();
              void reload();
            }}
            className="shrink-0 rounded border border-current px-1.5 py-px text-[10px] hover:bg-[var(--status-err)]/10"
          >
            {UI_LABELS.common.reessayer}
          </button>
        </div>
      ) : null}

      <TimelineTracks />
    </div>
  );
}
