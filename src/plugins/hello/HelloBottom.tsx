import { useKernelEvents } from "@/kernel/react";

export function HelloBottom() {
  const events = useKernelEvents(200);
  const pings = events.filter((e) => e.type === "Custom.hello.ping");

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="border-b border-[var(--line)] px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--text-dim)]">
        Hello log · Custom.hello.ping
      </div>
      <div className="flex-1 overflow-auto px-3 py-2 text-[11px]">
        {pings.length === 0 ? (
          <div className="text-[var(--text-dim)]">no pings yet — try ⌘K → Hello: Ping</div>
        ) : (
          <ul className="space-y-0.5">
            {pings
              .slice()
              .reverse()
              .map((e) => {
                const payload = (e as unknown as { payload?: { i?: number } }).payload;
                return (
                  <li key={e.id} className="mono text-[var(--text-muted)]">
                    <span className="text-[var(--text-dim)]">
                      {new Date(e.ts).toLocaleTimeString()}
                    </span>{" "}
                    <span className="text-[var(--accent)]">ping</span>
                    {payload?.i !== undefined ? (
                      <span className="text-[var(--text-dim)]"> #{payload.i}</span>
                    ) : null}
                  </li>
                );
              })}
          </ul>
        )}
      </div>
    </div>
  );
}
