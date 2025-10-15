-- Create locations table for driver GPS tracking
CREATE TABLE IF NOT EXISTS locations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  vehicle_id INTEGER NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  timestamp TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_locations_vehicle_timestamp ON locations(vehicle_id, timestamp DESC);

-- Disable RLS for locations table (as mentioned by user)
ALTER TABLE locations DISABLE ROW LEVEL SECURITY;

-- Grant permissions to anon role for locations table
GRANT INSERT ON locations TO anon;
