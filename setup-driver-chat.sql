-- ===========================================
-- SHAMANRIDE DRIVER CHAT SYSTEM SETUP
-- ===========================================
-- Run this SQL script in your Supabase SQL editor to set up the driver chat system
-- Uses existing 'people' table instead of creating new 'drivers' table

-- 1. Create driver_messages table (if not exists)
CREATE TABLE IF NOT EXISTS driver_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  sender_id TEXT NOT NULL, -- dispatcher user ID or 'driver_X' for drivers
  receiver_id TEXT NOT NULL, -- 'driver_X' for drivers or 'dispatcher' for dispatchers
  message TEXT NOT NULL,
  timestamp TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  read BOOLEAN DEFAULT FALSE
);

-- 2. Enable Row Level Security
ALTER TABLE driver_messages ENABLE ROW LEVEL SECURITY;

-- 3. Create RLS Policies (allow all authenticated users for simplicity)
CREATE POLICY IF NOT EXISTS "Authenticated users can read driver messages" ON driver_messages
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY IF NOT EXISTS "Authenticated users can send driver messages" ON driver_messages
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- 4. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_driver_messages_timestamp ON driver_messages(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_driver_messages_participants ON driver_messages(sender_id, receiver_id);

-- Note: People table is used only for dispatcher reference.
-- Driver app authenticates directly with vehicle emails (vinnetaxi1@gmail.com, etc.)
-- No linking between people and auth users needed for driver app functionality.

-- ===========================================
-- MANUAL STEPS (do these in Supabase dashboard):
-- ===========================================

-- 1. Create vehicle auth accounts:
-- Go to Authentication > Users in Supabase dashboard
-- Create users with emails: vinnetaxi1@gmail.com through vinnetaxi7@gmail.com
-- Set passwords for each account
-- These accounts are tied to vehicles, not individual drivers
*/

-- 3. Update vehicles with phone numbers (car phones):
/*
UPDATE vehicles SET phone = '+420 736 168 796' WHERE id = 1; -- Pavel Osička
UPDATE vehicles SET phone = '+420 739 355 521' WHERE id = 2; -- Kuba
UPDATE vehicles SET phone = '+420 730 635 302' WHERE id = 3; -- Kamil
UPDATE vehicles SET phone = '+420 720 581 296' WHERE id = 4; -- Petr
UPDATE vehicles SET phone = '+420 777 807 874' WHERE id = 5; -- Adam
UPDATE vehicles SET phone = '+420 720 758 823' WHERE id = 6; -- Honza
UPDATE vehicles SET phone = '+420 792 892 655' WHERE id = 7; -- Vlado
*/

-- 3. Update vehicles with car phone numbers:
/*
UPDATE vehicles SET phone = '+420 736 168 796' WHERE id = 1; -- Pavel Osička
UPDATE vehicles SET phone = '+420 739 355 521' WHERE id = 2; -- Kuba
UPDATE vehicles SET phone = '+420 730 635 302' WHERE id = 3; -- Kamil
UPDATE vehicles SET phone = '+420 720 581 296' WHERE id = 4; -- Petr
UPDATE vehicles SET phone = '+420 777 807 874' WHERE id = 5; -- Adam
UPDATE vehicles SET phone = '+420 720 758 823' WHERE id = 6; -- Honza
UPDATE vehicles SET phone = '+420 792 892 655' WHERE id = 7; -- Vlado
*/

-- ===========================================
-- VERIFICATION QUERIES
-- ===========================================

-- Check if tables exist:
-- SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('people', 'vehicles', 'driver_messages');

-- Check vehicle auth accounts (created in Supabase Auth):
-- SELECT id, email, created_at FROM auth.users WHERE email LIKE 'vinnetaxi%@gmail.com' ORDER BY email;

-- Check vehicle phone numbers:
-- SELECT id, name, phone FROM vehicles WHERE id <= 7 ORDER BY id;

-- Check RLS policies:
-- SELECT schemaname, tablename, policyname FROM pg_policies WHERE tablename = 'driver_messages';

-- ===========================================
-- SYSTEM OVERVIEW
-- ===========================================
-- • Uses existing 'people' table for dispatcher reference only
-- • Driver app authenticates directly with vehicle emails (vinnetaxi1@gmail.com, etc.)
-- • No linking between people and auth users - vehicles are independent
-- • Vehicle phones: Each vehicle gets its own car phone number
-- • Chat system: driver_messages table with vehicle-based identification
-- • Authentication: Vehicles log in with their own emails