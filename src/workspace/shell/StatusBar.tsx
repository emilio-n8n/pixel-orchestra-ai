import { Cloud, Terminal } from "lucide-react";
import { useKernel, useKernelEvents } from "@/kernel/react";
import { usePanelStore } from "@/stores/panels";
import { StatusPill } from "@/components/ui/status-pill";
import { UI_LABELS } from "@/lib/ui/labels";
import { useProjectTimeline } from "@/plugins/ui-timeline/ProjectTimelineProvider";

/**
 * Calm production status bar. Technical internals (plugin count, executors,
 * raw event stream) live behind the developer drawer instead of being shown
 * permanently.
 *
 * Studio V2 removed the panel show/hide toggles: all four zones are always
 * on screen, so there is nothing left to collapse — only the dev drawer.
 */
export function StatusBar() {
  const { host, scheduler } = useKernel();
  const events = useKernelEvents(24);
  const last = events[events.length - 1];
  const devMode = usePanelStore((s) => s.devMode);
  const setDevMode = usePanelStore((s) => s.setDevMode);
  // The provider is only mounted inside the studio shell; the bar renders
  // below it, so the context is always available here.
  const { clips, totalMs, selectedClipId } = useProjectTimeline();

  const runningJobs = events.filter(
    (e) => e.type === "JobQueued" || e.type === "JobStarted",
  ).length;

  return (
    <div className="pb-safe relative shrink-0 border-t border-[var(--line)] bg-[var(--rail)]">
      {devMode ? (
        <div className="animate-fade-in max-h-48 overflow-auto border-b border-[var(--line)] bg-[var(--surface-1)] px-3 py-2">
          <div className="t-meta mb-1.5 flex items-center justify-between gap-2">
            <span>{UI_LABELS.shell.journalDev}</span>
            <span>
              {host.count()} plugins · {scheduler.count()} exécuteurs
            </span>
          </div>
          {events.length === 0 ? (
            <div className="t-caption">{UI_LABELS.shell.aucunEvenement}</div>
          ) : (
            <ul className="space-y-0.5">
              {[...events].reverse().map((e, i) => (
                <li key={i} className="mono text-[10.5px] text-[var(--text-dim)]">
                  {new Date(e.ts).toLocaleTimeString("fr-FR")} · {e.type}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      <div className="flex h-8 items-center justify-between gap-2 px-2 text-[11px] text-[var(--text-dim)] sm:px-3">
        <div className="flex min-w-0 items-center gap-2 sm:gap-4">
          <StatusPill tone="done">{UI_LABELS.shell.studioPret}</StatusPill>
          <span className="mono hidden items-center gap-1.5 sm:flex">
            {UI_LABELS.timeline.plans(clips.length)} · {Math.round(totalMs / 1000)}s
          </span>
          <span className="hidden items-center gap-1.5 lg:flex">
            <Cloud size={12} /> {UI_LABELS.shell.renduCloud}
          </span>
          <span className="hidden items-center gap-1.5 lg:flex">
            {UI_LABELS.shell.stockage}{" "}
            <span className="text-[var(--text-muted)]">{UI_LABELS.shell.stockageValeur}</span>
          </span>
          {runningJobs > 0 ? (
            <StatusPill tone="running" pulse>
              {UI_LABELS.shell.tachesEnCours(runningJobs)}
            </StatusPill>
          ) : (
            <span className="hidden sm:inline">{UI_LABELS.shell.aucuneTache}</span>
          )}
          {selectedClipId ? (
            <span className="hidden truncate text-[var(--text-dim)] md:inline">
              {UI_LABELS.shell.planSelectionne}
            </span>
          ) : null}
          {devMode && last ? (
            <span className="mono hidden text-[10.5px] opacity-70 md:inline">{last.type}</span>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
          <button
            onClick={() => setDevMode(!devMode)}
            title={UI_LABELS.shell.modeDev}
            aria-label={UI_LABELS.shell.modeDev}
            aria-pressed={devMode}
            className={`ghost-btn h-7 w-7 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] ${devMode ? "text-[var(--text)]" : "text-[var(--text-dim)] opacity-60"}`}
          >
            <Terminal size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}
