import { create } from "zustand";
import { persist } from "zustand/middleware";

export type SidebarModule = string;

interface PanelStore {
  activeModule: SidebarModule;
  setActiveModule: (m: SidebarModule) => void;
  bottomCollapsed: boolean;
  inspectorCollapsed: boolean;
  toggle: (which: "bottom" | "inspector") => void;
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  devMode: boolean;
  setDevMode: (v: boolean) => void;
  layout: { center: number; inspector: number; bottom: number };
  setLayout: (l: Partial<PanelStore["layout"]>) => void;
}

export const usePanelStore = create<PanelStore>()(
  persist(
    (set) => ({
      activeModule: "timeline",
      setActiveModule: (m) => set({ activeModule: m }),
      bottomCollapsed: false,
      inspectorCollapsed: false,
      toggle: (which) =>
        set((s) => ({
          bottomCollapsed: which === "bottom" ? !s.bottomCollapsed : s.bottomCollapsed,
          inspectorCollapsed: which === "inspector" ? !s.inspectorCollapsed : s.inspectorCollapsed,
        })),
      sidebarCollapsed: false,
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      devMode: false,
      setDevMode: (v) => set({ devMode: v }),
      layout: { center: 74, inspector: 26, bottom: 32 },
      setLayout: (l) => set((s) => ({ layout: { ...s.layout, ...l } })),
    }),
    { name: "lilium.panels.v2" },
  ),
);
