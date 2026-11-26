-- Migration 0001: Initial Disaster Management Information System (DMIS) Schema
-- Compatible with Supabase PostgreSQL 15+
-- Note: Extensible legacy_source_id and legacy_extra_data JSONB columns are included
-- on core operational tables so existing Microsoft Access fields can be mapped
-- cleanly without data loss once the Access schema is provided.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Automatic version + updated_at trigger function
CREATE OR REPLACE FUNCTION public.dmis_touch_record()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  IF TG_OP = 'UPDATE' THEN
    IF NEW.version IS NOT DISTINCT FROM OLD.version THEN
      NEW.version = OLD.version + 1;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 1. Districts
CREATE TABLE IF NOT EXISTS public.districts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  district_code TEXT NOT NULL UNIQUE,
  name_en TEXT NOT NULL,
  name_si TEXT NOT NULL DEFAULT '',
  province TEXT NOT NULL DEFAULT '',
  version INTEGER NOT NULL DEFAULT 1,
  device_id TEXT NOT NULL DEFAULT 'server',
  updated_by UUID,
  legacy_source_id TEXT,
  legacy_extra_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Divisional Secretariats
CREATE TABLE IF NOT EXISTS public.divisional_secretariats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ds_code TEXT NOT NULL UNIQUE,
  district_id UUID NOT NULL REFERENCES public.districts(id) ON DELETE RESTRICT,
  name_en TEXT NOT NULL,
  name_si TEXT NOT NULL DEFAULT '',
  version INTEGER NOT NULL DEFAULT 1,
  device_id TEXT NOT NULL DEFAULT 'server',
  updated_by UUID,
  legacy_source_id TEXT,
  legacy_extra_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. GN Divisions (Grama Niladhari Divisions)
CREATE TABLE IF NOT EXISTS public.gn_divisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gn_code TEXT NOT NULL UNIQUE,
  gn_number TEXT NOT NULL DEFAULT '',
  ds_id UUID NOT NULL REFERENCES public.divisional_secretariats(id) ON DELETE RESTRICT,
  name_en TEXT NOT NULL,
  name_si TEXT NOT NULL DEFAULT '',
  version INTEGER NOT NULL DEFAULT 1,
  device_id TEXT NOT NULL DEFAULT 'server',
  updated_by UUID,
  legacy_source_id TEXT,
  legacy_extra_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Officers and Users
CREATE TABLE IF NOT EXISTS public.officers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('super_admin', 'district_officer', 'ds_officer', 'gn_officer', 'auditor_viewer')),
  designation TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  district_id UUID REFERENCES public.districts(id) ON DELETE SET NULL,
  ds_id UUID REFERENCES public.divisional_secretariats(id) ON DELETE SET NULL,
  gn_id UUID REFERENCES public.gn_divisions(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  version INTEGER NOT NULL DEFAULT 1,
  device_id TEXT NOT NULL DEFAULT 'server',
  updated_by UUID,
  legacy_source_id TEXT,
  legacy_extra_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Disaster Records
CREATE TABLE IF NOT EXISTS public.disasters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  disaster_code TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  disaster_type TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('Low', 'Moderate', 'High', 'Critical')),
  start_date DATE NOT NULL,
  end_date DATE,
  status TEXT NOT NULL CHECK (status IN ('Active', 'Monitoring', 'Relief Phase', 'Closed')),
  district_id UUID REFERENCES public.districts(id) ON DELETE SET NULL,
  ds_id UUID REFERENCES public.divisional_secretariats(id) ON DELETE SET NULL,
  description TEXT NOT NULL DEFAULT '',
  version INTEGER NOT NULL DEFAULT 1,
  device_id TEXT NOT NULL DEFAULT 'server',
  updated_by UUID,
  legacy_source_id TEXT,
  legacy_extra_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Affected Families
CREATE TABLE IF NOT EXISTS public.affected_families (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_ref_no TEXT NOT NULL UNIQUE,
  disaster_id UUID NOT NULL REFERENCES public.disasters(id) ON DELETE RESTRICT,
  district_id UUID REFERENCES public.districts(id) ON DELETE SET NULL,
  ds_id UUID REFERENCES public.divisional_secretariats(id) ON DELETE SET NULL,
  gn_id UUID REFERENCES public.gn_divisions(id) ON DELETE SET NULL,
  head_name TEXT NOT NULL,
  head_nic TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  total_members INTEGER NOT NULL DEFAULT 1 CHECK (total_members >= 0),
  displacement_status TEXT NOT NULL CHECK (displacement_status IN ('At Home', 'With Relatives', 'Safety Centre', 'Relocated')),
  needs_summary TEXT NOT NULL DEFAULT '',
  version INTEGER NOT NULL DEFAULT 1,
  device_id TEXT NOT NULL DEFAULT 'server',
  updated_by UUID,
  legacy_source_id TEXT,
  legacy_extra_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Affected Persons
CREATE TABLE IF NOT EXISTS public.affected_persons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_ref_no TEXT NOT NULL UNIQUE,
  family_id UUID NOT NULL REFERENCES public.affected_families(id) ON DELETE RESTRICT,
  disaster_id UUID NOT NULL REFERENCES public.disasters(id) ON DELETE RESTRICT,
  full_name TEXT NOT NULL,
  nic_or_bc TEXT NOT NULL DEFAULT '',
  age INTEGER CHECK (age IS NULL OR (age >= 0 AND age <= 130)),
  gender TEXT NOT NULL CHECK (gender IN ('Male', 'Female', 'Other')),
  relationship_to_head TEXT NOT NULL DEFAULT 'Member',
  vulnerability TEXT NOT NULL DEFAULT 'None',
  health_status TEXT NOT NULL DEFAULT 'Safe',
  version INTEGER NOT NULL DEFAULT 1,
  device_id TEXT NOT NULL DEFAULT 'server',
  updated_by UUID,
  legacy_source_id TEXT,
  legacy_extra_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. House Damages
CREATE TABLE IF NOT EXISTS public.house_damages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_no TEXT NOT NULL UNIQUE,
  disaster_id UUID NOT NULL REFERENCES public.disasters(id) ON DELETE RESTRICT,
  family_id UUID NOT NULL REFERENCES public.affected_families(id) ON DELETE RESTRICT,
  gn_id UUID REFERENCES public.gn_divisions(id) ON DELETE SET NULL,
  damage_level TEXT NOT NULL CHECK (damage_level IN ('Fully Damaged', 'Partially Damaged - Severe', 'Partially Damaged - Minor')),
  estimated_loss_lkr NUMERIC(14, 2) NOT NULL DEFAULT 0,
  inspection_date DATE NOT NULL,
  inspector_name TEXT NOT NULL DEFAULT '',
  verification_status TEXT NOT NULL CHECK (verification_status IN ('Pending', 'Field Verified', 'DS Approved', 'District Approved')),
  remarks TEXT NOT NULL DEFAULT '',
  version INTEGER NOT NULL DEFAULT 1,
  device_id TEXT NOT NULL DEFAULT 'server',
  updated_by UUID,
  legacy_source_id TEXT,
  legacy_extra_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 9. Relief Assistance
CREATE TABLE IF NOT EXISTS public.relief_assistance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  voucher_no TEXT NOT NULL UNIQUE,
  disaster_id UUID NOT NULL REFERENCES public.disasters(id) ON DELETE RESTRICT,
  family_id UUID NOT NULL REFERENCES public.affected_families(id) ON DELETE RESTRICT,
  gn_id UUID REFERENCES public.gn_divisions(id) ON DELETE SET NULL,
  assistance_type TEXT NOT NULL,
  quantity_unit TEXT NOT NULL DEFAULT '',
  value_lkr NUMERIC(14, 2) NOT NULL DEFAULT 0,
  distributed_date DATE NOT NULL,
  distribution_status TEXT NOT NULL CHECK (distribution_status IN ('Planned', 'Dispatched', 'Distributed', 'Verified')),
  distributed_by TEXT NOT NULL DEFAULT '',
  remarks TEXT NOT NULL DEFAULT '',
  version INTEGER NOT NULL DEFAULT 1,
  device_id TEXT NOT NULL DEFAULT 'server',
  updated_by UUID,
  legacy_source_id TEXT,
  legacy_extra_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 10. Original Record Preservation Snapshots (created automatically before merge/restore/overwrite)
CREATE TABLE IF NOT EXISTS public.record_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_table TEXT NOT NULL,
  record_id UUID NOT NULL,
  snapshot_reason TEXT NOT NULL,
  snapshot_data JSONB NOT NULL,
  created_by UUID,
  device_id TEXT NOT NULL DEFAULT 'server',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 11. Audit Logs
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID,
  actor_username TEXT NOT NULL DEFAULT 'system',
  action TEXT NOT NULL,
  entity_table TEXT NOT NULL,
  record_id UUID,
  device_id TEXT NOT NULL DEFAULT 'server',
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Attach update triggers
DROP TRIGGER IF EXISTS trg_districts_touch ON public.districts;
CREATE TRIGGER trg_districts_touch BEFORE UPDATE ON public.districts FOR EACH ROW EXECUTE FUNCTION public.dmis_touch_record();

DROP TRIGGER IF EXISTS trg_ds_touch ON public.divisional_secretariats;
CREATE TRIGGER trg_ds_touch BEFORE UPDATE ON public.divisional_secretariats FOR EACH ROW EXECUTE FUNCTION public.dmis_touch_record();

DROP TRIGGER IF EXISTS trg_gn_touch ON public.gn_divisions;
CREATE TRIGGER trg_gn_touch BEFORE UPDATE ON public.gn_divisions FOR EACH ROW EXECUTE FUNCTION public.dmis_touch_record();

DROP TRIGGER IF EXISTS trg_officers_touch ON public.officers;
CREATE TRIGGER trg_officers_touch BEFORE UPDATE ON public.officers FOR EACH ROW EXECUTE FUNCTION public.dmis_touch_record();

DROP TRIGGER IF EXISTS trg_disasters_touch ON public.disasters;
CREATE TRIGGER trg_disasters_touch BEFORE UPDATE ON public.disasters FOR EACH ROW EXECUTE FUNCTION public.dmis_touch_record();

DROP TRIGGER IF EXISTS trg_families_touch ON public.affected_families;
CREATE TRIGGER trg_families_touch BEFORE UPDATE ON public.affected_families FOR EACH ROW EXECUTE FUNCTION public.dmis_touch_record();

DROP TRIGGER IF EXISTS trg_persons_touch ON public.affected_persons;
CREATE TRIGGER trg_persons_touch BEFORE UPDATE ON public.affected_persons FOR EACH ROW EXECUTE FUNCTION public.dmis_touch_record();

DROP TRIGGER IF EXISTS trg_damages_touch ON public.house_damages;
CREATE TRIGGER trg_damages_touch BEFORE UPDATE ON public.house_damages FOR EACH ROW EXECUTE FUNCTION public.dmis_touch_record();

DROP TRIGGER IF EXISTS trg_relief_touch ON public.relief_assistance;
CREATE TRIGGER trg_relief_touch BEFORE UPDATE ON public.relief_assistance FOR EACH ROW EXECUTE FUNCTION public.dmis_touch_record();
