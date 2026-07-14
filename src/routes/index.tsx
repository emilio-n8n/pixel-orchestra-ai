import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useWorkspaceStore } from "@/stores/workspace";

export const Route = createFileRoute("/")({
  ssr: false,
  component: Home,
});

function Home() {
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const createWorkspace = useWorkspaceStore((s) => s.createWorkspace);
  const navigate = useNavigate();
  const [name, setName] = useState("");

  function newWorkspace(defaultName?: string) {
    const label = (defaultName ?? name).trim() || "Untitled workspace";
    const ws = createWorkspace(label);
    setName("");
    navigate({ to: "/w/$wsId", params: { wsId: ws.id } });
  }

  return (
    <div className="min-h-screen bg-[var(--surface-0)]">
      <div className="mx-auto max-w-5xl px-8 pt-24 pb-16">
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className="inline-block h-8 w-8 rounded-lg"
            style={{
              background:
                "conic-gradient(from 210deg, var(--accent-strong), var(--accent), var(--accent-quiet), var(--accent))",
            }}
          />
          <div>
            <div className="text-[11px] uppercase tracking-[0.22em] text-[var(--text-dim)]">Lilium</div>
            <div className="text-[22px] font-semibold tracking-tight">Studio</div>
          </div>
        </div>

        <h1 className="mt-16 max-w-3xl text-5xl font-semibold tracking-tight text-[var(--text)]">
          A plugin-first workspace for producing content with any AI model.
        </h1>
        <p className="mt-5 max-w-2xl text-[15px] leading-relaxed text-[var(--text-muted)]">
          Organize projects, characters, scenes and assets in a single canvas. Orchestrate Gradio,
          ComfyUI, OpenAI, MCP and anything else you plug in. Every generation is a graph, every asset
          keeps its lineage, everything is scriptable.
        </p>

        <div className="mt-12">
          <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--text-dim)]">
            Workspaces
          </div>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {workspaces.map((w) => (
              <Link
                key={w.id}
                to="/w/$wsId"
                params={{ wsId: w.id }}
                className="panel group flex h-32 flex-col justify-between p-4 transition-colors hover:border-[var(--line-strong)]"
              >
                <div>
                  <div className="text-[15px] font-medium text-[var(--text)]">{w.name}</div>
                  <div className="mono mt-1 text-[10px] uppercase tracking-widest text-[var(--text-dim)]">
                    {w.id.slice(0, 12)}
                  </div>
                </div>
                <div className="text-xs text-[var(--text-dim)]">
                  Created {new Date(w.createdAt).toLocaleDateString()}
                </div>
              </Link>
            ))}
            <div className="panel flex h-32 flex-col p-4">
              <div className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-dim)]">
                New workspace
              </div>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && newWorkspace()}
                placeholder="Workspace name"
                className="mt-2 w-full rounded-md border border-[var(--line)] bg-[var(--surface-3)] px-2 py-1.5 text-sm outline-none focus:border-[var(--accent)]"
              />
              <button
                onClick={() => newWorkspace()}
                className="mt-auto self-start rounded-md bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-[var(--accent-fg)] hover:bg-[var(--accent-strong)]"
              >
                Create workspace
              </button>
            </div>
          </div>
          {workspaces.length === 0 ? (
            <button
              onClick={() => newWorkspace("Personal")}
              className="mt-4 text-xs text-[var(--text-dim)] underline underline-offset-4 hover:text-[var(--text-muted)]"
            >
              Or start instantly with a "Personal" workspace →
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
