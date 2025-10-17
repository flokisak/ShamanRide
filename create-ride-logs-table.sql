-- Create the ride_logs table for storing ride information
CREATE TABLE IF NOT EXISTS ride_logs (
  id TEXT PRIMARY KEY,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  vehicle_name TEXT,
  vehicle_license_plate TEXT,
  driver_name TEXT,
  vehicle_type TEXT,
  customer_name TEXT NOT NULL,
  ride_type TEXT DEFAULT 'business',
  customer_phone TEXT NOT NULL,
  stops JSONB NOT NULL,
  passengers INTEGER NOT NULL,
  pickup_time TEXT,
  status TEXT DEFAULT 'pending',
  vehicle_id INTEGER,
  notes TEXT,
  estimated_price DECIMAL(10,2),
  estimated_pickup_timestamp TIMESTAMPTZ,
  estimated_completion_timestamp TIMESTAMPTZ,
  fuel_cost DECIMAL(10,2),
  distance DECIMAL(10,2),
  accepted_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  navigation_url TEXT
);

-- Enable Row Level Security (RLS) if needed for security
-- ALTER TABLE ride_logs ENABLE ROW LEVEL SECURITY;

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_ride_logs_vehicle_id ON ride_logs (vehicle_id);
CREATE INDEX IF NOT EXISTS idx_ride_logs_status ON ride_logs (status);
CREATE INDEX IF NOT EXISTS idx_ride_logs_timestamp ON ride_logs (timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_ride_logs_customer_name ON ride_logs (customer_name);

-- Optional: Create a policy for RLS if enabled
-- CREATE POLICY "Allow all operations for authenticated users" ON ride_logs
-- FOR ALL USING (auth.role() = 'authenticated');
