import { useMemo } from "react";
import { usePanelStore } from "@/stores/panels";
import { useRegistrySnapshot } from "@/kernel/react";

interface RailItem {
  id: string;
  label: string;
  glyph: string;
  order: number;
}

const CORE_MODULES: Array<{ id: string; label: string; glyph: string; order: number }> = [
  { id: "library", label: "Library", glyph: "▤", order: 10 },
  { id: "timeline", label: "Timeline", glyph: "▭", order: 30 },
  { id: "connectors", label: "Connectors", glyph: "◈", order: 60 },
  { id: "jobs", label: "Jobs", glyph: "≣", order: 70 },
];

/** "storyboard.center" → "storyboard" */
function moduleIdFromPanelId(panelId: string): string {
  return panelId.split(".")[0] ?? panelId;
}

export function Sidebar() {
  const active = usePanelStore((s) => s.activeModule);
  const setActive = usePanelStore((s) => s.setActiveModule);
  const registry = useRegistrySnapshot();

  const items = useMemo<RailItem[]>(() => {
    // Plugin panels rarely ship an icon — use a single readable glyph instead
    // of two truncated letters ("St", "No"…).
    const glyphFor = (title: string, icon?: string) =>
      icon ? icon.slice(0, 2) : (title.trim()[0] ?? "◆").toUpperCase();

    const pluginSidebar: RailItem[] = registry.panelsForSlot("sidebar").map((p) => ({
      id: p.id,
      label: p.title,
      glyph: glyphFor(p.title, p.icon),
      order: p.order ?? 1000,
    }));

    // Every center panel becomes a rail entry keyed by its module prefix.
    const pluginCenter: RailItem[] = registry.panelsForSlot("center").map((p) => ({
      id: moduleIdFromPanelId(p.id),
      label: p.title,
      glyph: glyphFor(p.title, p.icon),
      order: p.order ?? 1000,
    }));

    const known = new Set(CORE_MODULES.map((cm) => cm.id));
    const merged: RailItem[] = [...CORE_MODULES];
    for (const item of [...pluginSidebar, ...pluginCenter]) {
      if (!known.has(item.id)) {
        known.add(item.id);
        merged.push(item);
      }
    }
    return merged.sort((a, b) => a.order - b.order);
  }, [registry]);

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
