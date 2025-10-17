-- Create the manual_entries table for storing manually entered ride data
CREATE TABLE IF NOT EXISTS manual_entries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  driver_id INTEGER NOT NULL,
  vehicle_id INTEGER NOT NULL,
  customer_name TEXT NOT NULL,
  customer_phone TEXT,
  pickup_location TEXT NOT NULL,
  dropoff_location TEXT,
  distance DECIMAL(10,2),
  price DECIMAL(10,2) NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  ride_date DATE NOT NULL
);

-- Enable Row Level Security (RLS) if needed for security
-- ALTER TABLE manual_entries ENABLE ROW LEVEL SECURITY;

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_manual_entries_driver_id ON manual_entries (driver_id);
CREATE INDEX IF NOT EXISTS idx_manual_entries_vehicle_id ON manual_entries (vehicle_id);
CREATE INDEX IF NOT EXISTS idx_manual_entries_created_at ON manual_entries (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_manual_entries_ride_date ON manual_entries (ride_date);

-- Optional: Create a policy for RLS if enabled
-- CREATE POLICY "Allow all operations for authenticated users" ON manual_entries
-- FOR ALL USING (auth.role() = 'authenticated');
