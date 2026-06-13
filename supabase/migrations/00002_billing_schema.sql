-- ============================================================
-- Phase 2: Billing & Tier Enforcement
-- Split tier → mode + subscription, add usage tracking
-- ============================================================

-- 1. Rename 'tier' column to 'mode' (it currently holds 'student'|'professional')
ALTER TABLE public.profiles RENAME COLUMN tier TO mode;

-- 2. Update CHECK constraint for mode
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_tier_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_mode_check
  CHECK (mode IN ('student', 'professional'));

-- 3. Add subscription column for billing
ALTER TABLE public.profiles ADD COLUMN subscription TEXT
  CHECK (subscription IN ('free', 'student', 'pro', 'team'))
  DEFAULT 'free';

-- 4. Add subscription-related columns
ALTER TABLE public.profiles ADD COLUMN stripe_subscription_id TEXT;
ALTER TABLE public.profiles ADD COLUMN subscription_status TEXT
  CHECK (subscription_status IN ('active', 'trialing', 'past_due', 'canceled', 'unpaid'))
  DEFAULT NULL;
ALTER TABLE public.profiles ADD COLUMN current_period_end TIMESTAMPTZ;

-- 5. Create AI usage tracking table
CREATE TABLE public.ai_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  feature TEXT NOT NULL,
  model TEXT,
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.ai_usage ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own usage"
  ON public.ai_usage FOR SELECT USING (auth.uid() = user_id);

-- Index for fast monthly usage queries
CREATE INDEX idx_ai_usage_user_month
  ON public.ai_usage (user_id, created_at);

-- 6. RPC: log an AI usage event
CREATE OR REPLACE FUNCTION public.log_ai_usage(
  p_feature TEXT,
  p_model TEXT DEFAULT NULL,
  p_input_tokens INTEGER DEFAULT 0,
  p_output_tokens INTEGER DEFAULT 0
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.ai_usage (user_id, feature, model, input_tokens, output_tokens)
  VALUES (auth.uid(), p_feature, p_model, p_input_tokens, p_output_tokens);
END;
$$;

-- 7. RPC: get current month usage count for a feature (or all features if NULL)
CREATE OR REPLACE FUNCTION public.get_monthly_usage(
  p_feature TEXT DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  count_result INTEGER;
BEGIN
  SELECT COUNT(*) INTO count_result
  FROM public.ai_usage
  WHERE user_id = auth.uid()
    AND created_at >= date_trunc('month', now())
    AND (p_feature IS NULL OR feature = p_feature);
  RETURN count_result;
END;
$$;

-- 8. Update handle_new_user trigger to set mode + subscription
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
begin
  insert into public.profiles (id, display_name, mode, subscription, theme)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)),
    'student',
    'free',
    'system'
  );
  return new;
end;
$$;
