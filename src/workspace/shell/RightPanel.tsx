import { useEffect, useState } from "react";
import { usePanelStore } from "@/stores/panels";
import { DirectorPanel } from "@/plugins/director/DirectorPanel";
import { Inspector } from "./Inspector";

type Tab = "chat" | "inspect";

/**
 * Contextual right panel: shows the Director chat while the user is editing
 * the timeline, and switches to the Inspector (asset editing + plugin panels
 * like Characters) when the Library module is active. The user can manually
 * toggle via the tab bar; the override resets when the active module changes
 * so we always return to the sensible default.
 */
export function RightPanel() {
  const active = usePanelStore((s) => s.activeModule);
  const [override, setOverride] = useState<Tab | null>(null);

  // Changing sidebar module → return to the default derived from `active`.
  useEffect(() => {
    setOverride(null);
  }, [active]);

  const tab: Tab = override ?? (active === "library" ? "inspect" : "chat");

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--surface-1)]">
      <div className="flex h-9 shrink-0 border-b border-[var(--line)]">
        <TabButton
          label="Chat"
          glyph="✦"
          active={tab === "chat"}
          onClick={() => setOverride("chat")}
        />
        <TabButton
          label="Inspect"
          glyph="▤"
          active={tab === "inspect"}
          onClick={() => setOverride("inspect")}
        />
      </div>
      <div className="min-h-0 flex-1">
        {tab === "chat" ? <DirectorPanel /> : <Inspector />}
      </div>
    </div>
  );
}

function TabButton({
  label,
  glyph,
  active,
  onClick,
}: {
  label: string;
  glyph: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`relative flex flex-1 items-center justify-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.16em] transition-colors ${
        active
          ? "text-[var(--accent-strong)]"
          : "text-[var(--text-dim)] hover:text-[var(--text)]"
      }`}
    >
      <span aria-hidden className="text-[12px] leading-none">
        {glyph}
      </span>
      <span>{label}</span>
      {active ? (
        <span className="absolute inset-x-0 bottom-0 h-[2px] bg-[var(--accent)]" />
      ) : null}
    </button>
  );
}
