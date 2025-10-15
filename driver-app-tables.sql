-- SQL to create tables for ShamanRide Driver App

-- 1. Create drivers table
CREATE TABLE IF NOT EXISTS drivers (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT,
  email TEXT UNIQUE,
  current_status TEXT DEFAULT 'offline',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create locations table for GPS tracking
CREATE TABLE IF NOT EXISTS locations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  driver_id UUID NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  timestamp TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- 3. Create messages table for driver-dispatcher communication
CREATE TABLE IF NOT EXISTS messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  receiver_id TEXT NOT NULL, -- Can be 'dispatcher' or user UUID
  message TEXT NOT NULL,
  timestamp TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Enable Row Level Security
ALTER TABLE drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- RLS Policies for drivers
CREATE POLICY "Users can read their own driver profile" ON drivers
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update their own driver profile" ON drivers
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert their own driver profile" ON drivers
  FOR INSERT WITH CHECK (auth.uid() = id);

-- RLS Policies for locations (drivers can insert their own, dispatchers can read all)
CREATE POLICY "Drivers can insert their locations" ON locations
  FOR INSERT WITH CHECK (auth.uid() = driver_id);

CREATE POLICY "Dispatchers can read all locations" ON locations
  FOR SELECT USING (auth.jwt() ->> 'role' = 'dispatcher' OR auth.uid() = driver_id);

-- RLS Policies for messages (users can read/write their messages)
CREATE POLICY "Users can read their messages" ON messages
  FOR SELECT USING (auth.uid() = sender_id OR auth.uid()::text = receiver_id);

CREATE POLICY "Users can send messages" ON messages
  FOR INSERT WITH CHECK (auth.uid() = sender_id);

-- 4. Create driver_messages table for dispatcher-driver chat
CREATE TABLE IF NOT EXISTS driver_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  sender_id TEXT NOT NULL, -- dispatcher user ID or 'driver_X' for drivers
  receiver_id TEXT NOT NULL, -- 'driver_X' for drivers or 'dispatcher' for dispatchers
  message TEXT NOT NULL,
  timestamp TIMESTAMPTZ DEFAULT NOW() NOT NULL, -- Use TIMESTAMPTZ for consistency
  read BOOLEAN DEFAULT FALSE
);

-- Enable Row Level Security for driver_messages
ALTER TABLE driver_messages ENABLE ROW LEVEL SECURITY;

-- RLS Policies for driver_messages (simplified - allow authenticated users to read/write)
CREATE POLICY "Authenticated users can read driver messages" ON driver_messages
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can send driver messages" ON driver_messages
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Alternative: More specific policies if you want to restrict by role
-- CREATE POLICY "Dispatchers can read all driver messages" ON driver_messages
--   FOR SELECT USING (auth.jwt() ->> 'role' = 'dispatcher' OR auth.jwt() ->> 'email' LIKE 'vinnetaxi%@gmail.com');

-- CREATE POLICY "Dispatchers can send driver messages" ON driver_messages
--   FOR INSERT WITH CHECK (auth.jwt() ->> 'role' = 'dispatcher');

-- CREATE POLICY "Drivers can read their messages" ON driver_messages
--   FOR SELECT USING (
--     (receiver_id = 'dispatcher' AND sender_id LIKE 'driver_%') OR
--     (sender_id = 'dispatcher' AND receiver_id LIKE 'driver_%') OR
--     (auth.jwt() ->> 'email' LIKE 'vinnetaxi%@gmail.com' AND (
--       receiver_id = ('driver_' || substring(auth.jwt() ->> 'email' from 'vinnetaxi(\d+)@gmail\.com')) OR
--       sender_id = ('driver_' || substring(auth.jwt() ->> 'email' from 'vinnetaxi(\d+)@gmail\.com'))
--     ))
--   );

-- CREATE POLICY "Drivers can send messages" ON driver_messages
--   FOR INSERT WITH CHECK (auth.jwt() ->> 'email' LIKE 'vinnetaxi%@gmail.com' AND sender_id = ('driver_' || substring(auth.jwt() ->> 'email' from 'vinnetaxi(\d+)@gmail\.com')));

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_locations_driver_timestamp ON locations(driver_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_messages_participants ON messages(sender_id, receiver_id);
CREATE INDEX IF NOT EXISTS idx_driver_messages_timestamp ON driver_messages(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_driver_messages_participants ON driver_messages(sender_id, receiver_id);

-- 5. Add vehicle_id to drivers table for vehicle assignment
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS vehicle_id INTEGER REFERENCES vehicles(id);

-- 6. Setup initial driver accounts (run these manually in Supabase SQL editor)
-- Note: Replace the UUIDs with actual auth user IDs after creating the accounts
/*
-- Create auth users for drivers (do this in Supabase Auth dashboard or via API)
-- Then insert driver records:

INSERT INTO drivers (id, name, email, vehicle_id) VALUES
  ('driver-1-uuid', 'Pavel Osička', 'vinnetaxi1@gmail.com', 1),
  ('driver-2-uuid', 'Kuba', 'vinnetaxi2@gmail.com', 2),
  ('driver-3-uuid', 'Kamil', 'vinnetaxi3@gmail.com', 3),
  ('driver-4-uuid', 'Petr', 'vinnetaxi4@gmail.com', 4),
  ('driver-5-uuid', 'Adam', 'vinnetaxi5@gmail.com', 5),
  ('driver-6-uuid', 'Honza', 'vinnetaxi6@gmail.com', 6),
  ('driver-7-uuid', 'Vlado', 'vinnetaxi7@gmail.com', 7)
ON CONFLICT (email) DO NOTHING;

-- Update vehicles with phone numbers (car phones)
UPDATE vehicles SET phone = '+420 736 168 796' WHERE id = 1; -- Pavel
UPDATE vehicles SET phone = '+420 739 355 521' WHERE id = 2; -- Kuba
UPDATE vehicles SET phone = '+420 730 635 302' WHERE id = 3; -- Kamil
UPDATE vehicles SET phone = '+420 720 581 296' WHERE id = 4; -- Petr
UPDATE vehicles SET phone = '+420 777 807 874' WHERE id = 5; -- Adam
UPDATE vehicles SET phone = '+420 720 758 823' WHERE id = 6; -- Honza
UPDATE vehicles SET phone = '+420 792 892 655' WHERE id = 7; -- Vlado
*/
