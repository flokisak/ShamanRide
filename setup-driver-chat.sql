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
-- Note: If you get "policy already exists" errors, you can safely ignore them
CREATE POLICY "Authenticated users can read driver messages" ON driver_messages
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can send driver messages" ON driver_messages
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
-- Create users with these exact UUIDs and emails:
-- vinnetaxi1@gmail.com (UUID: b69d3d53-6360-4408-a411-a83da97284ce)
-- vinnetaxi2@gmail.com (UUID: fc906dca-4b65-4439-9944-47eb31c3f87e)
-- vinnetaxi3@gmail.com (UUID: 4d34449f-cbed-40f5-8766-bfd8f1f52385)
-- vinnetaxi4@gmail.com (UUID: bce8ba6c-ed9b-4f03-9ae8-6537c958f44c)
-- vinnetaxi5@gmail.com (UUID: 9861ac0d-17a9-423d-aaeb-b36f1e48dd8c)
-- vinnetaxi6@gmail.com (UUID: a8bd73f8-d090-4858-b853-43b174c844ba)
-- Set secure passwords for each account
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
-- Option A: If phone column is TEXT/VARCHAR (recommended)
UPDATE vehicles SET phone = '+420 736 168 796' WHERE id = 1; -- vinnetaxi1@gmail.com
UPDATE vehicles SET phone = '+420 739 355 521' WHERE id = 2; -- vinnetaxi2@gmail.com
UPDATE vehicles SET phone = '+420 730 635 302' WHERE id = 3; -- vinnetaxi3@gmail.com
UPDATE vehicles SET phone = '+420 720 581 296' WHERE id = 4; -- vinnetaxi4@gmail.com
UPDATE vehicles SET phone = '+420 777 807 874' WHERE id = 5; -- vinnetaxi5@gmail.com
UPDATE vehicles SET phone = '+420 720 758 823' WHERE id = 6; -- vinnetaxi6@gmail.com

-- Option B: If phone column is NUMERIC (current issue)
-- First change column type: ALTER TABLE vehicles ALTER COLUMN phone TYPE TEXT;
-- Then run the updates above

-- Option C: Store as numeric (remove formatting)
-- UPDATE vehicles SET phone = '420736168796' WHERE id = 1;
-- UPDATE vehicles SET phone = '420739355521' WHERE id = 2;
-- etc.

-- To check current column type:
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'vehicles' AND column_name = 'phone';

-- To change column type to TEXT (recommended):
-- ALTER TABLE vehicles ALTER COLUMN phone TYPE TEXT;
*/

-- ===========================================
-- VERIFICATION QUERIES
-- ===========================================

-- Check if tables exist:
-- SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('people', 'vehicles', 'driver_messages');

-- Check vehicle auth accounts (created in Supabase Auth):
-- SELECT id, email, created_at FROM auth.users WHERE email LIKE 'vinnetaxi%@gmail.com' ORDER BY email;

-- Check vehicle phone numbers:
-- SELECT id, name, phone FROM vehicles WHERE id <= 6 ORDER BY id;

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