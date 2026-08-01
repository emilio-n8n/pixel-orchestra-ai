-- 004_storyboard.sql — scenes + shots tables (phase 7).
-- The journal noted these entities were NOT created by 003_skeletons.sql,
-- so the storyboard plugin's server functions failed on INSERT. Added now;
-- the migration runner applies it automatically on next boot.

CREATE TABLE IF NOT EXISTS scenes (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL,
  name        TEXT NOT NULL,
  "order"     INTEGER NOT NULL DEFAULT 0,
  description TEXT NOT NULL DEFAULT '',
  created_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_scenes_project ON scenes(project_id);

CREATE TABLE IF NOT EXISTS shots (
  id          TEXT PRIMARY KEY,
  scene_id    TEXT NOT NULL REFERENCES scenes(id) ON DELETE CASCADE,
  name        TEXT NOT NULL DEFAULT '',
  "order"     INTEGER NOT NULL DEFAULT 0,
  duration_ms INTEGER NOT NULL DEFAULT 3000,
  asset_id    TEXT,
  created_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_shots_scene ON shots(scene_id);
