import { useCallback, useEffect, useState } from "react";
import { useKernelEvents } from "@/kernel/react";
import { useLibraryProject } from "@/plugins/library/project";
import { listScenes, createScene, listShots, type SceneView, type ShotView } from "./server";

export function StoryboardPanel() {
  const projectId = useLibraryProject();
  const [scenes, setScenes] = useState<SceneView[]>([]);
  const [shots, setShots] = useState<Record<string, ShotView[]>>({});
  const [sceneName, setSceneName] = useState("");
  const last = useKernelEvents(1)[0];

  useEffect(() => {
    if (!projectId) return;
    listScenes({ data: { projectId } })
      .then((r) => setScenes(r.scenes as SceneView[]))
      .catch(() => setScenes([]));
  }, [projectId, last]);

  const addScene = useCallback(async () => {
    if (!projectId || !sceneName.trim()) return;
    await createScene({ data: { projectId, name: sceneName.trim() } });
    setSceneName("");
  }, [projectId, sceneName]);

  const loadShots = useCallback(async (sceneId: string) => {
    const r = await listShots({ data: { sceneId } });
    setShots((prev) => ({ ...prev, [sceneId]: r.shots as ShotView[] }));
  }, []);

  if (!projectId)
    return (
      <div className="flex h-full items-center justify-center p-8 text-sm text-[var(--text-muted)]">
        No project open.
      </div>
    );

  return (
    <div className="flex h-full flex-col overflow-auto bg-[var(--surface-1)] p-4 text-xs text-[var(--text-muted)]">
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--text-dim)]">
          Storyboard
        </div>
        <div className="flex gap-2">
          <input
            value={sceneName}
            onChange={(e) => setSceneName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addScene()}
            placeholder="New scene name"
            className="w-48 rounded border border-[var(--line)] bg-[var(--surface-3)] px-2 py-1 text-sm"
          />
          <button
            onClick={addScene}
            disabled={!sceneName.trim()}
            className="rounded bg-[var(--accent)] px-2 py-1 text-[11px] text-[var(--accent-fg)] disabled:opacity-50"
          >
            Add scene
          </button>
        </div>
      </div>
      <div className="mt-3 space-y-3">
        {scenes.length === 0 ? <div className="text-[var(--text-dim)]">No scenes yet.</div> : null}
        {scenes.map((s) => (
          <div key={s.id} className="rounded border border-[var(--line)] bg-[var(--surface-2)] p-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[12px] font-medium text-[var(--text)]">{s.name}</div>
                {s.description ? <div className="text-[10px]">{s.description}</div> : null}
              </div>
              <button
                onClick={() => loadShots(s.id)}
                className="rounded border border-[var(--line)] px-2 py-0.5 text-[10px] uppercase tracking-widest text-[var(--text-dim)]"
              >
                Shots
              </button>
            </div>
            {shots[s.id]?.length > 0 ? (
              <div className="mt-2 flex gap-2 overflow-x-auto">
                {shots[s.id].map((sh) => (
                  <div
                    key={sh.id}
                    className="flex h-16 w-24 shrink-0 items-center justify-center rounded border border-[var(--line)] bg-[var(--surface-3)] text-[9px] text-[var(--text-dim)]"
                  >
                    {sh.name || sh.id.slice(0, 8)}
                    <br />
                    {(sh.durationMs / 1000).toFixed(1)}s
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
