import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate, useParams } from "@tanstack/react-router";
import { useWorkspaceStore } from "@/stores/workspace";

export const Route = createFileRoute("/w/$wsId")({
  ssr: false,
  component: WorkspaceView,
});

function WorkspaceView() {
  const { wsId } = useParams({ from: "/w/$wsId" });
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const allProjects = useWorkspaceStore((s) => s.projects);
  const workspace = useMemo(() => workspaces.find((w) => w.id === wsId), [workspaces, wsId]);
  const projects = useMemo(
    () => allProjects.filter((p) => p.workspaceId === wsId),
    [allProjects, wsId],
  );
  const createProject = useWorkspaceStore((s) => s.createProject);
  const navigate = useNavigate();
  const [name, setName] = useState("");

  if (!workspace) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--surface-0)] text-[var(--text-muted)]">
        Workspace not found.{" "}
        <Link to="/" className="ml-2 text-[var(--accent)] underline">
          Go home
        </Link>
      </div>
    );
  }

  function newProject() {
    const p = createProject(wsId, name.trim() || "Untitled project");
    setName("");
    navigate({ to: "/w/$wsId/p/$pid", params: { wsId, pid: p.id } });
  }

  return (
    <div className="min-h-screen bg-[var(--surface-0)]">
      <div className="mx-auto max-w-5xl px-8 pt-16 pb-16">
        <Link to="/" className="text-xs text-[var(--text-dim)] hover:text-[var(--text-muted)]">
          ← All workspaces
        </Link>
        <div className="mt-6 flex items-end justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-[0.22em] text-[var(--text-dim)]">
              Workspace
            </div>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight">{workspace.name}</h1>
          </div>
        </div>

        <div className="mt-12">
          <div className="flex items-center justify-between">
            <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--text-dim)]">
              Projects
            </div>
            <div className="flex items-center gap-2">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && newProject()}
                placeholder="New project name"
                className="rounded-md border border-[var(--line)] bg-[var(--surface-3)] px-2 py-1.5 text-sm outline-none focus:border-[var(--accent)]"
              />
              <button
                onClick={newProject}
                className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-[var(--accent-fg)] hover:bg-[var(--accent-strong)]"
              >
                Create project
              </button>
            </div>
          </div>

          {projects.length === 0 ? (
            <div className="panel mt-4 flex h-40 items-center justify-center text-sm text-[var(--text-dim)]">
              No projects yet. Create your first one above.
            </div>
          ) : (
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {projects.map((p) => (
                <Link
                  key={p.id}
                  to="/w/$wsId/p/$pid"
                  params={{ wsId, pid: p.id }}
                  className="panel flex h-32 flex-col justify-between p-4 hover:border-[var(--line-strong)]"
                >
                  <div>
                    <div className="text-[15px] font-medium">{p.name}</div>
                    <div className="mono mt-1 text-[10px] uppercase tracking-widest text-[var(--text-dim)]">
                      {p.id.slice(0, 12)}
                    </div>
                  </div>
                  <div className="text-xs text-[var(--text-dim)]">
                    Updated {new Date(p.updatedAt).toLocaleString()}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
