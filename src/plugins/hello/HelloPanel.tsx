import type { ReactNode } from "react";
import { useKernelEvents } from "@/kernel/react";

export function HelloPanel() {
  const events = useKernelEvents(60);
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="border-b border-[var(--line)] px-6 py-5">
        <div className="text-[11px] uppercase tracking-[0.18em] text-[var(--text-dim)]">Lilium Studio</div>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Welcome to your workspace</h1>
        <p className="mt-2 max-w-2xl text-sm text-[var(--text-muted)]">
          Everything here is a plugin. This panel, the sidebar, the viewers, the connectors — the kernel only
          orchestrates contracts. Open the command palette (⌘K) to see what's wired in so far.
        </p>
      </div>
      <div className="grid flex-1 grid-cols-2 gap-px overflow-hidden bg-[var(--line)]">
        <div className="flex flex-col overflow-hidden bg-[var(--surface-1)]">
          <div className="px-4 pt-3 pb-2 text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--text-dim)]">
            Kernel event stream
          </div>
          <div className="flex-1 overflow-auto px-4 pb-4">
            {events.length === 0 ? (
              <div className="mono text-xs text-[var(--text-dim)]">no events yet — try ⌘K → Hello: Ping</div>
            ) : (
              <ul className="space-y-1">
                {events.slice().reverse().map((e) => (
                  <li key={e.id} className="mono text-[11px] leading-relaxed text-[var(--text-muted)]">
                    <span className="text-[var(--text-dim)]">{new Date(e.ts).toLocaleTimeString()}</span>{" "}
                    <span className="text-[var(--accent)]">{e.type}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <div className="flex flex-col overflow-hidden bg-[var(--surface-1)]">
          <div className="px-4 pt-3 pb-2 text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--text-dim)]">
            Roadmap
          </div>
          <div className="space-y-3 px-4 pb-4 text-sm">
            <Step n={1} title="Kernel & Shell" done>
              Event bus, plugin host, registry, resizable workspace shell.
            </Step>
            <Step n={2} title="Assets & Library">
              Storage adapter, asset model, drag & drop import, typed viewers.
            </Step>
            <Step n={3} title="Connectors & Capabilities">
              Gradio, ComfyUI, OpenAI, MCP… introspected, auto-formed.
            </Step>
            <Step n={4} title="Node Graph & Scheduler">
              Every generation compiles to a graph the scheduler runs.
            </Step>
            <Step n={5} title="AI Context, Storyboard, Timeline, Versioning, Agent, Public API" />
          </div>
        </div>
      </div>
    </div>
  );
}

function Step({ n, title, done, children }: { n: number; title: string; done?: boolean; children?: ReactNode }) {
  return (
    <div className="flex gap-3">
      <div
        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ${
          done
            ? "bg-[var(--accent-quiet)] text-[var(--accent-strong)]"
            : "border border-[var(--line-strong)] text-[var(--text-dim)]"
        }`}
      >
        {done ? "✓" : n}
      </div>
      <div>
        <div className="text-[var(--text)]">{title}</div>
        {children ? <div className="text-xs text-[var(--text-dim)]">{children}</div> : null}
      </div>
    </div>
  );
}