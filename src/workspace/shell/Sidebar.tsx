import { useMemo } from "react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { usePanelStore } from "@/stores/panels";
import { useRegistrySnapshot } from "@/kernel/react";
import { GROUP_LABELS, moduleMeta, type ModuleMeta } from "@/lib/ui/labels";

interface NavItem extends ModuleMeta {
  id: string;
}

/** "storyboard.center" → "storyboard" */
function moduleIdFromPanelId(panelId: string): string {
  return panelId.split(".")[0] ?? panelId;
}

const CORE_MODULE_IDS = ["timeline", "library", "storyboard", "characters", "jobs", "graph", "connectors"];

export function Sidebar() {
  const active = usePanelStore((s) => s.activeModule);
  const setActive = usePanelStore((s) => s.setActiveModule);
  const collapsed = usePanelStore((s) => s.sidebarCollapsed);
  const toggleSidebar = usePanelStore((s) => s.toggleSidebar);
  const registry = useRegistrySnapshot();

  const items = useMemo<NavItem[]>(() => {
    const ids = new Map<string, string | undefined>();
    for (const id of CORE_MODULE_IDS) ids.set(id, undefined);
    for (const p of registry.panelsForSlot("center")) {
      const id = moduleIdFromPanelId(p.id);
      if (!ids.has(id)) ids.set(id, p.title);
    }
    for (const p of registry.panelsForSlot("sidebar")) {
      if (!ids.has(p.id)) ids.set(p.id, p.title);
    }
    return [...ids.entries()]
      .map(([id, title]) => ({ id, ...moduleMeta(id, title) }))
      .sort((a, b) => a.order - b.order);
  }, [registry]);

  const groups: Array<ModuleMeta["group"]> = ["create", "produce"];

  return (
    <aside
      className={`flex h-full shrink-0 flex-col border-r border-[var(--line)] bg-[var(--rail)] transition-[width] duration-200 ease-out ${
        collapsed ? "w-[52px]" : "w-[186px]"
      }`}
    >
      <nav className="flex-1 overflow-y-auto px-2 py-3">
        {groups.map((g) => {
          const groupItems = items.filter((i) => i.group === g);
          if (groupItems.length === 0) return null;
          return (
            <div key={g} className="mb-4">
              {!collapsed ? (
                <div className="t-meta px-2 pb-1.5 text-[9.5px]">{GROUP_LABELS[g]}</div>
              ) : null}
              <div className="flex flex-col gap-0.5">
                {groupItems.map((it) => {
                  const isActive = it.id === active;
                  const Icon = it.icon;
                  return (
                    <button
                      key={it.id}
                      title={it.label}
                      onClick={() => setActive(it.id)}
                      className={`group relative flex h-8 items-center rounded-lg text-[12.5px] transition-colors duration-150 ease-out ${
                        collapsed ? "justify-center px-0" : "gap-2.5 px-2.5"
                      } ${
                        isActive
                          ? "bg-[var(--surface-3)] text-[var(--text)]"
                          : "text-[var(--text-dim)] hover:bg-[var(--surface-2)] hover:text-[var(--text-muted)]"
                      }`}
                    >
                      <Icon
                        size={15}
                        strokeWidth={1.7}
                        className={isActive ? "text-[var(--accent-strong)]" : ""}
                      />
                      {!collapsed ? <span className="truncate">{it.label}</span> : null}
                      {isActive ? (
                        <span className="absolute left-0 top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-r-full bg-[var(--accent)]" />
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      <button
        onClick={toggleSidebar}
        title={collapsed ? "Déplier le menu" : "Replier le menu"}
        className="ghost-btn m-2 h-7 shrink-0 text-[var(--text-dim)]"
      >
        {collapsed ? <PanelLeftOpen size={14} /> : <PanelLeftClose size={14} />}
        {!collapsed ? <span className="text-[11px]">Replier</span> : null}
      </button>
    </aside>
  );
}
