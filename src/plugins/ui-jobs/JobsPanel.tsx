import { useEffect, useState } from "react";
import { useKernelEvents } from "@/kernel/react";
import { useLibraryProject } from "@/plugins/library/project";
import { supabase } from "@/integrations/supabase/client";
import { listGraphRuns } from "@/plugins/ui-node-graph/server";

interface GraphRunView {
  id: string;
  graphId: string;
  status: string;
  startedAt: number;
  finishedAt: number | null;
  stats: Record<string, unknown>;
}

interface DirectorJob {
  id: string;
  kind: string;
  status: "queued" | "running" | "completed" | "failed";
  prompt: string | null;
  error: string | null;
  created_at: string;
  finished_at: string | null;
}

function jobBadge(status: string) {
  switch (status) {
    case "completed":
    case "ok":
      return "bg-[var(--status-ok)]/20 text-[var(--status-ok)]";
    case "failed":
    case "error":
      return "bg-[var(--status-err)]/20 text-[var(--status-err)]";
    case "running":
      return "bg-[var(--status-warn)]/20 text-[var(--status-warn)] animate-pulse";
    default:
      return "bg-[var(--status-warn)]/20 text-[var(--status-warn)]";
  }
}

export function JobsPanel() {
  const pid = useLibraryProject();
  const [runs, setRuns] = useState<GraphRunView[]>([]);
  const [jobs, setJobs] = useState<DirectorJob[]>([]);
  const last = useKernelEvents(1)[0];

  useEffect(() => {
    listGraphRuns({ data: { limit: 50 } })
      .then((r) => setRuns(r.runs as unknown as GraphRunView[]))
      .catch(() => setRuns([]));
  }, [last]);

  // Director agent operations — durable in Supabase, live via realtime.
  useEffect(() => {
    if (!pid) return;
    const projectId = pid;
    let alive = true;
    // director_jobs isn't in the generated Database type yet.
    const jobsClient = supabase as unknown as {
      from: (table: "director_jobs") => {
        select: (cols: string) => {
          eq: (col: string, v: string) => {
            order: (col: string, o: { ascending: boolean }) => {
              limit: (n: number) => Promise<{ data: unknown[] | null; error: unknown }>;
            };
          };
        };
      };
      channel: (name: string) => {
        on: (
          evt: string,
          opts: Record<string, string>,
          cb: () => void,
        ) => { subscribe: () => { unsubscribe: () => void } };
      };
      removeChannel: (ch: { unsubscribe: () => void }) => void;
    };
    async function load() {
      const { data } = await jobsClient
        .from("director_jobs")
        .select("id, kind, status, prompt, error, created_at, finished_at")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false })
        .limit(30);
      if (alive) setJobs((data ?? []) as unknown as DirectorJob[]);
    }
    load();
    const ch = jobsClient
      .channel(`jobs:${projectId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "director_jobs", filter: `project_id=eq.${projectId}` }, load)
      .subscribe();
    return () => {
      alive = false;
      ch.unsubscribe();
    };
  }, [pid]);

  const total = jobs.length + runs.length;

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[var(--surface-1)]">
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-[var(--line)] px-3">
        <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--text-dim)]">
          Jobs
        </div>
        <span className="mono text-[10px] text-[var(--text-dim)]">
          {jobs.filter((j) => j.status === "running").length} running · {total} total
        </span>
      </div>
      <div className="flex-1 overflow-auto p-3 text-xs text-[var(--text-muted)]">
        {total === 0 ? (
          <div className="text-center text-[var(--text-dim)]">
            No jobs yet. Ask the Director to generate something, or run a graph in the Node Graph
            panel.
          </div>
        ) : (
          <ul className="space-y-2">
            {jobs.map((j) => (
              <li key={j.id} className="rounded border border-[var(--line)] bg-[var(--surface-2)] p-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="mono truncate text-[10px] text-[var(--text-dim)]">
                    {j.kind}
                  </span>
                  <span className={`rounded px-1.5 py-0.5 text-[9px] uppercase ${jobBadge(j.status)}`}>
                    {j.status}
                  </span>
                </div>
                {j.prompt ? (
                  <div className="mt-1 truncate text-[10px] text-[var(--text)]" title={j.prompt}>
                    {j.prompt}
                  </div>
                ) : null}
                {j.error ? (
                  <div className="mt-1 rounded bg-[var(--status-err)]/10 p-1 text-[9px] text-[var(--status-err)]">
                    {j.error}
                  </div>
                ) : null}
                <div className="mono mt-1 text-[9px] text-[var(--text-dim)]">
                  {new Date(j.created_at).toLocaleTimeString()}
                  {j.finished_at ? ` → ${new Date(j.finished_at).toLocaleTimeString()}` : ""}
                </div>
              </li>
            ))}
            {runs.map((r) => (
              <li
                key={r.id}
                className="rounded border border-[var(--line)] bg-[var(--surface-2)] p-2"
              >
                <div className="flex items-center justify-between">
                  <span className="mono text-[10px] text-[var(--text-dim)]">
                    {r.id.slice(0, 12)}
                  </span>
                  <span className={`rounded px-1.5 py-0.5 text-[9px] uppercase ${jobBadge(r.status)}`}>
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
