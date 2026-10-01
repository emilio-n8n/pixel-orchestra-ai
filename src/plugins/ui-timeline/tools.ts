/**
 * Timeline tool state (spec B.1): Select (V) and Scissors (C).
 *
 * Persisted so a reload keeps the tool the user was working in, and kept in
 * its own store because the toolbar, the track lanes and the keyboard map all
 * need it — none of them should have to own it.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type TimelineTool = "select" | "scissors";

interface ToolState {
  tool: TimelineTool;
  setTool: (t: TimelineTool) => void;
  /** Convenience for the key map and the toolbar buttons. */
  toggleScissors: () => void;
}

export const useToolStore = create<ToolState>()(
  persist(
    (set) => ({
      tool: "select",
      setTool: (tool) => set({ tool }),
      toggleScissors: () => set((s) => ({ tool: s.tool === "scissors" ? "select" : "scissors" })),
    }),
    { name: "lilium.timeline.tool.v1" },
  ),
);
