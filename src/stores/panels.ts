import { create } from "zustand";
import { persist } from "zustand/middleware";

export type SidebarModule =
  | "library"
  | "timeline"
  | "connectors"
  | "jobs"
  | "director";

interface PanelStore {
  activeModule: SidebarModule;
  setActiveModule: (m: SidebarModule) => void;
  bottomCollapsed: boolean;
  inspectorCollapsed: boolean;
  toggle: (which: "bottom" | "inspector") => void;
  layout: { center: number; inspector: number; bottom: number };
  setLayout: (l: Partial<PanelStore["layout"]>) => void;
}

export const usePanelStore = create<PanelStore>()(
  persist(
    (set) => ({
      activeModule: "director",
      setActiveModule: (m) => set({ activeModule: m }),
      bottomCollapsed: false,
      inspectorCollapsed: false,
      toggle: (which) =>
        set((s) => ({
          bottomCollapsed: which === "bottom" ? !s.bottomCollapsed : s.bottomCollapsed,
          inspectorCollapsed: which === "inspector" ? !s.inspectorCollapsed : s.inspectorCollapsed,
        })),
      layout: { center: 74, inspector: 26, bottom: 32 },
      setLayout: (l) => set((s) => ({ layout: { ...s.layout, ...l } })),
    }),
    { name: "lilium.panels.v1" },
  ),
);
