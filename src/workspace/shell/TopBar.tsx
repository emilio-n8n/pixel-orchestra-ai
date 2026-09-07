import { Link, useNavigate } from "@tanstack/react-router";
import { Bell, ChevronRight, Download, Keyboard, Search, Settings, Undo2, Redo2 } from "lucide-react";
import { useWorkspaceStore } from "@/stores/workspace";
import { usePanelStore } from "@/stores/panels";
import { UI_LABELS, moduleMeta } from "@/lib/ui/labels";

const FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]";

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
  const ws = useWorkspaceStore((s) => (workspaceId ? s.getWorkspace(workspaceId) : undefined));
  const project = useWorkspaceStore((s) => (projectId ? s.getProject(projectId) : undefined));
  const active = usePanelStore((s) => s.activeModule);
  const setActive = usePanelStore((s) => s.setActiveModule);
  const navigate = useNavigate();

  return (
    <header className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-[var(--line)] bg-[var(--rail)] px-2 sm:px-3">
      <div className="flex min-w-0 flex-1 items-center gap-0.5 sm:gap-1">
        <Link
          to="/"
          className={`flex h-8 shrink-0 items-center gap-2 rounded-lg px-2 text-[13px] font-semibold tracking-tight text-[var(--text)] transition-colors hover:bg-[var(--surface-2)] ${FOCUS}`}
        >
          <span
            aria-hidden
            className="inline-block h-[18px] w-[18px] rounded-[6px]"
            style={{
              background:
                "conic-gradient(from 210deg, var(--accent-strong), var(--accent), var(--accent-quiet), var(--accent))",
            }}
          />
          <span className="hidden xs:inline sm:inline">Lilium</span>
        </Link>
        <Crumb />
        {ws ? (
          <button
            onClick={() => navigate({ to: "/w/$wsId", params: { wsId: ws.id } })}
            className={`max-w-[110px] truncate rounded-lg px-2 py-1 text-[12.5px] text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text)] sm:max-w-[160px] ${FOCUS}`}
          >
            {ws.name}
          </button>
        ) : (
          <span className="px-2 py-1 text-[12.5px] text-[var(--text-dim)]">{UI_LABELS.shell.aucunEspace}</span>
        )}
        {project ? (
          <>
            <Crumb />
            <span className="max-w-[140px] truncate rounded-lg px-2 py-1 text-[12.5px] font-medium text-[var(--text)] sm:max-w-[220px]">
              {project.name}
            </span>
          </>
        ) : null}
      </div>

      <nav
        aria-label={moduleMeta("timeline").label}
        className="hidden items-center gap-0.5 rounded-lg bg-[var(--surface-2)] p-0.5 md:flex"
      >
        <SegmentTab label={moduleMeta("timeline").label} active={active === "timeline"} onClick={() => setActive("timeline")} />
        <SegmentTab label={moduleMeta("library").label} active={active === "library"} onClick={() => setActive("library")} />
        <SegmentTab label={moduleMeta("jobs").label} active={active === "jobs"} onClick={() => setActive("jobs")} />
      </nav>

      <div className="flex flex-1 items-center justify-end gap-0.5 sm:gap-1">
        <button className={`ghost-btn hidden h-8 w-8 opacity-50 sm:flex`} title={UI_LABELS.shell.annulerAction} disabled aria-disabled>
          <Undo2 size={14} />
        </button>
        <button className={`ghost-btn hidden h-8 w-8 opacity-50 sm:flex`} title={UI_LABELS.shell.retablirAction} disabled aria-disabled>
          <Redo2 size={14} />
        </button>
        <span className="mx-1 hidden h-4 w-px bg-[var(--line)] sm:block" />
        <button
          onClick={onOpenCommand}
          title={`${UI_LABELS.shell.rechercher} (⌘K)`}
          className={`flex h-8 items-center gap-2 rounded-lg border border-[var(--line)] bg-[var(--surface-2)] px-2.5 text-[12px] text-[var(--text-dim)] transition-colors hover:border-[var(--line-strong)] hover:text-[var(--text)] ${FOCUS}`}
        >
          <Search size={13} />
          <span className="hidden lg:inline">{UI_LABELS.shell.rechercher}</span>
          <kbd className="rounded bg-[var(--surface-3)] px-1.5 py-0.5 text-[10px] text-[var(--text-dim)]">⌘K</kbd>
        </button>
        <button
          onClick={onOpenShortcuts}
          title={UI_LABELS.raccourcis.titre}
          aria-label={UI_LABELS.raccourcis.titre}
          className={`ghost-btn h-8 w-8 ${FOCUS}`}
        >
          <Keyboard size={14} />
        </button>
        <button className={`ghost-btn hidden h-8 w-8 sm:flex ${FOCUS}`} title={UI_LABELS.shell.notifications} aria-label={UI_LABELS.shell.notifications}>
          <Bell size={14} />
        </button>
        <Link to="/settings" className={`ghost-btn h-8 w-8 ${FOCUS}`} title={UI_LABELS.shell.parametres} aria-label={UI_LABELS.shell.parametres}>
          <Settings size={14} />
        </Link>
        <button
          onClick={() => setActive("timeline")}
          className={`ml-1 flex h-8 items-center gap-1.5 rounded-lg bg-[var(--accent)] px-2.5 text-[12px] font-medium text-[var(--accent-fg)] transition-all duration-150 ease-out hover:bg-[var(--accent-strong)] active:scale-[0.98] sm:px-3 ${FOCUS}`}
          title={UI_LABELS.shell.aideExporter}
        >
          <Download size={13} />
          <span className="hidden sm:inline">{UI_LABELS.shell.exporter}</span>
        </button>
      </div>
    </header>
  );
}

function Crumb() {
  return <ChevronRight size={13} className="shrink-0 text-[var(--text-dim)] opacity-60" />;
}

function SegmentTab({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={`h-7 rounded-[7px] px-3 text-[12px] transition-colors duration-150 ease-out focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--accent)] ${
        active
          ? "bg-[var(--surface-4)] text-[var(--text)]"
          : "text-[var(--text-dim)] hover:text-[var(--text-muted)]"
      }`}
    >
      {label}
    </button>
  );
}
