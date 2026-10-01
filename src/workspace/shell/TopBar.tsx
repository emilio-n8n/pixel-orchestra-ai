/**
 * Header — 48 px (spec A.1).
 *
 * Left: the compact project picker with an inline-editable title.
 * Right: the primary Export action (dark, rounded, render icon) and a discreet
 * sync indicator. No module tabs: the studio is a single screen, so the
 * header only carries identity, global actions and status.
 */

import { Link } from "@tanstack/react-router";
import { Download, Keyboard, Search, Settings } from "lucide-react";
import { useKernel } from "@/kernel/react";
import { useProjectTimeline } from "@/plugins/ui-timeline/ProjectTimelineProvider";
import { ProjectPicker } from "@/workspace/studio/ProjectPicker";
import { UI_LABELS } from "@/lib/ui/labels";

const FOCUS =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]";

export function TopBar({
  workspaceId,
  projectId,
  onOpenCommand,
  onOpenShortcuts,
}: {
  workspaceId?: string;
  projectId?: string;
  onOpenCommand: () => void;
  onOpenShortcuts: () => void;
}) {
  return (
    <header className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-[var(--line)] bg-[var(--rail)] px-2 sm:px-3">
      <div className="flex min-w-0 flex-1 items-center gap-1 sm:gap-2">
        <Link
          to="/"
          aria-label="Lilium"
          className={`flex h-8 shrink-0 items-center rounded-lg px-1.5 transition-colors hover:bg-[var(--surface-2)] ${FOCUS}`}
        >
          <span
            aria-hidden
            className="inline-block h-[18px] w-[18px] rounded-[6px]"
            style={{
              background:
                "conic-gradient(from 210deg, var(--accent-strong), var(--accent), var(--accent-quiet), var(--accent))",
            }}
          />
        </Link>
        <ProjectPicker workspaceId={workspaceId} projectId={projectId} />
      </div>

      <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
        <SyncIndicator />
        <button
          onClick={onOpenCommand}
          title={`${UI_LABELS.shell.rechercher} (⌘K)`}
          aria-label={UI_LABELS.shell.rechercher}
          className={`flex h-8 items-center gap-2 rounded-lg border border-[var(--line)] bg-[var(--surface-2)] px-2 text-[12px] text-[var(--text-dim)] transition-colors hover:border-[var(--line-strong)] hover:text-[var(--text)] ${FOCUS}`}
        >
          <Search size={13} />
          <span className="hidden lg:inline">{UI_LABELS.shell.rechercher}</span>
        </button>
        <button
          onClick={onOpenShortcuts}
          title={UI_LABELS.raccourcis.titre}
          aria-label={UI_LABELS.raccourcis.titre}
          className={`ghost-btn h-8 w-8 ${FOCUS}`}
        >
          <Keyboard size={14} />
        </button>
        <Link
          to="/settings"
          className={`ghost-btn h-8 w-8 ${FOCUS}`}
          title={UI_LABELS.shell.parametres}
          aria-label={UI_LABELS.shell.parametres}
        >
          <Settings size={14} />
        </Link>
        <ExportButton />
      </div>
    </header>
  );
}

/**
 * Primary action. Dark rather than accent-coloured so it reads as the one
 * committed action in the header rather than another control.
 */
function ExportButton() {
  const { clips, loadError } = useProjectTimeline();
  const disabled = clips.length === 0 || !!loadError;
  return (
    <button
      type="button"
      disabled={disabled}
      title={UI_LABELS.timeline.exportVideo}
      aria-label={UI_LABELS.shell.exporter}
      className={`ml-1 flex h-8 items-center gap-1.5 rounded-lg bg-[var(--surface-4)] px-2.5 text-[12px] font-medium text-[var(--text)] transition-colors hover:bg-[var(--text)] hover:text-[var(--surface-0)] active:scale-[0.98] disabled:opacity-40 sm:px-3 ${FOCUS}`}
    >
      <Download size={13} />
      <span className="hidden sm:inline">{UI_LABELS.shell.exporter}</span>
    </button>
  );
}

/**
 * Discreet sync state, derived from the realtime connection. Silent when
 * everything is healthy — the pill only appears when something needs the
 * user's attention.
 */
function SyncIndicator() {
  const { conn } = useProjectTimeline();
  const { host } = useKernel();

  if (conn === "live") return null;
  const offline = conn === "offline";
  return (
    <span
      role="status"
      title={offline ? UI_LABELS.shell.syncErreur : UI_LABELS.shell.syncSync}
      className={`mono mr-1 hidden items-center gap-1 rounded-full border px-2 py-0.5 text-[9.5px] sm:inline-flex ${
        offline
          ? "border-[var(--status-err)]/40 text-[var(--status-err)]"
          : "border-[var(--status-warn)]/40 text-[var(--status-warn)]"
      }`}
    >
      <span
        className={`inline-block h-1 w-1 rounded-full ${
          offline ? "bg-[var(--status-err)]" : "bg-[var(--status-warn)] animate-pulse"
        }`}
      />
      {offline ? UI_LABELS.shell.syncErreur : UI_LABELS.shell.syncSync}
      <span className="text-[var(--text-dim)]">· {host.count()}</span>
    </span>
  );
}
