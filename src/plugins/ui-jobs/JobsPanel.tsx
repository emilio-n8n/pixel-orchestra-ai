import { useEffect, useState } from "react";
import { useKernelEvents } from "@/kernel/react";
import { useLibraryProject } from "@/plugins/library/project";
import { supabase } from "@/integrations/supabase/client";
import { listGraphRuns } from "@/plugins/ui-node-graph/server";
import { UI_LABELS, jobStatusLabel, toolLabel } from "@/lib/ui/labels";
import { ErrorBlock } from "@/components/ui/error-block";

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
  const [loadError, setLoadError] = useState<unknown>(null);
  const last = useKernelEvents(1)[0];

  useEffect(() => {
    listGraphRuns({ data: { limit: 50 } })
      .then((r) => {
        setRuns(r.runs as unknown as GraphRunView[]);
        setLoadError(null);
      })
      .catch((e) => {
        setRuns([]);
        setLoadError(e);
      });
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
  const running = jobs.filter((j) => j.status === "running").length;

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[var(--surface-1)]">
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-[var(--line)] px-3">
        <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--text-dim)]">
          {UI_LABELS.jobs.titre}
        </div>
        <span className="mono text-[10px] text-[var(--text-dim)]">
          {running} {UI_LABELS.jobs.enCours} · {total} {UI_LABELS.jobs.total}
        </span>
      </div>
      <div className="flex-1 overflow-auto p-3 text-xs text-[var(--text-muted)]">
        {loadError ? (
          <div className="mb-3">
            <ErrorBlock
              message={UI_LABELS.lineage.erreur}
              error={loadError}
              context="jobs.listGraphRuns"
            />
          </div>
        ) : null}
        {total === 0 ? (
          <div className="mx-auto max-w-[42ch] py-10 text-center">
            <div className="text-[13px] font-medium text-[var(--text)]">
              {UI_LABELS.jobs.videTitre}
            </div>
            <p className="mt-1.5 text-[12px] leading-relaxed text-[var(--text-dim)]">
              {UI_LABELS.jobs.videDescription}
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {jobs.map((j) => (
              <li key={j.id} className="rounded border border-[var(--line)] bg-[var(--surface-2)] p-2">
                <div className="flex items-center justify-between gap-2">
                  <span
                    className="mono truncate text-[10px] text-[var(--text-dim)]"
                    title={j.kind}
                  >
                    {toolLabel(j.kind)}
                  </span>
                  <span className={`rounded px-1.5 py-0.5 text-[9px] uppercase ${jobBadge(j.status)}`}>
                    {jobStatusLabel(j.status)}
                  </span>
                </div>
                {j.prompt ? (
                  <div className="mt-1 truncate text-[10px] text-[var(--text)]" title={j.prompt}>
                    {j.prompt}
                  </div>
                ) : null}
                {j.error ? (
                  <div className="mt-1">
                    <ErrorBlock message={j.error} error={j.error} context={`jobs.${j.id}`} compact />
                  </div>
                ) : null}
                <div className="mono mt-1 text-[9px] text-[var(--text-dim)]">
                  {new Date(j.created_at).toLocaleTimeString("fr-FR")}
                  {j.finished_at ? ` → ${new Date(j.finished_at).toLocaleTimeString("fr-FR")}` : ""}
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
                    {jobStatusLabel(r.status)}
                  </span>
                </div>
                <div className="mono mt-1 text-[9px] text-[var(--text-dim)]">
                  {UI_LABELS.jobs.graphe} {r.graphId.slice(0, 8)} ·{" "}
                  {new Date(r.startedAt).toLocaleTimeString("fr-FR")}
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
