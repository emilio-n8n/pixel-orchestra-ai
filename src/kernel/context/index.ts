// AI Context — .lovable/plan.md §7. Structured per-project store for
// characters, styles, voices, locations, etc.

import type { DBAdapter } from "../db/types";

export type ContextEntryKind =
  | "character"
  | "style"
  | "voice"
  | "location"
  | "prompt_template"
  | "negative_prompt"
  | "glossary"
  | "default";

export interface ProjectContextStore {
  get(projectId: string, kind: ContextEntryKind, key: string): Promise<unknown>;
  set(projectId: string, kind: ContextEntryKind, key: string, value: unknown): Promise<void>;
  list(projectId: string, kind: ContextEntryKind): Promise<Array<{ key: string; value: unknown }>>;
  delete(projectId: string, kind: ContextEntryKind, key: string): Promise<void>;
}

export function createContextStore(db: DBAdapter): ProjectContextStore {
  const getStmt = db.prepare(
    "SELECT value_json FROM context_entries WHERE project_id = ? AND kind = ? AND key = ?",
  );
  const setStmt = db.prepare(
    "INSERT OR REPLACE INTO context_entries (id, project_id, kind, key, value_json) VALUES (?, ?, ?, ?, ?)",
  );
  const listStmt = db.prepare(
    "SELECT key, value_json FROM context_entries WHERE project_id = ? AND kind = ? ORDER BY key",
  );
  const delStmt = db.prepare(
    "DELETE FROM context_entries WHERE project_id = ? AND kind = ? AND key = ?",
  );
  const uid = () =>
    `ctx_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;

  return {
    async get(projectId, kind, key) {
      const row = getStmt.get<{ value_json: string }>(projectId, kind, key);
      if (!row) return undefined;
      try {
        return JSON.parse(row.value_json);
      } catch {
        return undefined;
      }
    },
    async set(projectId, kind, key, value) {
      setStmt.run(uid(), projectId, kind, key, JSON.stringify(value));
    },
    async list(projectId, kind) {
      return listStmt.all<{ key: string; value_json: string }>(projectId, kind).map((r) => {
        try {
          return { key: r.key, value: JSON.parse(r.value_json) };
        } catch {
          return { key: r.key, value: r.value_json };
        }
      });
    },
    async delete(projectId, kind, key) {
      delStmt.run(projectId, kind, key);
    },
  };
}
