-- ===========================================
-- SHAMANRIDE DRIVER CHAT SYSTEM SETUP
-- ===========================================
-- Run this SQL script in your Supabase SQL editor to set up the driver chat system

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

-- 5. Add vehicle_id column to drivers table (if not exists)
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS vehicle_id INTEGER REFERENCES vehicles(id);

-- ===========================================
-- MANUAL STEPS (do these in Supabase dashboard):
-- ===========================================

-- 1. Create driver auth accounts:
-- Go to Authentication > Users in Supabase dashboard
-- Create users with emails: vinnetaxi1@gmail.com through vinnetaxi7@gmail.com
-- Set passwords for each account

-- 2. After creating auth users, run this SQL with actual UUIDs:
/*
-- Replace 'driver-1-uuid' etc. with actual auth user IDs from Supabase
INSERT INTO drivers (id, name, email, vehicle_id) VALUES
  ('REPLACE_WITH_ACTUAL_UUID_1', 'Pavel Osička', 'vinnetaxi1@gmail.com', 1),
  ('REPLACE_WITH_ACTUAL_UUID_2', 'Kuba', 'vinnetaxi2@gmail.com', 2),
  ('REPLACE_WITH_ACTUAL_UUID_3', 'Kamil', 'vinnetaxi3@gmail.com', 3),
  ('REPLACE_WITH_ACTUAL_UUID_4', 'Petr', 'vinnetaxi4@gmail.com', 4),
  ('REPLACE_WITH_ACTUAL_UUID_5', 'Adam', 'vinnetaxi5@gmail.com', 5),
  ('REPLACE_WITH_ACTUAL_UUID_6', 'Honza', 'vinnetaxi6@gmail.com', 6),
  ('REPLACE_WITH_ACTUAL_UUID_7', 'Vlado', 'vinnetaxi7@gmail.com', 7)
ON CONFLICT (email) DO NOTHING;
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
-- SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('drivers', 'vehicles', 'driver_messages');

-- Check driver accounts:
-- SELECT id, name, email, vehicle_id FROM drivers ORDER BY vehicle_id;

-- Check vehicle phone numbers:
-- SELECT id, name, phone FROM vehicles WHERE id <= 7 ORDER BY id;

-- Check RLS policies:
-- SELECT schemaname, tablename, policyname FROM pg_policies WHERE tablename = 'driver_messages';