import { useCallback, useEffect, useRef, useState } from "react";
import { useKernelEvents } from "@/kernel/react";
import { useLibraryProject } from "@/plugins/library/project";
import { supabase } from "@/integrations/supabase/client";
import { listGraphRuns } from "@/plugins/ui-node-graph/server";
import { UI_LABELS, jobStatusLabel, toolLabel } from "@/lib/ui/labels";
import { ErrorBlock } from "@/components/ui/error-block";
import { ConnPill } from "@/lib/realtime/ConnPill";
import { useSupabaseChannel } from "@/lib/realtime/channel";
import { isOfflineError, nextBackoff, useOnlineStatus } from "@/lib/realtime/online";

const PAGE_SIZE = 50;

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

/** director_jobs isn't in the generated Database type yet — loose table access. */
function jobsQuery(projectId: string, limit: number) {
  const sb = supabase as unknown as {
    from: (table: string) => {
      select: (cols: string) => {
        eq: (
          col: string,
          v: string,
        ) => {
          order: (
            col: string,
            o: { ascending: boolean },
          ) => {
            limit: (n: number) => Promise<{ data: unknown[] | null; error: unknown }>;
          };
        };
      };
    };
  };
  return sb
    .from("director_jobs")
    .select("id, kind, status, prompt, error, created_at, finished_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(limit);
}

export function JobsPanel() {
  const pid = useLibraryProject();
  const online = useOnlineStatus();
  const [runs, setRuns] = useState<GraphRunView[]>([]);
  const [jobs, setJobs] = useState<DirectorJob[]>([]);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [loadError, setLoadError] = useState<unknown>(null);
  const last = useKernelEvents(1)[0];
  const jobsAttempt = useRef(0);
  const runsAttempt = useRef(0);
  // Separate timers: a simultaneous double failure must not cancel
  // the other loader's retry.
  const jobsRetryTimer = useRef<number | null>(null);
  const runsRetryTimer = useRef<number | null>(null);

  const scheduleRetry = useCallback(
    (timer: React.MutableRefObject<number | null>, fn: () => void, attempt: number) => {
      if (timer.current != null) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(fn, nextBackoff(attempt));
    },
    [],
  );

  // Local graph runs — the kernel event bus drives refetch.
  const loadRuns = useCallback(() => {
    listGraphRuns({ data: { limit: PAGE_SIZE } })
      .then((r) => {
        runsAttempt.current = 0;
        setRuns(r.runs as unknown as GraphRunView[]);
        setLoadError(null);
      })
      .catch((e) => {
        // Offline → silent, stale list stays, online event refires.
        // Real errors → one ErrorBlock, silent backoff retry (no storm).
        if (isOfflineError(e)) return;
        setLoadError(e);
        const n = runsAttempt.current++;
        scheduleRetry(runsRetryTimer, loadRuns, n);
      });
  }, [scheduleRetry]);

  useEffect(() => {
    loadRuns();
  }, [loadRuns, last]);

  // Durable Director jobs (Supabase + realtime).
  const loadJobs = useCallback(() => {
    if (!pid) return;
    const projectId = pid;
    const want = limit;
    jobsQuery(projectId, want)
      .then(({ data }) => {
        jobsAttempt.current = 0;
        setJobs((data ?? []) as unknown as DirectorJob[]);
      })
      .catch((e) => {
        if (isOfflineError(e)) return; // silent; channel online-flush reloads
        const n = jobsAttempt.current++;
        scheduleRetry(jobsRetryTimer, () => loadJobs(), n);
      });
  }, [pid, limit, scheduleRetry]);

  useEffect(() => {
    jobsAttempt.current = 0;
    loadJobs();
  }, [loadJobs]);

  // Auto-flush the queue on offline→online transitions only (guarded so
  // callback identity changes never refire a load).
  const wasOnline = useRef(online);
  useEffect(() => {
    const back = online && !wasOnline.current;
    wasOnline.current = online;
    if (back) {
      jobsAttempt.current = 0;
      runsAttempt.current = 0;
      loadJobs();
      loadRuns();
    }
  }, [online, loadJobs, loadRuns]);

  useEffect(
    () => () => {
      if (jobsRetryTimer.current != null) window.clearTimeout(jobsRetryTimer.current);
      if (runsRetryTimer.current != null) window.clearTimeout(runsRetryTimer.current);
    },
    [],
  );

  // Realtime — cleanup via supabase.removeChannel inside the shared hook
  // (never the mock unsubscribe), CHANNEL_ERROR/CLOSED → backoff resubscribe,
  // bursts coalesced into a single reload, offline → no retry storm.
  const channelName = pid ? `jobs:${pid}` : null;
  const conn = useSupabaseChannel({
    name: channelName,
    build: (signal) =>
      supabase.channel(channelName as string).on(
        "postgres_changes" as never,
        {
          event: "*",
          schema: "public",
          table: "director_jobs",
          filter: `project_id=eq.${pid}`,
        },
        signal,
      ),
    onEvent: loadJobs,
  });
  const connState = online ? conn : "offline";

  const total = jobs.length + runs.length;
  const running = jobs.filter((j) => j.status === "running").length;
  const hasMore = jobs.length >= limit;

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[var(--surface-1)]">
      <div className="flex h-9 shrink-0 items-center justify-between gap-2 border-b border-[var(--line)] px-3">
        <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--text-dim)]">
          {UI_LABELS.jobs.titre}
        </div>
        <div className="flex items-center gap-2">
          <ConnPill state={connState} />
          <span className="mono text-[10px] text-[var(--text-dim)]">
            {running} {UI_LABELS.jobs.enCours} · {total} {UI_LABELS.jobs.total}
          </span>
        </div>
      </div>
      <div className="flex-1 overflow-auto p-3 text-xs text-[var(--text-muted)]">
        {loadError ? (
          <div className="mb-3">
            <ErrorBlock
              message={UI_LABELS.jobs.erreur}
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
          <>
            <ul className="space-y-2">
              {jobs.map((j) => (
                <li
                  key={j.id}
                  className="rounded border border-[var(--line)] bg-[var(--surface-2)] p-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className="mono truncate text-[10px] text-[var(--text-dim)]"
                      title={j.kind}
                    >
                      {toolLabel(j.kind)}
                    </span>
                    <span
                      className={`rounded px-1.5 py-0.5 text-[9px] uppercase ${jobBadge(j.status)}`}
                    >
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
                      <ErrorBlock
                        message={UI_LABELS.jobs.echecRendu}
                        error={j.error}
                        context={`jobs.${j.id}`}
                        compact
                      />
                    </div>
                  ) : null}
                  <div className="mono mt-1 text-[9px] text-[var(--text-dim)]">
                    {new Date(j.created_at).toLocaleTimeString("fr-FR")}
                    {j.finished_at
                      ? ` → ${new Date(j.finished_at).toLocaleTimeString("fr-FR")}`
                      : ""}
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
                    <span
                      className={`rounded px-1.5 py-0.5 text-[9px] uppercase ${jobBadge(r.status)}`}
                    >
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
            {hasMore ? (
              <div className="mt-3 flex justify-center pb-2">
                <button
                  onClick={() => setLimit((l) => l + PAGE_SIZE)}
                  className="rounded-md border border-[var(--line)] bg-[var(--surface-2)] px-4 py-1.5 text-[11px] text-[var(--text-muted)] hover:border-[var(--line-strong)] hover:text-[var(--text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
                >
                  {UI_LABELS.jobs.suite} ({jobs.length})
                </button>
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
