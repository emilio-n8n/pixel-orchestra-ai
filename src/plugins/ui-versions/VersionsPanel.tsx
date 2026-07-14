import { useCallback, useEffect, useState } from "react";
import { useLibraryProject } from "@/plugins/library/project";
import { useLibrary } from "@/plugins/library/store";
import { listSnapshots, createSnapshot, restoreSnapshot, type SnapshotView } from "./server";

export function VersionsPanel() {
  const projectId = useLibraryProject();
  const selected = useLibrary((s) => s.selected);
  const [snapshots, setSnapshots] = useState<SnapshotView[]>([]);
  const [restored, setRestored] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId || !selected) {
      setSnapshots([]);
      return;
    }
    listSnapshots({ data: { projectId, entityType: "asset", entityId: selected.id } })
      .then((r) => setSnapshots(r.snapshots as SnapshotView[]))
      .catch(() => setSnapshots([]));
  }, [projectId, selected?.id]);

  const snap = useCallback(async () => {
    if (!projectId || !selected) return;
    const r = await createSnapshot({
      data: {
        projectId,
        entityType: "asset",
        entityId: selected.id,
        blob: JSON.stringify({ name: selected.name, assetId: selected.id }),
        reason: "manual snapshot",
      },
    });
    setSnapshots((prev) => [
      ...prev,
      {
        id: r.id,
        projectId,
        entityType: "asset",
        entityId: selected.id,
        version: r.version,
        blob: "{}",
        reason: "manual snapshot",
        createdAt: Date.now(),
      },
    ]);
  }, [projectId, selected]);

  const restore = useCallback(async (id: string) => {
    setRestored(id);
    const r = await restoreSnapshot({ data: { id } });
    setTimeout(() => setRestored(null), 2000);
  }, []);

  if (!selected) return null;
  return (
    <div className="border-b border-[var(--line)] p-3 text-[10px] text-[var(--text-muted)]">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-[10px] font-medium uppercase tracking-[0.16em] text-[var(--text-dim)]">
          Versions
        </div>
        <button
          onClick={snap}
          className="rounded border border-[var(--line)] px-2 py-0.5 text-[9px] uppercase tracking-widest hover:border-[var(--accent)]"
        >
          Snapshot
        </button>
      </div>
      {snapshots.length === 0 ? (
        <div className="text-[var(--text-dim)]">No snapshots yet.</div>
      ) : null}
      <ul className="space-y-1">
        {snapshots.map((s) => (
          <li
            key={s.id}
            className="flex items-center justify-between rounded border border-[var(--line)] bg-[var(--surface-3)] px-2 py-1"
          >
            <div>
              <span className="mono text-[var(--text)]">v{s.version}</span>
              {s.reason ? <span className="ml-1 text-[var(--text-dim)]">· {s.reason}</span> : null}
              <div className="mono text-[9px] text-[var(--text-dim)]">
                {new Date(s.createdAt).toLocaleString()}
              </div>
            </div>
            <button
              onClick={() => restore(s.id)}
              disabled={restored === s.id}
              className="text-[9px] uppercase tracking-widest text-[var(--accent)] hover:underline disabled:opacity-50"
            >
              {restored === s.id ? "✓" : "Restore"}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
