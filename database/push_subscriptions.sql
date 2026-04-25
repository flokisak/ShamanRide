-- Web Push subscriptions for driver PWA notifications.
-- Run this in Supabase SQL editor before enabling server-side Web Push.

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id INTEGER NOT NULL,
  driver_id INTEGER,
  endpoint TEXT NOT NULL UNIQUE,
  subscription JSONB NOT NULL,
  user_agent TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS push_subscriptions_vehicle_active_idx
  ON public.push_subscriptions (vehicle_id, active);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_manage_push_subscriptions" ON public.push_subscriptions;
CREATE POLICY "service_role_manage_push_subscriptions"
  ON public.push_subscriptions
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
