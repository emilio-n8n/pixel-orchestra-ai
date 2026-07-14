import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useWorkspaceStore } from "@/stores/workspace";
import { WorkspaceShell } from "@/workspace/shell/WorkspaceShell";

export const Route = createFileRoute("/w/$wsId/p/$pid")({
  ssr: false,
  component: ProjectWorkspace,
});

function ProjectWorkspace() {
  const { wsId, pid } = useParams({ from: "/w/$wsId/p/$pid" });
  const project = useWorkspaceStore((s) => s.projects.find((p) => p.id === pid));
  const workspace = useWorkspaceStore((s) => s.workspaces.find((w) => w.id === wsId));

  if (!project || !workspace) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--surface-0)] text-[var(--text-muted)]">
        Project not found. <Link to="/" className="ml-2 text-[var(--accent)] underline">Go home</Link>
      </div>
    );
  }

  return <WorkspaceShell workspaceId={wsId} projectId={pid} />;
}