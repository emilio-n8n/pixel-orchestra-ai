import { useKernel, useKernelEvents } from "@/kernel/react";

export function HelloInspector() {
  const { host } = useKernel();
  const events = useKernelEvents(200);
  const pings = events.filter((e) => e.type === "Custom.hello.ping");
  const last = pings[pings.length - 1];

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="border-b border-[var(--line)] px-3 py-2">
        <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--text-dim)]">
          Hello plugin
        </div>
      </div>
      <div className="flex-1 overflow-auto p-3 text-[12px] text-[var(--text-muted)]">
        <div className="space-y-2">
          <Row k="id" v="com.lilium.builtin.hello" />
          <Row k="version" v="0.1.0" />
          <Row k="slot" v="inspector" />
          <Row k="active" v={String(host.isActive("com.lilium.builtin.hello"))} />
          <Row k="plugins" v={String(host.count())} />
          <div className="mt-3 border-t border-[var(--line)] pt-3">
            <div className="text-[10px] uppercase tracking-widest text-[var(--text-dim)]">
              Last ping
            </div>
            <div className="mono mt-1 text-[11px]">
              {last ? (
                <>
                  <span className="text-[var(--text-dim)]">
                    {new Date(last.ts).toLocaleTimeString()}
                  </span>{" "}
                  <span className="text-[var(--accent)]">{last.type}</span>
                </>
              ) : (
                <span className="text-[var(--text-dim)]">— (try ⌘K → Hello: Ping)</span>
              )}
            </div>
            <div className="mt-2 text-[10px] uppercase tracking-widest text-[var(--text-dim)]">
              Pings seen
            </div>
            <div className="mono mt-1 text-[11px]">{pings.length}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-[10px] uppercase tracking-widest text-[var(--text-dim)]">{k}</span>
      <span className="mono truncate text-right text-[11px] text-[var(--text)]">{v}</span>
    </div>
  );
}
