import { Link, useNavigate } from "@tanstack/react-router";
import { useWorkspaceStore } from "@/stores/workspace";

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
  const navigate = useNavigate();

  return (
    <div className="flex h-11 shrink-0 items-center justify-between border-b border-[var(--line)] bg-[var(--rail)] px-2">
      <div className="flex items-center gap-1">
        <Link
          to="/"
          className="flex h-7 items-center gap-2 rounded-md px-2 text-[13px] font-semibold text-[var(--text)] hover:bg-[var(--surface-3)]"
        >
          <span
            aria-hidden
            className="inline-block h-4 w-4 rounded-[4px]"
            style={{
              background:
                "conic-gradient(from 210deg, var(--accent-strong), var(--accent), var(--accent-quiet), var(--accent))",
            }}
          />
          Lilium
        </Link>
        <Crumb>/</Crumb>
        {ws ? (
          <button
            onClick={() => navigate({ to: "/w/$wsId", params: { wsId: ws.id } })}
            className="rounded-md px-2 py-1 text-[13px] text-[var(--text-muted)] hover:bg-[var(--surface-3)] hover:text-[var(--text)]"
          >
            {ws.name}
          </button>
        ) : (
          <span className="px-2 py-1 text-[13px] text-[var(--text-dim)]">no workspace</span>
        )}
        {project ? (
          <>
            <Crumb>/</Crumb>
            <span className="rounded-md px-2 py-1 text-[13px] text-[var(--text)]">
              {project.name}
            </span>
          </>
        ) : null}
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={onOpenCommand}
          className="flex h-7 items-center gap-2 rounded-md border border-[var(--line)] bg-[var(--surface-2)] px-2 text-[12px] text-[var(--text-muted)] hover:border-[var(--line-strong)] hover:text-[var(--text)]"
        >
          <span>Search or run…</span>
          <kbd className="mono rounded bg-[var(--surface-3)] px-1.5 py-0.5 text-[10px] text-[var(--text-dim)]">
            ⌘K
          </kbd>
        </button>
      </div>
    </div>
  );
}

function Crumb({ children }: { children: React.ReactNode }) {
  return <span className="px-0.5 text-[var(--text-dim)]">{children}</span>;
}
