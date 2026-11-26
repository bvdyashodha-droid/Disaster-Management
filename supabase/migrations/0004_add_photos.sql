-- Migration 0004: Add photo storage columns for house_damages (up to 3 photos) and affected_persons (optional 1 photo)
-- Run in Supabase SQL Editor after 0003_add_coordinates.sql

ALTER TABLE public.house_damages
  ADD COLUMN IF NOT EXISTS photos JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.affected_persons
  ADD COLUMN IF NOT EXISTS photo_url TEXT;
