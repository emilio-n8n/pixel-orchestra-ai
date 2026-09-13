import { Clapperboard } from "lucide-react";
import { usePanelStore } from "@/stores/panels";
import { DirectorPanel } from "@/plugins/director/DirectorPanel";
import { UI_LABELS } from "@/lib/ui/labels";

/**
 * Mobile chat home (ChatGPT-like): full-screen Director, nothing else.
 * The full studio lives one tap away via the Studio button — never
 * condensed into the same screen.
 */
export function MobileChatView() {
  const setMobileView = usePanelStore((s) => s.setMobileView);
  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--surface-0)]">
      <header className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-[var(--line)] bg-[var(--rail)] px-3">
        <div className="flex min-w-0 items-center gap-2">
          <span
            aria-hidden
            className="inline-block h-[18px] w-[18px] shrink-0 rounded-[6px]"
            style={{
              background:
                "conic-gradient(from 210deg, var(--accent-strong), var(--accent), var(--accent-quiet), var(--accent))",
            }}
          />
          <span className="truncate text-[13px] font-semibold tracking-tight text-[var(--text)]">
            Lilium
          </span>
        </div>
        <button
          type="button"
          onClick={() => setMobileView("studio")}
          title={UI_LABELS.mobile.ouvrirStudio}
          className="touch-44 flex h-9 items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 text-[13px] font-medium text-[var(--accent-fg)] transition-all duration-150 ease-out hover:bg-[var(--accent-strong)] active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
        >
          <Clapperboard size={15} />
          {UI_LABELS.mobile.studio}
        </button>
      </header>
      <div className="min-h-0 flex-1">
        <DirectorPanel />
      </div>
    </div>
  );
}
