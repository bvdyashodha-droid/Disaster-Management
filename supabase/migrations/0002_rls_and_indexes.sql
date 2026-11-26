-- Migration 0002: Performance Indexes & Row-Level Security (RLS) for Supabase
-- Run this immediately after 0001_initial_schema.sql in Supabase SQL Editor.

-- Search, Filter & Sync Indexes
CREATE INDEX IF NOT EXISTS idx_ds_district ON public.divisional_secretariats(district_id) WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_gn_ds ON public.gn_divisions(ds_id) WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_disasters_status_date ON public.disasters(status, start_date DESC) WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_families_disaster_gn ON public.affected_families(disaster_id, gn_id) WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_families_nic ON public.affected_families(head_nic) WHERE head_nic <> '' AND is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_persons_family ON public.affected_persons(family_id) WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_persons_nic ON public.affected_persons(nic_or_bc) WHERE nic_or_bc <> '' AND is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_damages_disaster_level ON public.house_damages(disaster_id, damage_level) WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_relief_disaster_date ON public.relief_assistance(disaster_id, distributed_date DESC) WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_snapshots_record ON public.record_snapshots(entity_table, record_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_created ON public.audit_logs(created_at DESC);

-- Enable Row-Level Security on all tables
-- Note: The Node/Express backend connects using the privileged PostgreSQL role or service role,
-- while direct anonymous PostgREST access from browsers is denied by default.
ALTER TABLE public.districts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.divisional_secretariats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gn_divisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.officers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.disasters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.affected_families ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.affected_persons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.house_damages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.relief_assistance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.record_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Deny direct anon PostgREST access so all reads/writes pass through the authenticated Express API
REVOKE ALL ON public.officers FROM anon;
REVOKE ALL ON public.record_snapshots FROM anon;
REVOKE ALL ON public.audit_logs FROM anon;
