import { Link, useNavigate } from "@tanstack/react-router";
import { Bell, ChevronRight, Download, Search, Settings, Undo2, Redo2 } from "lucide-react";
import { useWorkspaceStore } from "@/stores/workspace";
import { usePanelStore } from "@/stores/panels";

export function TopBar({
  workspaceId,
  projectId,
  onOpenCommand,
}: {
  workspaceId?: string;
  projectId?: string;
  onOpenCommand: () => void;
}) {
  const ws = useWorkspaceStore((s) => (workspaceId ? s.getWorkspace(workspaceId) : undefined));
  const project = useWorkspaceStore((s) => (projectId ? s.getProject(projectId) : undefined));
  const active = usePanelStore((s) => s.activeModule);
  const setActive = usePanelStore((s) => s.setActiveModule);
  const navigate = useNavigate();

  return (
    <header className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-[var(--line)] bg-[var(--rail)] px-3">
      <div className="flex min-w-0 items-center gap-1">
        <Link
          to="/"
          className="flex h-8 items-center gap-2 rounded-lg px-2 text-[13px] font-semibold tracking-tight text-[var(--text)] transition-colors hover:bg-[var(--surface-2)]"
        >
          <span
            aria-hidden
            className="inline-block h-[18px] w-[18px] rounded-[6px]"
            style={{
              background:
                "conic-gradient(from 210deg, var(--accent-strong), var(--accent), var(--accent-quiet), var(--accent))",
            }}
          />
          Lilium
        </Link>
        <Crumb />
        {ws ? (
          <button
            onClick={() => navigate({ to: "/w/$wsId", params: { wsId: ws.id } })}
            className="max-w-[160px] truncate rounded-lg px-2 py-1 text-[12.5px] text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
          >
            {ws.name}
          </button>
        ) : (
          <span className="px-2 py-1 text-[12.5px] text-[var(--text-dim)]">Aucun espace</span>
        )}
        {project ? (
          <>
            <Crumb />
            <span className="max-w-[220px] truncate rounded-lg px-2 py-1 text-[12.5px] font-medium text-[var(--text)]">
              {project.name}
            </span>
          </>
        ) : null}
      </div>

      <nav className="flex items-center gap-0.5 rounded-lg bg-[var(--surface-2)] p-0.5">
        <SegmentTab label="Éditeur" active={active === "timeline"} onClick={() => setActive("timeline")} />
        <SegmentTab label="Bibliothèque" active={active === "library"} onClick={() => setActive("library")} />
        <SegmentTab label="Rendus" active={active === "jobs"} onClick={() => setActive("jobs")} />
      </nav>

      <div className="flex items-center gap-1">
        <button className="ghost-btn h-8 w-8 opacity-50" title="Annuler" disabled>
          <Undo2 size={14} />
        </button>
        <button className="ghost-btn h-8 w-8 opacity-50" title="Rétablir" disabled>
          <Redo2 size={14} />
        </button>
        <span className="mx-1 h-4 w-px bg-[var(--line)]" />
        <button
          onClick={onOpenCommand}
          className="flex h-8 items-center gap-2 rounded-lg border border-[var(--line)] bg-[var(--surface-2)] px-2.5 text-[12px] text-[var(--text-dim)] transition-colors hover:border-[var(--line-strong)] hover:text-[var(--text)]"
        >
          <Search size={13} />
          <span>Rechercher</span>
          <kbd className="rounded bg-[var(--surface-3)] px-1.5 py-0.5 text-[10px] text-[var(--text-dim)]">⌘K</kbd>
        </button>
        <button className="ghost-btn h-8 w-8" title="Notifications">
          <Bell size={14} />
        </button>
        <Link to="/settings" className="ghost-btn h-8 w-8" title="Paramètres">
          <Settings size={14} />
        </Link>
        <button
          onClick={() => setActive("timeline")}
          className="ml-1 flex h-8 items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 text-[12px] font-medium text-[var(--accent-fg)] transition-all duration-150 ease-out hover:bg-[var(--accent-strong)] active:scale-[0.98]"
          title="Exporter la vidéo finale depuis l'éditeur"
        >
          <Download size={13} />
          Exporter
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
      className={`h-7 rounded-[7px] px-3 text-[12px] transition-colors duration-150 ease-out ${
        active
          ? "bg-[var(--surface-4)] text-[var(--text)]"
          : "text-[var(--text-dim)] hover:text-[var(--text-muted)]"
      }`}
    >
      {label}
    </button>
  );
}
