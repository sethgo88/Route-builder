-- Migration: add color column to routes table (issue #51)
-- Run this in the Supabase SQL editor or via the Supabase CLI.

ALTER TABLE public.routes
	ADD COLUMN IF NOT EXISTS color TEXT NOT NULL DEFAULT '#3b82f6';
