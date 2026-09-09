import { useKernelEvents } from "@/kernel/react";

export function HelloSidebar() {
  const events = useKernelEvents(50);
  const last = events[events.length - 1];

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[var(--rail)]">
      <div className="border-b border-[var(--line)] px-3 py-2 text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--text-dim)]">
        Bonjour (panneau latéral)
      </div>
      <div className="flex-1 overflow-auto p-3 text-[11px] text-[var(--text-muted)]">
        <p>
          Ce panneau est fourni par le plugin <span className="mono text-[var(--accent)]">hello</span>{" "}
          (emplacement : <span className="mono">sidebar</span>). Les modules de la barre latérale
          viennent de <span className="mono">registry.panelsForSlot('sidebar')</span> — aucune
          liste en dur.
        </p>
        <div className="mt-3 border-t border-[var(--line)] pt-2">
          <div className="text-[10px] uppercase tracking-widest text-[var(--text-dim)]">
            Dernier évènement
          </div>
          <div className="mono mt-1 text-[11px]">
            {last ? (
              <>
                <span className="text-[var(--text-dim)]">
                  {new Date(last.ts).toLocaleTimeString("fr-FR")}
                </span>{" "}
                <span className="text-[var(--accent)]">{last.type}</span>
              </>
            ) : (
              <span className="text-[var(--text-dim)]">—</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
