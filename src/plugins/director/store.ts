import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { UIMessage } from "ai";

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

export interface Conversation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: UIMessage[];
}

function makeId() {
  return `conv_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
}

function defaultTitleFromMessages(messages: UIMessage[]): string {
  const first = messages.find((m) => m.role === "user");
  if (!first) return "New conversation";
  const text = first.parts
    .map((p) => (p.type === "text" ? p.text : ""))
    .join(" ")
    .trim();
  return text.length > 0 ? text.slice(0, 60) : "New conversation";
}

interface DirectorStore {
  apiKey: string;
  model: string;
  showSettings: boolean;
  customModel: string;
  setApiKey: (key: string) => void;
  setModel: (m: string) => void;
  setShowSettings: (v: boolean) => void;
  setCustomModel: (m: string) => void;

  /** Conversations scoped per project: projectId -> list */
  conversationsByProject: Record<string, Conversation[]>;
  /** Active conversation per project: projectId -> conversation id */
  currentByProject: Record<string, string | null>;
  setMessages: (projectId: string, msgs: UIMessage[]) => void;
  createConversation: (projectId: string) => string;
  setCurrentConversation: (projectId: string, id: string) => void;
  deleteConversation: (projectId: string, id: string) => void;
  renameConversation: (projectId: string, id: string, title: string) => void;
  clearHistory: (projectId: string) => void;
}

export const useDirectorStore = create<DirectorStore>()(
  persist(
    (set, get) => ({
      apiKey: "",
      model: "kimi-k2.7-code",
      showSettings: false,
      customModel: "",
      setApiKey: (apiKey) => set({ apiKey }),
      setModel: (model) => set({ model }),
      setShowSettings: (showSettings) => set({ showSettings }),
      setCustomModel: (customModel) => set({ customModel }),

      conversationsByProject: {},
      currentByProject: {},
      setMessages: (projectId, msgs) => {
        const state = get();
        let currentId = state.currentByProject[projectId] ?? null;
        let conversations = state.conversationsByProject[projectId] ?? [];
        const now = Date.now();

        if (!currentId) {
          currentId = makeId();
          const title = defaultTitleFromMessages(msgs);
          conversations = [
            { id: currentId, title, createdAt: now, updatedAt: now, messages: msgs },
            ...conversations,
          ];
        } else {
          const idx = conversations.findIndex((c) => c.id === currentId);
          const title =
            idx >= 0 && conversations[idx].title !== "New conversation"
              ? conversations[idx].title
              : defaultTitleFromMessages(msgs);
          const updated: Conversation = {
            id: currentId,
            title,
            createdAt: idx >= 0 ? conversations[idx].createdAt : now,
            updatedAt: now,
            messages: msgs,
          };
          conversations = idx >= 0
            ? conversations.map((c) => (c.id === currentId ? updated : c))
            : [updated, ...conversations];
        }
        set({
          conversationsByProject: { ...state.conversationsByProject, [projectId]: conversations },
          currentByProject: { ...state.currentByProject, [projectId]: currentId },
        });
      },
      createConversation: (projectId) => {
        const id = makeId();
        const now = Date.now();
        set((s) => ({
          currentByProject: { ...s.currentByProject, [projectId]: id },
          conversationsByProject: {
            ...s.conversationsByProject,
            [projectId]: [
              { id, title: "New conversation", createdAt: now, updatedAt: now, messages: [] },
              ...(s.conversationsByProject[projectId] ?? []),
            ],
          },
        }));
        return id;
      },
      setCurrentConversation: (projectId, id) =>
        set((s) => ({ currentByProject: { ...s.currentByProject, [projectId]: id } })),
      deleteConversation: (projectId, id) => {
        set((s) => {
          const conversations = (s.conversationsByProject[projectId] ?? []).filter(
            (c) => c.id !== id,
          );
          const currentId =
            s.currentByProject[projectId] === id
              ? conversations.length > 0
                ? conversations[0].id
                : null
              : s.currentByProject[projectId];
          return {
            conversationsByProject: { ...s.conversationsByProject, [projectId]: conversations },
            currentByProject: { ...s.currentByProject, [projectId]: currentId },
          };
        });
      },
      renameConversation: (projectId, id, title) => {
        set((s) => ({
          conversationsByProject: {
            ...s.conversationsByProject,
            [projectId]: (s.conversationsByProject[projectId] ?? []).map((c) =>
              c.id === id ? { ...c, title, updatedAt: Date.now() } : c,
            ),
          },
        }));
      },
      clearHistory: (projectId) =>
        set((s) => ({
          conversationsByProject: { ...s.conversationsByProject, [projectId]: [] },
          currentByProject: { ...s.currentByProject, [projectId]: null },
        })),
    }),
    { name: "lilium.director.v1" },
  ),
);
