-- Basic Supabase Test and Setup
-- This file tests basic functionality and provides minimal setup

-- Test 1: Simple function to verify SQL execution works
CREATE OR REPLACE FUNCTION public.api_test()
RETURNS TEXT AS $$
BEGIN
    RETURN 'API is working';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant access
GRANT ALL ON public.api_test TO anon;
GRANT ALL ON public.api_test TO authenticated;

-- Test 2: Check if we can query existing tables
CREATE OR REPLACE FUNCTION public.check_tables()
RETURNS TEXT AS $$
BEGIN
    -- Check if basic tables exist
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'vehicles' AND table_schema = 'public') THEN
        RETURN 'vehicles table exists';
    ELSE
        RETURN 'vehicles table not found';
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant access
GRANT ALL ON public.check_tables TO anon;
GRANT ALL ON public.check_tables TO authenticated;

-- Test 3: Simple view for status
CREATE OR REPLACE VIEW public.api_status AS
SELECT 
    'API Status' as title,
    'Basic functions created' as status,
    NOW() as created_at;

-- Grant access to view
GRANT SELECT ON public.api_status TO anon;
GRANT SELECT ON public.api_status TO authenticated;

-- Test queries:
-- SELECT public.api_test();
-- SELECT public.check_tables();
-- SELECT * FROM public.api_status;

-- IMPORTANT: CORS Configuration Instructions
-- 
-- Supabase automatically handles CORS for the REST API.
-- If you're still getting CORS errors, the issue might be:
-- 
-- 1. Missing API key in requests
-- 2. Wrong project URL
-- 3. Network/firewall issues
-- 
-- To configure CORS properly:
-- 1. Go to Supabase Dashboard
-- 2. Settings > API
-- 3. Add your domains to "Additional CORS Origins"
-- 4. Make sure requests include proper API key
-- 
-- Default CORS should already allow your Vercel domains.
-- The issue might be in the frontend request configuration.