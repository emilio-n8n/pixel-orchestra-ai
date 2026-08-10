
-- Director jobs (agent operations — QUEUED/RUNNING/COMPLETED/FAILED) and
-- asset lineage for agent-generated assets (Test 6/7 of the production plan).

CREATE TABLE public.director_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID NOT NULL,
  project_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  prompt TEXT,
  error TEXT,
  result JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ
);
CREATE INDEX director_jobs_project_idx ON public.director_jobs(owner_id, project_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.director_jobs TO authenticated;
GRANT ALL ON public.director_jobs TO service_role;
ALTER TABLE public.director_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own jobs" ON public.director_jobs FOR ALL
  USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

CREATE TABLE public.asset_provenance (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID NOT NULL,
  project_id TEXT NOT NULL,
  asset_id UUID NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  tool TEXT NOT NULL,
  params JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_asset_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX asset_provenance_asset_idx ON public.asset_provenance(owner_id, asset_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.asset_provenance TO authenticated;
GRANT ALL ON public.asset_provenance TO service_role;
ALTER TABLE public.asset_provenance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own provenance" ON public.asset_provenance FOR ALL
  USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

ALTER PUBLICATION supabase_realtime ADD TABLE public.director_jobs;
