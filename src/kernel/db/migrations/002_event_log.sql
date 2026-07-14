-- 002_event_log.sql — Persistent event bus log.
-- Per .lovable/plan.md §4: "Bus typé, structuré, persisté (event log SQLite),
-- rejouable". The event-bus inserts every event here best-effort and replays
-- from a given id on demand. workspace_id / project_id are optional (some
-- events are global, e.g. PluginActivated).

CREATE TABLE IF NOT EXISTS event_log (
  id           TEXT PRIMARY KEY,
  workspace_id TEXT,
  project_id   TEXT,
  type         TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  actor        TEXT,
  ts           INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_event_log_ts ON event_log(ts);
CREATE INDEX IF NOT EXISTS idx_event_log_type ON event_log(type);
CREATE INDEX IF NOT EXISTS idx_event_log_project ON event_log(project_id);
