-- Migration: create routes table with RLS for cloud backup/sync (issue #18)
-- Run this in the Supabase SQL editor or via the Supabase CLI.

CREATE TABLE IF NOT EXISTS public.routes (
	id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
	name          TEXT        NOT NULL,
	waypoints     JSONB       NOT NULL,
	geometry      JSONB       NOT NULL,
	stats         JSONB,
	created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
	updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
	deleted_at    TIMESTAMPTZ           -- soft delete; NULL = active
);

-- Index for fast per-user queries
CREATE INDEX IF NOT EXISTS routes_user_id_idx ON public.routes (user_id);

-- Automatically bump updated_at on any row change
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
	NEW.updated_at = now();
	RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER routes_set_updated_at
BEFORE UPDATE ON public.routes
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Row-level security: users can only see/touch their own rows
ALTER TABLE public.routes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "routes: users see own rows"
	ON public.routes FOR SELECT
	TO authenticated
	USING (auth.uid() = user_id);

CREATE POLICY "routes: users insert own rows"
	ON public.routes FOR INSERT
	TO authenticated
	WITH CHECK (auth.uid() = user_id);

CREATE POLICY "routes: users update own rows"
	ON public.routes FOR UPDATE
	TO authenticated
	USING (auth.uid() = user_id)
	WITH CHECK (auth.uid() = user_id);

-- Note: hard DELETEs are not used — soft-delete via deleted_at is preferred.
-- Add a DELETE policy only if you need it for cleanup jobs:
-- CREATE POLICY "routes: users delete own rows"
--   ON public.routes FOR DELETE TO authenticated USING (auth.uid() = user_id);
