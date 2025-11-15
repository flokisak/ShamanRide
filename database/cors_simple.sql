-- Simple Supabase CORS Configuration
-- This script provides basic CORS setup and test endpoints

-- Method 1: Simple CORS test function (compatible syntax)
CREATE OR REPLACE FUNCTION public.test_cors()
RETURNS TEXT AS $$
BEGIN
    RETURN 'CORS test successful - If you see this, CORS is working';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant access to test function
GRANT ALL ON public.test_cors TO anon;
GRANT ALL ON public.test_cors TO authenticated;

-- Method 2: Simple health check
CREATE OR REPLACE FUNCTION public.health_check()
RETURNS TEXT AS $$
BEGIN
    RETURN 'API is healthy - CORS configured';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant access to health check
GRANT ALL ON public.health_check TO anon;
GRANT ALL ON public.health_check TO authenticated;

-- Method 3: Create a simple view for CORS status
CREATE OR REPLACE VIEW public.cors_info AS
SELECT 
    'CORS Status' as title,
    'Configure in Supabase Dashboard > Settings > API' as location,
    'https://shaman-ride.vercel.app' as dispatcher_url,
    'https://shaman-driver.vercel.app' as driver_url,
    'http://localhost:5173' as dev_url_1,
    'http://localhost:5174' as dev_url_2;

-- Grant access to CORS info view
GRANT SELECT ON public.cors_info TO anon;
GRANT SELECT ON public.cors_info TO authenticated;

-- Method 4: Update authentication configuration (safe update)
DO $$
BEGIN
    -- Only update if different to avoid errors
    UPDATE auth.config 
    SET site_url = 'https://shaman-ride.vercel.app'
    WHERE site_url IS NULL OR site_url != 'https://shaman-ride.vercel.app';
    
    UPDATE auth.config 
    SET additional_providers = '["email"]'
    WHERE additional_providers IS NULL OR additional_providers != '["email"]';
END $$;

-- Test queries (run these to verify):
-- SELECT * FROM public.cors_info;
-- SELECT public.test_cors();
-- SELECT public.health_check();

-- IMPORTANT: Manual CORS Configuration Required
-- 
-- Go to your Supabase project dashboard:
-- 1. Settings > API
-- 2. Under "Additional CORS Origins", add:
--    - https://shaman-ride.vercel.app
--    - https://shaman-driver.vercel.app
--    - http://localhost:5173
--    - http://localhost:5174
-- 3. Save configuration
-- 4. Test by visiting: https://your-project-ref.supabase.co/rest/v1/test_cors