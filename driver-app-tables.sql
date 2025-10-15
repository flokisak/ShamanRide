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

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_locations_driver_timestamp ON locations(driver_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_messages_participants ON messages(sender_id, receiver_id);
