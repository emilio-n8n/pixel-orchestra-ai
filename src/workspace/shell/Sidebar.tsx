import { useMemo } from "react";
import { usePanelStore, type SidebarModule } from "@/stores/panels";
import { useRegistrySnapshot } from "@/kernel/react";

interface RailItem {
  id: string;
  label: string;
  glyph: string;
  order: number;
}

const CORE_MODULES: Array<{ id: SidebarModule; label: string; glyph: string; order: number }> = [
  { id: "library", label: "Library", glyph: "▤", order: 10 },
  { id: "storyboard", label: "Storyboard", glyph: "▦", order: 20 },
  { id: "timeline", label: "Timeline", glyph: "▭", order: 30 },
  { id: "graph", label: "Node Graph", glyph: "◇", order: 40 },
  { id: "characters", label: "Characters", glyph: "◐", order: 50 },
  { id: "connectors", label: "Connectors", glyph: "◈", order: 60 },
  { id: "jobs", label: "Jobs", glyph: "≣", order: 70 },
  { id: "settings", label: "Settings", glyph: "✱", order: 80 },
];

export function Sidebar() {
  const active = usePanelStore((s) => s.activeModule);
  const setActive = usePanelStore((s) => s.setActiveModule);
  const registry = useRegistrySnapshot();

  const pluginItems = useMemo<RailItem[]>(
    () =>
      registry.panelsForSlot("sidebar").map((p) => ({
        id: p.id,
        label: p.title,
        glyph: (p.icon ?? p.title).slice(0, 2),
        order: p.order ?? 1000,
      })),
    [registry],
  );

  const items: RailItem[] = [
    ...CORE_MODULES,
    ...pluginItems.filter((pi) => !CORE_MODULES.some((cm) => cm.id === pi.id)),
  ];

  return (
    <aside className="flex h-full w-12 shrink-0 flex-col items-center gap-1 border-r border-[var(--line)] bg-[var(--rail)] py-2">
      {items.map((it) => {
        const isActive = it.id === active;
        return (
          <button
            key={it.id}
            title={it.label}
            onClick={() => setActive(it.id as SidebarModule)}
            className={`group relative flex h-9 w-9 items-center justify-center rounded-md text-[15px] transition-colors ${
              isActive
                ? "bg-[var(--accent-quiet)] text-[var(--accent-strong)]"
                : "text-[var(--text-dim)] hover:bg-[var(--surface-3)] hover:text-[var(--text)]"
            }`}
          >
            <span aria-hidden className="mono text-[10px]">
              {it.glyph}
            </span>
            {isActive ? (
              <span className="absolute left-0 top-1/2 h-5 w-[2px] -translate-y-1/2 rounded-r bg-[var(--accent)]" />
            ) : null}
          </button>
        );
      })}
    </aside>
  );
}
