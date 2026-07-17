import { create } from "zustand";
import { persist } from "zustand/middleware";

export const OPENCODE_GO_MODELS = [
  { id: "grok-4.5", label: "Grok 4.5" },
  { id: "glm-5.2", label: "GLM-5.2" },
  { id: "glm-5.1", label: "GLM-5.1" },
  { id: "kimi-k3", label: "Kimi K3" },
  { id: "kimi-k2.7-code", label: "Kimi K2.7 Code" },
  { id: "kimi-k2.6", label: "Kimi K2.6" },
  { id: "deepseek-v4-pro", label: "DeepSeek V4 Pro" },
  { id: "deepseek-v4-flash", label: "DeepSeek V4 Flash" },
  { id: "mimo-v2.5", label: "MiMo-V2.5" },
  { id: "mimo-v2.5-pro", label: "MiMo-V2.5-Pro" },
  { id: "minimax-m3", label: "MiniMax M3" },
  { id: "minimax-m2.7", label: "MiniMax M2.7" },
  { id: "minimax-m2.5", label: "MiniMax M2.5" },
  { id: "qwen3.7-max", label: "Qwen3.7 Max" },
  { id: "qwen3.7-plus", label: "Qwen3.7 Plus" },
  { id: "qwen3.6-plus", label: "Qwen3.6 Plus" },
] as const;

interface DirectorStore {
  apiKey: string;
  model: string;
  showSettings: boolean;
  customModel: string;
  setApiKey: (key: string) => void;
  setModel: (m: string) => void;
  setShowSettings: (v: boolean) => void;
  setCustomModel: (m: string) => void;
}

export const useDirectorStore = create<DirectorStore>()(
  persist(
    (set) => ({
      apiKey: "",
      model: "kimi-k2.7-code",
      showSettings: false,
      customModel: "",
      setApiKey: (apiKey) => set({ apiKey }),
      setModel: (model) => set({ model }),
      setShowSettings: (showSettings) => set({ showSettings }),
      setCustomModel: (customModel) => set({ customModel }),
    }),
    { name: "lilium.director.v1" },
  ),
);
