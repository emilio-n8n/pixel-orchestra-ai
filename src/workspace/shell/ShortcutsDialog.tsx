import { X } from "lucide-react";
import { UI_LABELS } from "@/lib/ui/labels";

const T = UI_LABELS.timeline;

const ROWS: Array<{ keys: string; action: string }> = [
  { keys: "⌘K / Ctrl+K", action: UI_LABELS.raccourcis.palette },
  { keys: "?", action: UI_LABELS.raccourcis.aide },
  { keys: "V", action: T.outilSelecteur },
  { keys: "C", action: T.outilCiseaux },
  { keys: "Suppr / ⌫", action: T.outilSupprimer },
  { keys: "⇧ Suppr", action: UI_LABELS.raccourcis.compacter },
  { keys: "← / →", action: UI_LABELS.raccourcis.nudge },
  { keys: "⇧ ← / →", action: UI_LABELS.raccourcis.nudgeRapide },
  { keys: "Espace", action: UI_LABELS.raccourcis.lecture },
  { keys: "⌘Z / ⇧⌘Z", action: `${T.undo} · ${T.redo}` },
  { keys: "⌘− / ⌘+", action: `${T.zoomArriere} · ${T.zoomAvant}` },
  { keys: "Entrée", action: UI_LABELS.raccourcis.envoyerInvite },
  { keys: "Échap", action: UI_LABELS.raccourcis.fermer },
];

export function ShortcutsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={UI_LABELS.raccourcis.titre}
        className="w-[420px] max-w-full overflow-hidden rounded-xl border border-[var(--line-strong)] bg-[var(--surface-3)] shadow-[var(--shadow-pop)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3">
          <div className="text-[13px] font-medium text-[var(--text)]">
            {UI_LABELS.raccourcis.titre}
          </div>
          <button
            onClick={onClose}
            title={UI_LABELS.common.fermer}
            aria-label={UI_LABELS.common.fermer}
            className="ghost-btn h-7 w-7 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
          >
            <X size={14} />
          </button>
        </div>
        <p className="px-4 pt-3 text-[12px] leading-relaxed text-[var(--text-dim)]">
          {UI_LABELS.raccourcis.description}
        </p>
        <ul className="space-y-1 px-4 py-3">
          {ROWS.map((r) => (
            <li key={r.keys} className="flex items-center justify-between gap-3 text-[12px]">
              <span className="text-[var(--text-muted)]">{r.action}</span>
              <kbd className="shrink-0 rounded border border-[var(--line)] bg-[var(--surface-2)] px-1.5 py-0.5 text-[10px] text-[var(--text-dim)]">
                {r.keys}
              </kbd>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
