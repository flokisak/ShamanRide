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
  receiver_id TEXT NOT NULL, -- 'driver_X' for drivers or dispatcher user ID
  message TEXT NOT NULL,
  timestamp BIGINT NOT NULL, -- Unix timestamp in milliseconds
  read BOOLEAN DEFAULT FALSE
);

-- Enable Row Level Security for driver_messages
ALTER TABLE driver_messages ENABLE ROW LEVEL SECURITY;

-- RLS Policies for driver_messages (dispatcher can read/write all, drivers can read/write their own)
CREATE POLICY "Dispatchers can read all driver messages" ON driver_messages
  FOR SELECT USING (auth.jwt() ->> 'role' = 'dispatcher');

CREATE POLICY "Dispatchers can send driver messages" ON driver_messages
  FOR INSERT WITH CHECK (auth.jwt() ->> 'role' = 'dispatcher');

CREATE POLICY "Drivers can read their messages" ON driver_messages
  FOR SELECT USING (receiver_id = ('driver_' || (SELECT id FROM drivers WHERE id = auth.uid())::text) OR sender_id = ('driver_' || (SELECT id FROM drivers WHERE id = auth.uid())::text));

CREATE POLICY "Drivers can send messages" ON driver_messages
  FOR INSERT WITH CHECK (sender_id = ('driver_' || (SELECT id FROM drivers WHERE id = auth.uid())::text));

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_locations_driver_timestamp ON locations(driver_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_messages_participants ON messages(sender_id, receiver_id);
CREATE INDEX IF NOT EXISTS idx_driver_messages_timestamp ON driver_messages(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_driver_messages_participants ON driver_messages(sender_id, receiver_id);
