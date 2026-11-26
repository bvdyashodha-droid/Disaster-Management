-- Migration 0005: Add 'admin' role to public.officers CHECK constraint
-- Run in Supabase SQL Editor to allow creating 'admin' officer accounts alongside 'super_admin'.

ALTER TABLE public.officers
  DROP CONSTRAINT IF EXISTS officers_role_check;

ALTER TABLE public.officers
  ADD CONSTRAINT officers_role_check
  CHECK (role IN ('super_admin', 'admin', 'district_officer', 'ds_officer', 'gn_officer', 'auditor_viewer'));
