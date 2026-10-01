/**
 * Compact project switcher for the header (spec A.1).
 *
 * One control, three states: a chevron + editable project title, a dropdown
 * of the workspace's projects, and inline rename (double-click or the pencil).
 * The title writes straight to the workspace store, so no round-trip.
 */

import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Check, ChevronDown, Pencil, Plus } from "lucide-react";
import { useWorkspaceStore } from "@/stores/workspace";
import { UI_LABELS } from "@/lib/ui/labels";

const FOCUS =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]";

export function ProjectPicker({
  workspaceId,
  projectId,
}: {
  workspaceId?: string;
  projectId?: string;
}) {
  const navigate = useNavigate();
  const projects = useWorkspaceStore((s) => s.projectsIn(workspaceId ?? ""));
  const project = useWorkspaceStore((s) => (projectId ? s.getProject(projectId) : undefined));
  const renameProject = useWorkspaceStore((s) => s.renameProject);
  const createProject = useWorkspaceStore((s) => s.createProject);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close on outside click / Escape — a dropdown that traps focus is worse
  // than one that just gets out of the way.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  function startEditing() {
    if (!project) return;
    setDraft(project.name);
    setEditing(true);
    setOpen(false);
  }

  function commitEditing() {
    if (project) {
      const name = draft.trim();
      if (name && name !== project.name) renameProject(project.id, name);
    }
    setEditing(false);
  }

  function handleNewProject() {
    if (!workspaceId) return;
    const p = createProject(workspaceId, UI_LABELS.shell.nouveauProjet);
    setOpen(false);
    void navigate({ to: "/w/$wsId/p/$pid", params: { wsId: workspaceId, pid: p.id } });
  }

  return (
    <div ref={wrapRef} className="relative min-w-0">
      <div className="flex h-8 min-w-0 items-center rounded-lg border border-transparent transition-colors hover:border-[var(--line)] hover:bg-[var(--surface-2)]">
        {editing ? (
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitEditing}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitEditing();
              }
              if (e.key === "Escape") {
                e.preventDefault();
                setEditing(false);
              }
            }}
            aria-label={UI_LABELS.shell.renommerProjet}
            className={`h-7 min-w-0 max-w-[180px] flex-1 rounded-md bg-transparent px-1.5 text-[13px] text-[var(--text)] outline-none ${FOCUS}`}
          />
        ) : (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            onDoubleClick={startEditing}
            aria-haspopup="listbox"
            aria-expanded={open}
            title={UI_LABELS.shell.changerProjet}
            className={`flex h-7 min-w-0 items-center gap-1.5 rounded-md px-1.5 text-[13px] font-medium text-[var(--text)] ${FOCUS}`}
          >
            <span className="truncate">{project?.name ?? UI_LABELS.shell.aucunProjet}</span>
            <ChevronDown
              size={13}
              className={`shrink-0 text-[var(--text-dim)] ${open ? "rotate-180" : ""} transition-transform`}
            />
          </button>
        )}
        <button
          type="button"
          onClick={startEditing}
          disabled={!project}
          title={UI_LABELS.shell.renommerProjet}
          aria-label={UI_LABELS.shell.renommerProjet}
          className={`ghost-btn h-6 w-6 shrink-0 rounded-md text-[var(--text-dim)] ${FOCUS}`}
        >
          <Pencil size={11} />
        </button>
      </div>

      {open ? (
        <div
          role="listbox"
          aria-label={UI_LABELS.shell.projets}
          className="absolute top-9 left-0 z-50 w-[260px] animate-fade-in overflow-hidden rounded-xl border border-[var(--line-strong)] bg-[var(--surface-3)] p-1 shadow-[var(--shadow-pop)]"
        >
          <div className="max-h-[320px] overflow-auto">
            {projects.length === 0 ? (
              <div className="px-2.5 py-2 text-[11px] text-[var(--text-dim)]">
                {UI_LABELS.shell.aucunProjet}
              </div>
            ) : (
              projects.map((p) => {
                const active = p.id === projectId;
                return (
                  <button
                    key={p.id}
                    type="button"
                    role="option"
                    aria-selected={active}
                    onClick={() => {
                      setOpen(false);
                      if (active) return;
                      if (workspaceId)
                        void navigate({
                          to: "/w/$wsId/p/$pid",
                          params: { wsId: workspaceId, pid: p.id },
                        });
                    }}
                    className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[12.5px] transition-colors ${FOCUS} ${
                      active
                        ? "bg-[var(--accent-quiet)] text-[var(--text)]"
                        : "text-[var(--text-muted)] hover:bg-[var(--surface-4)] hover:text-[var(--text)]"
                    }`}
                  >
                    <span className="flex-1 truncate">{p.name}</span>
                    {active ? (
                      <Check size={12} className="shrink-0 text-[var(--accent-strong)]" />
                    ) : null}
                  </button>
                );
              })
            )}
          </div>
          <div className="mt-1 border-t border-[var(--line)] pt-1">
            <button
              type="button"
              onClick={handleNewProject}
              disabled={!workspaceId}
              className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[12px] text-[var(--text-dim)] transition-colors hover:bg-[var(--surface-4)] hover:text-[var(--text)] disabled:opacity-40 ${FOCUS}`}
            >
              <Plus size={12} />
              {UI_LABELS.shell.nouveauProjet}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
