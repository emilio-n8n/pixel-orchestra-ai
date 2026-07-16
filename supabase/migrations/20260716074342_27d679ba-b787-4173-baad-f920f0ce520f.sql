
CREATE TABLE public.assets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID NOT NULL,
  project_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('image','audio','html','video')),
  mime TEXT,
  url TEXT NOT NULL,
  prompt TEXT,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX assets_project_idx ON public.assets(owner_id, project_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.assets TO authenticated;
GRANT ALL ON public.assets TO service_role;
ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own assets" ON public.assets FOR ALL
  USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

CREATE TABLE public.timeline_clips (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID NOT NULL,
  project_id TEXT NOT NULL,
  track TEXT NOT NULL,
  asset_id UUID REFERENCES public.assets(id) ON DELETE CASCADE,
  start_ms INTEGER NOT NULL DEFAULT 0,
  duration_ms INTEGER NOT NULL DEFAULT 3000,
  ord INTEGER NOT NULL DEFAULT 0,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX clips_project_idx ON public.timeline_clips(owner_id, project_id, track, start_ms);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.timeline_clips TO authenticated;
GRANT ALL ON public.timeline_clips TO service_role;
ALTER TABLE public.timeline_clips ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own clips" ON public.timeline_clips FOR ALL
  USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "assets bucket owner read" ON storage.objects FOR SELECT
  TO authenticated USING (bucket_id = 'assets' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "assets bucket owner insert" ON storage.objects FOR INSERT
  TO authenticated WITH CHECK (bucket_id = 'assets' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "assets bucket owner update" ON storage.objects FOR UPDATE
  TO authenticated USING (bucket_id = 'assets' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "assets bucket owner delete" ON storage.objects FOR DELETE
  TO authenticated USING (bucket_id = 'assets' AND auth.uid()::text = (storage.foldername(name))[1]);
