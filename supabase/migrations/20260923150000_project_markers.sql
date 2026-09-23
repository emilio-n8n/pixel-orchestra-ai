-- Timeline markers / YouTube chapters (Director add_marker / list_markers).
-- One row per marker: absolute time on the timeline + short chapter label.

CREATE TABLE public.project_markers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID NOT NULL,
  project_id TEXT NOT NULL,
  t_ms INTEGER NOT NULL DEFAULT 0,
  label TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX project_markers_project_idx ON public.project_markers(owner_id, project_id, t_ms);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_markers TO authenticated;
GRANT ALL ON public.project_markers TO service_role;
ALTER TABLE public.project_markers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own markers" ON public.project_markers FOR ALL
  USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

ALTER PUBLICATION supabase_realtime ADD TABLE public.project_markers;
