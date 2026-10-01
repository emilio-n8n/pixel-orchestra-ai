/**
 * Timeline toolbar (spec B.1).
 *
 * Left: tool cluster (select V, split C, delete, undo/redo).
 * Centre: SMPTE timecode + play/pause + total project duration.
 * Right: horizontal zoom slider driving `pxPerMs`.
 *
 * Pure presentation — every action goes through the shared timeline context
 * or the zoom store, so the toolbar has no state of its own.
 */

import { useCallback } from "react";
import {
  Minus,
  MousePointer2,
  Pause,
  Play,
  Plus,
  Redo2,
  Scissors,
  Trash2,
  Undo2,
} from "lucide-react";
import { useProjectTimeline } from "@/plugins/ui-timeline/ProjectTimelineProvider";
import { useZoomStore, zoomToPxPerMs } from "@/plugins/ui-timeline/zoom";
import { useToolStore } from "@/plugins/ui-timeline/tools";
import { formatSmpte } from "@/plugins/ui-timeline/smpte";
import { UI_LABELS } from "@/lib/ui/labels";
import { useHistoryStore } from "@/plugins/ui-timeline/history";

const T = UI_LABELS.timeline;
const FOCUS =
  "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--accent)]";

function ToolButton({
  label,
  shortcut,
  onClick,
  disabled,
  active,
  children,
}: {
  label: string;
  shortcut?: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={shortcut ? `${label} — ${shortcut}` : label}
      aria-label={label}
      aria-pressed={active}
      className={`ghost-btn h-7 w-7 rounded-md disabled:opacity-35 ${FOCUS} ${
        active ? "bg-[var(--accent-quiet)] text-[var(--accent-strong)]" : ""
      }`}
    >
      {children}
    </button>
  );
}

export function TimelineToolbar() {
  const { playhead, totalMs, playing, toggle, deleteClip, selectedClipId, seek, clips } =
    useProjectTimeline();
  const zoom = useZoomStore((s) => s.zoom);
  const setZoom = useZoomStore((s) => s.setZoom);
  const stepZoom = useZoomStore((s) => s.step);
  const tool = useToolStore((s) => s.tool);
  const setTool = useToolStore((s) => s.setTool);
  // Subscribing to the stacks (rather than the canUndo/canRedo predicates)
  // is what makes the buttons re-render as history fills up.
  const pastLength = useHistoryStore((s) => s.past.length);
  const futureLength = useHistoryStore((s) => s.future.length);
  const undo = useHistoryStore((s) => s.undo);
  const redo = useHistoryStore((s) => s.redo);
  const push = useHistoryStore((s) => s.push);

  /** Every destructive button records the pre-edit list first. */
  const pushHistory = useCallback(() => push(clips), [push, clips]);

  return (
    <div className="flex h-10 shrink-0 items-center gap-2 border-b border-[var(--line)] bg-[var(--surface-2)] px-2">
      {/* Left — tools */}
      <div className="flex items-center gap-0.5">
        <ToolButton
          label={T.outilSelecteur}
          shortcut="V"
          active={tool === "select"}
          onClick={() => setTool("select")}
        >
          <MousePointer2 size={13} />
        </ToolButton>
        <ToolButton
          label={T.outilCiseaux}
          shortcut="C"
          active={tool === "scissors"}
          onClick={() => setTool("scissors")}
        >
          <Scissors size={13} />
        </ToolButton>
        <ToolButton
          label={T.outilSupprimer}
          shortcut="Suppr"
          onClick={() => {
            if (!selectedClipId) return;
            pushHistory();
            void deleteClip(selectedClipId, { ripple: false });
          }}
          disabled={!selectedClipId}
        >
          <Trash2 size={13} />
        </ToolButton>
        <span className="mx-1 h-4 w-px bg-[var(--line)]" />
        <ToolButton label={T.undo} shortcut="⌘Z" onClick={undo} disabled={pastLength === 0}>
          <Undo2 size={13} />
        </ToolButton>
        <ToolButton label={T.redo} shortcut="⇧⌘Z" onClick={redo} disabled={futureLength === 0}>
          <Redo2 size={13} />
        </ToolButton>
      </div>

      {/* Centre — SMPTE timecode + transport */}
      <div className="flex flex-1 items-center justify-center gap-2">
        <button
          type="button"
          onClick={toggle}
          className={`touch-44 flex h-7 w-7 items-center justify-center rounded-md bg-[var(--surface-3)] text-[var(--text)] transition-colors hover:bg-[var(--accent-quiet)] ${FOCUS}`}
          title={T.astuceLecture}
          aria-label={playing ? T.pause : T.lecture}
        >
          {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
        </button>
        <button
          type="button"
          onClick={() => seek(0)}
          className={`mono rounded-md px-1.5 py-0.5 text-[12px] tabular-nums text-[var(--text)] transition-colors hover:bg-[var(--surface-3)] ${FOCUS}`}
          title={`${T.astuceCurseur} · ${formatSmpte(playhead)}`}
          aria-label={T.astuceCurseur}
        >
          {formatSmpte(playhead)}
        </button>
        <span className="mono text-[10.5px] text-[var(--text-dim)]">/ {formatSmpte(totalMs)}</span>
      </div>

      {/* Right — zoom */}
      <div className="flex shrink-0 items-center gap-1">
        <ToolButton label={T.zoomArriere} shortcut="⌘−" onClick={() => stepZoom(1 / 1.25)}>
          <Minus size={13} />
        </ToolButton>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={zoom}
          onChange={(e) => setZoom(Number(e.target.value))}
          title={`${T.zoomTimeline} — ${zoomToPxPerMs(zoom).toFixed(3)} px/ms`}
          aria-label={T.zoomTimeline}
          aria-valuetext={`${zoomToPxPerMs(zoom).toFixed(3)} px/ms`}
          className="w-24 accent-[var(--accent)] sm:w-32"
        />
        <ToolButton label={T.zoomAvant} shortcut="⌘+" onClick={() => stepZoom(1.25)}>
          <Plus size={13} />
        </ToolButton>
      </div>
    </div>
  );
}
