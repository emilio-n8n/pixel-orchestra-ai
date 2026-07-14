import { usePanelStore, type SidebarModule } from "@/stores/panels";

const items: Array<{ id: SidebarModule; label: string; glyph: string }> = [
  { id: "library", label: "Library", glyph: "▤" },
  { id: "storyboard", label: "Storyboard", glyph: "▦" },
  { id: "timeline", label: "Timeline", glyph: "▭" },
  { id: "graph", label: "Node Graph", glyph: "◇" },
  { id: "characters", label: "Characters", glyph: "◐" },
  { id: "connectors", label: "Connectors", glyph: "◈" },
  { id: "jobs", label: "Jobs", glyph: "≣" },
  { id: "settings", label: "Settings", glyph: "✱" },
];

export function Sidebar() {
  const active = usePanelStore((s) => s.activeModule);
  const setActive = usePanelStore((s) => s.setActiveModule);
  return (
    <aside className="flex h-full w-12 shrink-0 flex-col items-center gap-1 border-r border-[var(--line)] bg-[var(--rail)] py-2">
      {items.map((it) => {
        const isActive = it.id === active;
        return (
          <button
            key={it.id}
            title={it.label}
            onClick={() => setActive(it.id)}
            className={`group relative flex h-9 w-9 items-center justify-center rounded-md text-[15px] transition-colors ${
              isActive
                ? "bg-[var(--accent-quiet)] text-[var(--accent-strong)]"
                : "text-[var(--text-dim)] hover:bg-[var(--surface-3)] hover:text-[var(--text)]"
            }`}
          >
            <span aria-hidden>{it.glyph}</span>
            {isActive ? (
              <span className="absolute left-0 top-1/2 h-5 w-[2px] -translate-y-1/2 rounded-r bg-[var(--accent)]" />
            ) : null}
          </button>
        );
      })}
    </aside>
  );
}