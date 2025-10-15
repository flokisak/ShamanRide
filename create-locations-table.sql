-- Create locations table for GPS tracking
CREATE TABLE IF NOT EXISTS locations (
    id BIGSERIAL PRIMARY KEY,
    vehicle_id INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create index for efficient queries
CREATE INDEX IF NOT EXISTS idx_locations_vehicle_id_timestamp ON locations(vehicle_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_locations_timestamp ON locations(timestamp DESC);

-- Enable RLS (Row Level Security)
ALTER TABLE locations ENABLE ROW LEVEL SECURITY;

-- Create policy to allow authenticated users to insert their own vehicle locations
CREATE POLICY "Users can insert locations for their vehicles" ON locations
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Create policy to allow users to read locations
CREATE POLICY "Users can read locations" ON locations
    FOR SELECT USING (auth.uid() IS NOT NULL);

-- Grant necessary permissions
GRANT ALL ON locations TO authenticated;
GRANT ALL ON locations TO service_role;