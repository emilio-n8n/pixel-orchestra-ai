import { createFileRoute, Link } from "@tanstack/react-router";
import { useKernel } from "@/kernel/react";

export const Route = createFileRoute("/settings")({
  ssr: false,
  component: SettingsPage,
});

function SettingsPage() {
  const kernel = useKernel();
  const plugins = kernel.host.list();

  return (
    <div className="min-h-screen bg-[var(--surface-0)]">
      <div className="mx-auto max-w-4xl px-8 pt-16 pb-16">
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
            <div className="text-[11px] uppercase tracking-[0.22em] text-[var(--text-dim)]">
              Lilium
            </div>
            <div className="text-[22px] font-semibold tracking-tight">Settings</div>
          </div>
        </div>

        <div className="mt-10 space-y-10">
          <section>
            <h2 className="text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--text-dim)]">
              Plugins
            </h2>
            <div className="mt-3 overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--surface-1)]">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-[var(--line)] text-[10px] uppercase tracking-widest text-[var(--text-dim)]">
                    <th className="px-3 py-2 font-medium">Plugin</th>
                    <th className="px-3 py-2 font-medium">ID</th>
                    <th className="px-3 py-2 font-medium">Version</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {plugins.map((p) => (
                    <tr key={p.id} className="border-b border-[var(--line)]/50 last:border-0">
                      <td className="px-3 py-2 text-[var(--text)]">
                        <div>{p.name}</div>
                        {p.description ? (
                          <div className="text-[11px] text-[var(--text-muted)]">{p.description}</div>
                        ) : null}
                      </td>
                      <td className="mono px-3 py-2 text-[11px] text-[var(--text-muted)]">{p.id}</td>
                      <td className="mono px-3 py-2 text-[11px] text-[var(--text-muted)]">
                        {p.version}
                      </td>
                      <td className="px-3 py-2">
                        <span className="rounded bg-[var(--accent-quiet)] px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-[var(--accent-strong)]">
                          active
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h2 className="text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--text-dim)]">
              Theme
            </h2>
            <div className="mt-3 rounded-lg border border-[var(--line)] bg-[var(--surface-1)] p-4 text-sm text-[var(--text-muted)]">
              Dark theme only (CSS variables) — a light theme ships in a later phase.
            </div>
          </section>

          <section>
            <h2 className="text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--text-dim)]">
              About
            </h2>
            <div className="mt-3 rounded-lg border border-[var(--line)] bg-[var(--surface-1)] p-4 text-sm text-[var(--text-muted)]">
              <p>Lilium Studio — plugin-first AI content production workspace.</p>
              <p className="mt-1">
                Stack: TanStack Start + Nitro · Cloudflare Workers · Bun · Supabase.
              </p>
            </div>
          </section>
        </div>

        <Link
          to="/"
          className="mt-12 inline-block text-xs text-[var(--text-dim)] underline underline-offset-4 hover:text-[var(--text-muted)]"
        >
          ← Back to workspaces
        </Link>
      </div>
    </div>
  );
}
