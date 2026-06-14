-- ============================================================
-- Phase 3: AI Proxy Layer
-- Add use_proxy preference to profiles
-- ============================================================

-- 1. Add use_proxy column to profiles (default false = BYOK)
ALTER TABLE public.profiles ADD COLUMN use_proxy BOOLEAN DEFAULT FALSE;

-- 2. Add index for ai_usage feature queries (for usage dashboards)
CREATE INDEX idx_ai_usage_feature ON public.ai_usage (feature);
