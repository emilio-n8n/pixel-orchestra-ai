import type { ReactNode } from "react";
import { useKernelEvents } from "@/kernel/react";

export function HelloPanel() {
  const events = useKernelEvents(60);
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="border-b border-[var(--line)] px-6 py-5">
        <div className="text-[11px] uppercase tracking-[0.18em] text-[var(--text-dim)]">
          Lilium Studio
        </div>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Bienvenue dans votre espace</h1>
        <p className="mt-2 max-w-2xl text-sm text-[var(--text-muted)]">
          Ici, tout est un plugin. Ce panneau, la barre latérale, les visionneuses, les connexions —
          le noyau ne fait qu’orchestrer les contrats. Ouvrez la palette de commandes (⌘K) pour voir
          ce qui est déjà branché.
        </p>
      </div>
      <div className="grid flex-1 grid-cols-1 gap-px overflow-hidden bg-[var(--line)] md:grid-cols-2">
        <div className="flex flex-col overflow-hidden bg-[var(--surface-1)]">
          <div className="px-4 pt-3 pb-2 text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--text-dim)]">
            Flux d’évènements du noyau
          </div>
          <div className="flex-1 overflow-auto px-4 pb-4">
            {events.length === 0 ? (
              <div className="mono text-xs text-[var(--text-dim)]">
                aucun évènement — essayez ⌘K → Bonjour : Ping du bus
              </div>
            ) : (
              <ul className="space-y-1">
                {events
                  .slice()
                  .reverse()
                  .map((e) => (
                    <li
                      key={e.id}
                      className="mono text-[11px] leading-relaxed text-[var(--text-muted)]"
                    >
                      <span className="text-[var(--text-dim)]">
                        {new Date(e.ts).toLocaleTimeString("fr-FR")}
                      </span>{" "}
                      <span className="text-[var(--accent)]">{e.type}</span>
                    </li>
                  ))}
              </ul>
            )}
          </div>
        </div>
        <div className="flex flex-col overflow-hidden bg-[var(--surface-1)]">
          <div className="px-4 pt-3 pb-2 text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--text-dim)]">
            Feuille de route
          </div>
          <div className="space-y-3 px-4 pb-4 text-sm">
            <Step n={1} title="Noyau & Shell" done>
              Bus d’évènements, hôte de plugins, registre, shell redimensionnable.
            </Step>
            <Step n={2} title="Médias & Médiathèque">
              Adaptateur de stockage, modèle de médias, import par glisser-déposer, visionneuses
              typées.
            </Step>
            <Step n={3} title="Connexions & Moteurs">
              Gradio, ComfyUI, OpenAI, MCP… introspectés, formulaires auto-générés.
            </Step>
            <Step n={4} title="Flux créatif & Planificateur">
              Chaque génération compile un flux que le planificateur exécute.
            </Step>
            <Step n={5} title="Contexte IA, Scènes, Éditeur, Versions, Agent, API publique" />
          </div>
        </div>
      </div>
    </div>
  );
}

function Step({
  n,
  title,
  done,
  children,
}: {
  n: number;
  title: string;
  done?: boolean;
  children?: ReactNode;
}) {
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
