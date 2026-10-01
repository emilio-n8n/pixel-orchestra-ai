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
  /** Dev drawer: plugin count + raw event stream in the status bar. */
  devMode: boolean;
  setDevMode: (v: boolean) => void;
  /**
   * Studio V2 zone sizes, in percent of the relevant panel group.
   * `agent` + `assets` + `player` fill the top row; `bottom` is the timeline
   * share of the vertical split.
   */
  layout: { agent: number; assets: number; player: number; bottom: number };
  setLayout: (l: Partial<PanelStore["layout"]>) => void;
  /** Mobile-only: ChatGPT-like chat home vs full studio view. */
  mobileView: "chat" | "studio";
  setMobileView: (v: "chat" | "studio") => void;
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
      layout: { agent: 25, assets: 25, player: 50, bottom: 38 },
      setLayout: (l) => set((s) => ({ layout: { ...s.layout, ...l } })),
      mobileView: "chat",
      setMobileView: (mobileView) => set({ mobileView }),
    }),
    { name: "lilium.panels.v2" },
  ),
);
