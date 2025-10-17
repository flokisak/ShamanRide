-- Create the locations table for storing GPS location data from driver apps
CREATE TABLE IF NOT EXISTS locations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  vehicle_id INTEGER NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security (RLS) if needed for security
-- ALTER TABLE locations ENABLE ROW LEVEL SECURITY;

-- Create an index on vehicle_id for efficient filtering
CREATE INDEX IF NOT EXISTS idx_locations_vehicle_id ON locations (vehicle_id);

-- Create an index on timestamp for efficient ordering
CREATE INDEX IF NOT EXISTS idx_locations_timestamp ON locations (timestamp DESC);

-- Optional: Create a policy for RLS if enabled
-- CREATE POLICY "Allow all operations for authenticated users" ON locations
-- FOR ALL USING (auth.role() = 'authenticated');
