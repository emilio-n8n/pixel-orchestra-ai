import { create } from "zustand";
import type { AssetRow } from "./types";

interface LibraryState {
  /** Currently selected asset, or null. CenterView uses this to switch into
   *  viewer mode. */
  selected: AssetRow | null;
  setSelected: (a: AssetRow | null) => void;
}

export const useLibrary = create<LibraryState>((set) => ({
  selected: null,
  setSelected: (a) => set({ selected: a }),
}));
