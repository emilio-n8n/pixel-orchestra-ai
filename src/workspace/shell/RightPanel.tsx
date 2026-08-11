import { useEffect, useState } from "react";
import { Sparkles, SlidersHorizontal } from "lucide-react";
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
      <div className="flex h-10 shrink-0 items-center gap-1 border-b border-[var(--line)] px-2">
        <TabButton
          label="Assistant"
          icon={<Sparkles size={13} />}
          active={tab === "chat"}
          onClick={() => setOverride("chat")}
        />
        <TabButton
          label="Propriétés"
          icon={<SlidersHorizontal size={13} />}
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
  icon,
  active,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex h-7 flex-1 items-center justify-center gap-1.5 rounded-lg text-[12px] transition-colors duration-150 ease-out ${
        active
          ? "bg-[var(--surface-3)] text-[var(--text)]"
          : "text-[var(--text-dim)] hover:text-[var(--text-muted)]"
      }`}
    >
      <span className={active ? "text-[var(--accent-strong)]" : undefined}>{icon}</span>
      <span>{label}</span>
    </button>
  );
}
