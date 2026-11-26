-- Migration 0003: Add geographic coordinates (latitude, longitude) to disasters and affected_families
-- Run in Supabase SQL Editor after 0002_rls_and_indexes.sql

ALTER TABLE public.disasters
  ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;

ALTER TABLE public.affected_families
  ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;

CREATE INDEX IF NOT EXISTS idx_disasters_coords
  ON public.disasters(latitude, longitude)
  WHERE latitude IS NOT NULL AND longitude IS NOT NULL AND is_deleted = FALSE;

CREATE INDEX IF NOT EXISTS idx_families_coords
  ON public.affected_families(latitude, longitude)
  WHERE latitude IS NOT NULL AND longitude IS NOT NULL AND is_deleted = FALSE;
