// Bridges the event bus to the event_log table. Insert on persist(), read
// recent events on loadSince(). Lives outside the kernel singleton so tests
// can pass any DBAdapter.

import type { DBAdapter } from "./types";
import type { EventPersister } from "../event-bus";
import type { LiliumEvent } from "../contracts/events";

export function createEventLogPersister(db: DBAdapter): EventPersister {
  const insert = db.prepare(
    "INSERT OR REPLACE INTO event_log (id, workspace_id, project_id, type, payload_json, actor, ts) VALUES (?, ?, ?, ?, ?, ?, ?)",
  );
  const selectRecent = db.prepare(
    "SELECT id, workspace_id, project_id, type, payload_json, actor, ts FROM event_log WHERE ts >= ? ORDER BY ts ASC LIMIT ?",
  );

  return {
    persist(event) {
      const { id, type, ts, workspaceId, projectId, actor, ...rest } = event as LiliumEvent & {
        workspaceId?: string;
        projectId?: string;
      };
      // Strip reserved fields from payload. Some events carry arbitrary props.
      const payload = JSON.stringify(rest);
      insert.run(
        id ?? null,
        workspaceId ?? null,
        projectId ?? null,
        type,
        payload,
        actor ?? null,
        ts,
      );
    },
    loadSince(ts, limit = 500) {
      const since = ts ?? 0;
      const rows = selectRecent.all<{
        id: string;
        workspace_id: string | null;
        project_id: string | null;
        type: string;
        payload_json: string;
        actor: string | null;
        ts: number;
      }>(since, limit);
      return rows.map((r) => {
        let payload: Record<string, unknown> = {};
        try {
          payload = JSON.parse(r.payload_json) as Record<string, unknown>;
        } catch {
          payload = {};
        }
        return {
          ...payload,
          id: r.id,
          ts: r.ts,
          type: r.type,
          ...(r.workspace_id ? { workspaceId: r.workspace_id } : {}),
          ...(r.project_id ? { projectId: r.project_id } : {}),
          ...(r.actor ? { actor: r.actor } : {}),
        } as LiliumEvent;
      });
    },
  };
}
