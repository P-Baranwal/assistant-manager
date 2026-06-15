-- ============================================================
-- Phase 9: Calendar Sync (iCal Export)
-- Add calendar feed token to profiles
-- ============================================================

-- 1. Add calendar_feed_token column to profiles
ALTER TABLE public.profiles ADD COLUMN calendar_feed_token UUID UNIQUE DEFAULT NULL;

-- Index for fast token lookups by the Edge Function
CREATE INDEX idx_profiles_calendar_token
  ON public.profiles (calendar_feed_token)
  WHERE calendar_feed_token IS NOT NULL;

-- 2. RPC: Generate or retrieve the calendar feed token for the current user
CREATE OR REPLACE FUNCTION public.get_or_create_calendar_token()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  existing_token UUID;
BEGIN
  -- Check if token already exists
  SELECT calendar_feed_token INTO existing_token
  FROM public.profiles
  WHERE id = auth.uid();

  IF existing_token IS NOT NULL THEN
    RETURN existing_token;
  END IF;

  -- Generate new token
  UPDATE public.profiles
  SET calendar_feed_token = gen_random_uuid()
  WHERE id = auth.uid()
  RETURNING calendar_feed_token INTO existing_token;

  RETURN existing_token;
END;
$$;

-- 3. RPC: Regenerate the calendar feed token (invalidates old URL)
CREATE OR REPLACE FUNCTION public.regenerate_calendar_token()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_token UUID;
BEGIN
  UPDATE public.profiles
  SET calendar_feed_token = gen_random_uuid()
  WHERE id = auth.uid()
  RETURNING calendar_feed_token INTO new_token;

  RETURN new_token;
END;
$$;
