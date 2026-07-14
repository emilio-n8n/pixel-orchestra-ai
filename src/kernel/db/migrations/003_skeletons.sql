-- 003_skeletons.sql — Empty tables for upcoming phases.
-- These mirror the model from .lovable/plan.md §13. They are created here so
-- the schema is in place before the phases that need them — the kernel can
-- safely INSERT into them starting now, and later phases only add columns /
-- migrations without worrying about CREATE TABLE.
--
-- Phase 3:  connectors, capabilities
-- Phase 4:  graphs, graph_runs, node_runs, jobs
-- Phase 5:  assets, asset_provenance
-- Phase 6:  context_entries
-- Phase 7:  scenes, shots, tracks, clips
-- Phase 8:  snapshots
-- Phase 12: plugins (installed registry)

CREATE TABLE IF NOT EXISTS connectors (
  id            TEXT PRIMARY KEY,
  workspace_id  TEXT,
  project_id    TEXT,
  plugin_id     TEXT NOT NULL,
  kind          TEXT NOT NULL,
  name          TEXT NOT NULL,
  config_json   TEXT NOT NULL DEFAULT '{}',
  status        TEXT NOT NULL DEFAULT 'offline',
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS capabilities (
  id            TEXT PRIMARY KEY,
  connector_id  TEXT NOT NULL REFERENCES connectors(id) ON DELETE CASCADE,
  cap_ref       TEXT NOT NULL,
  kind          TEXT NOT NULL,
  media_json    TEXT NOT NULL DEFAULT '[]',
  schema_in     TEXT NOT NULL DEFAULT '{}',
  schema_out    TEXT NOT NULL DEFAULT '{}',
  tags_json     TEXT NOT NULL DEFAULT '[]',
  detected_at   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS graphs (
  id            TEXT PRIMARY KEY,
  project_id    TEXT NOT NULL,
  name          TEXT NOT NULL,
  doc_json      TEXT NOT NULL,
  is_template   INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS graph_runs (
  id            TEXT PRIMARY KEY,
  graph_id      TEXT NOT NULL REFERENCES graphs(id) ON DELETE CASCADE,
  status        TEXT NOT NULL,
  started_at    INTEGER NOT NULL,
  finished_at   INTEGER,
  stats_json    TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS node_runs (
  id            TEXT PRIMARY KEY,
  graph_run_id  TEXT NOT NULL REFERENCES graph_runs(id) ON DELETE CASCADE,
  node_id       TEXT NOT NULL,
  status        TEXT NOT NULL,
  input_json    TEXT,
  output_json   TEXT,
  logs          TEXT,
  capability_id TEXT
);

CREATE TABLE IF NOT EXISTS jobs (
  id            TEXT PRIMARY KEY,
  project_id    TEXT NOT NULL,
  graph_run_id  TEXT,
  node_run_id   TEXT,
  status        TEXT NOT NULL,
  progress      REAL NOT NULL DEFAULT 0,
  note          TEXT,
  error         TEXT,
  result_json   TEXT,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS assets (
  id            TEXT PRIMARY KEY,
  project_id    TEXT NOT NULL,
  kind          TEXT NOT NULL,
  name          TEXT NOT NULL,
  mime          TEXT,
  size_bytes    INTEGER NOT NULL DEFAULT 0,
  blob_hash     TEXT,
  thumbnail_hash TEXT,
  meta_json     TEXT NOT NULL DEFAULT '{}',
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS asset_provenance (
  asset_id        TEXT PRIMARY KEY REFERENCES assets(id) ON DELETE CASCADE,
  graph_run_id    TEXT,
  node_run_id     TEXT,
  source_asset_ids_json TEXT NOT NULL DEFAULT '[]',
  params_json     TEXT NOT NULL DEFAULT '{}',
  capability_id   TEXT,
  seed            TEXT
);

CREATE TABLE IF NOT EXISTS context_entries (
  id            TEXT PRIMARY KEY,
  project_id    TEXT NOT NULL,
  kind          TEXT NOT NULL,
  key           TEXT NOT NULL,
  value_json    TEXT NOT NULL,
  embedding     TEXT
);

CREATE TABLE IF NOT EXISTS snapshots (
  id            TEXT PRIMARY KEY,
  project_id    TEXT NOT NULL,
  entity_type   TEXT NOT NULL,
  entity_id     TEXT NOT NULL,
  version       INTEGER NOT NULL,
  blob_json     TEXT NOT NULL,
  reason        TEXT,
  created_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS plugins (
  id            TEXT PRIMARY KEY,
  version       TEXT NOT NULL,
  enabled       INTEGER NOT NULL DEFAULT 1,
  scope         TEXT NOT NULL DEFAULT 'workspace',
  source        TEXT NOT NULL DEFAULT 'builtin',
  installed_at  INTEGER NOT NULL
);
