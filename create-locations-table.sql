-- Create locations table for driver GPS tracking
CREATE TABLE IF NOT EXISTS locations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  driver_id TEXT NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  timestamp TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_locations_driver_timestamp ON locations(driver_id, timestamp DESC);

-- Disable RLS for locations table (as mentioned by user)
ALTER TABLE locations DISABLE ROW LEVEL SECURITY;