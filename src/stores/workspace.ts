import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export type UUID = string;

export interface Workspace {
  id: UUID;
  name: string;
  createdAt: number;
}

export interface Project {
  id: UUID;
  workspaceId: UUID;
  name: string;
  createdAt: number;
  updatedAt: number;
}

interface WorkspaceStore {
  workspaces: Workspace[];
  projects: Project[];
  createWorkspace: (name: string) => Workspace;
  renameWorkspace: (id: UUID, name: string) => void;
  deleteWorkspace: (id: UUID) => void;
  createProject: (workspaceId: UUID, name: string) => Project;
  renameProject: (id: UUID, name: string) => void;
  deleteProject: (id: UUID) => void;
  getWorkspace: (id: UUID) => Workspace | undefined;
  getProject: (id: UUID) => Project | undefined;
  projectsIn: (workspaceId: UUID) => Project[];
}

function uid(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
}

export const useWorkspaceStore = create<WorkspaceStore>()(
  persist(
    (set, get) => ({
      workspaces: [],
      projects: [],
      createWorkspace: (name) => {
        const ws: Workspace = { id: uid("ws"), name, createdAt: Date.now() };
        set({ workspaces: [...get().workspaces, ws] });
        return ws;
      },
      renameWorkspace: (id, name) =>
        set({ workspaces: get().workspaces.map((w) => (w.id === id ? { ...w, name } : w)) }),
      deleteWorkspace: (id) =>
        set({
          workspaces: get().workspaces.filter((w) => w.id !== id),
          projects: get().projects.filter((p) => p.workspaceId !== id),
        }),
      createProject: (workspaceId, name) => {
        const now = Date.now();
        const p: Project = { id: uid("prj"), workspaceId, name, createdAt: now, updatedAt: now };
        set({ projects: [...get().projects, p] });
        return p;
      },
      renameProject: (id, name) =>
        set({
          projects: get().projects.map((p) => (p.id === id ? { ...p, name, updatedAt: Date.now() } : p)),
        }),
      deleteProject: (id) => set({ projects: get().projects.filter((p) => p.id !== id) }),
      getWorkspace: (id) => get().workspaces.find((w) => w.id === id),
      getProject: (id) => get().projects.find((p) => p.id === id),
      projectsIn: (workspaceId) => get().projects.filter((p) => p.workspaceId === workspaceId),
    }),
    {
      name: "lilium.workspaces.v1",
      storage: createJSONStorage(() =>
        typeof window === "undefined"
          ? ({
              getItem: () => null,
              setItem: () => {},
              removeItem: () => {},
            } as Storage)
          : window.localStorage,
      ),
      skipHydration: false,
    },
  ),
);