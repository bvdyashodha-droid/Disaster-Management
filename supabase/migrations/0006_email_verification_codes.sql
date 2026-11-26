-- Migration 0006: Email Verification Codes & Officer Email Verification Flag
-- Run in Supabase SQL Editor to enable 6-digit email verification for Admin/Super Admin
-- account creation and password reset flows.

ALTER TABLE public.officers
  ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS public.email_verification_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  officer_id UUID REFERENCES public.officers(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES public.officers(id) ON DELETE SET NULL,
  target_email TEXT NOT NULL,
  purpose TEXT NOT NULL CHECK (purpose IN ('create_admin', 'bootstrap_admin', 'password_reset')),
  code_hash TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dmis_email_verif_lookup
  ON public.email_verification_codes (target_email, purpose, expires_at DESC);

CREATE INDEX IF NOT EXISTS idx_dmis_email_verif_officer
  ON public.email_verification_codes (officer_id, created_at DESC);

ALTER TABLE public.email_verification_codes ENABLE ROW LEVEL SECURITY;
