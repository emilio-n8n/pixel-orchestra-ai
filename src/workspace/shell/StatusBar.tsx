import { Cloud, PanelBottom, PanelRight, Terminal } from "lucide-react";
import { useKernel, useKernelEvents } from "@/kernel/react";
import { usePanelStore } from "@/stores/panels";
import { StatusPill } from "@/components/ui/status-pill";

/**
 * Calm production status bar. Technical internals (plugin count, executors,
 * raw event stream) live behind the developer drawer instead of being shown
 * permanently.
 */
export function StatusBar() {
  const { host, scheduler } = useKernel();
  const events = useKernelEvents(24);
  const last = events[events.length - 1];
  const toggle = usePanelStore((s) => s.toggle);
  const bottomCollapsed = usePanelStore((s) => s.bottomCollapsed);
  const inspectorCollapsed = usePanelStore((s) => s.inspectorCollapsed);
  const devMode = usePanelStore((s) => s.devMode);
  const setDevMode = usePanelStore((s) => s.setDevMode);

  const runningJobs = events.filter(
    (e) => e.type === "JobQueued" || e.type === "JobStarted",
  ).length;

  return (
    <div className="relative shrink-0 border-t border-[var(--line)] bg-[var(--rail)]">
      {devMode ? (
        <div className="animate-fade-in max-h-48 overflow-auto border-b border-[var(--line)] bg-[var(--surface-1)] px-3 py-2">
          <div className="t-meta mb-1.5 flex items-center justify-between">
            <span>Journal développeur</span>
            <span>
              {host.count()} plugins · {scheduler.count()} exécuteurs
            </span>
          </div>
          {events.length === 0 ? (
            <div className="t-caption">Aucun évènement.</div>
          ) : (
            <ul className="space-y-0.5">
              {[...events].reverse().map((e, i) => (
                <li key={i} className="mono text-[10.5px] text-[var(--text-dim)]">
                  {new Date(e.ts).toLocaleTimeString()} · {e.type}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      <div className="flex h-7 items-center justify-between px-3 text-[11px] text-[var(--text-dim)]">
        <div className="flex items-center gap-4">
          <StatusPill tone="done">Studio prêt</StatusPill>
          <span className="flex items-center gap-1.5">
            <Cloud size={12} /> Rendu cloud
          </span>
          <span className="hidden items-center gap-1.5 md:flex">
            Stockage <span className="text-[var(--text-muted)]">Lilium Cloud</span>
          </span>
          {runningJobs > 0 ? (
            <StatusPill tone="running" pulse>
              {runningJobs} tâche{runningJobs > 1 ? "s" : ""} en cours
            </StatusPill>
          ) : (
            <span>Aucune tâche</span>
          )}
          {devMode && last ? (
            <span className="mono text-[10.5px] opacity-70">{last.type}</span>
          ) : null}
        </div>

        <div className="flex items-center gap-0.5">
          <IconToggle
            label="Timeline"
            on={!bottomCollapsed}
            onClick={() => toggle("bottom")}
            icon={<PanelBottom size={13} />}
          />
          <IconToggle
            label="Panneau IA"
            on={!inspectorCollapsed}
            onClick={() => toggle("inspector")}
            icon={<PanelRight size={13} />}
          />
          <IconToggle
            label="Mode développeur"
            on={devMode}
            onClick={() => setDevMode(!devMode)}
            icon={<Terminal size={13} />}
          />
        </div>
      </div>
    </div>
  );
}

function IconToggle({
  label,
  on,
  onClick,
  icon,
}: {
  label: string;
  on: boolean;
  onClick: () => void;
  icon: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={`ghost-btn h-6 w-6 ${on ? "text-[var(--text)]" : "text-[var(--text-dim)] opacity-60"}`}
    >
      {icon}
    </button>
  );
}
