import { useEffect, useState } from "react";
import { useKernelEvents } from "@/kernel/react";
import { listGraphRuns } from "@/plugins/ui-node-graph/server";

interface GraphRunView {
  id: string;
  graphId: string;
  status: string;
  startedAt: number;
  finishedAt: number | null;
  stats: Record<string, unknown>;
}

export function JobsPanel() {
  const [runs, setRuns] = useState<GraphRunView[]>([]);
  const last = useKernelEvents(1)[0];
  useEffect(() => {
    listGraphRuns({ data: { limit: 50 } })
      .then((r) => setRuns(r.runs as unknown as GraphRunView[]))
      .catch(() => setRuns([]));
  }, [last]);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[var(--surface-1)]">
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-[var(--line)] px-3">
        <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--text-dim)]">
          Jobs
        </div>
        <span className="mono text-[10px] text-[var(--text-dim)]">{runs.length} runs</span>
      </div>
      <div className="flex-1 overflow-auto p-3 text-xs text-[var(--text-muted)]">
        {runs.length === 0 ? (
          <div className="text-center text-[var(--text-dim)]">
            No jobs yet. Run a graph in the Node Graph panel.
          </div>
        ) : (
          <ul className="space-y-2">
            {runs.map((r) => (
              <li
                key={r.id}
                className="rounded border border-[var(--line)] bg-[var(--surface-2)] p-2"
              >
                <div className="flex items-center justify-between">
                  <span className="mono text-[10px] text-[var(--text-dim)]">
                    {r.id.slice(0, 12)}
                  </span>
                  <span
                    className={`rounded px-1.5 py-0.5 text-[9px] uppercase ${
                      r.status === "ok"
                        ? "bg-[var(--status-ok)]/20 text-[var(--status-ok)]"
                        : r.status === "error"
                          ? "bg-[var(--status-err)]/20 text-[var(--status-err)]"
                          : "bg-[var(--status-warn)]/20 text-[var(--status-warn)]"
                    }`}
                  >
                    {r.status}
                  </span>
                </div>
                <div className="mono mt-1 text-[9px] text-[var(--text-dim)]">
                  graph {r.graphId.slice(0, 8)} · {new Date(r.startedAt).toLocaleTimeString()}
                </div>
                {r.stats && Object.keys(r.stats).length > 0 ? (
                  <pre className="mono mt-1 max-h-32 overflow-auto rounded bg-[var(--surface-3)] p-1 text-[9px] text-[var(--text-muted)]">
                    {JSON.stringify(r.stats, null, 2)}
                  </pre>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
