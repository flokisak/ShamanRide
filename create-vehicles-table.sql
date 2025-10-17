-- Create the vehicles table for storing vehicle information
CREATE TABLE IF NOT EXISTS vehicles (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  driver_id INTEGER,
  license_plate TEXT,
  type TEXT NOT NULL,
  status TEXT DEFAULT 'AVAILABLE',
  location TEXT,
  capacity INTEGER,
  mileage DECIMAL(10,2),
  free_at TIMESTAMPTZ,
  service_interval INTEGER,
  last_service_mileage DECIMAL(10,2),
  technical_inspection_expiry DATE,
  vignette_expiry DATE,
  fuel_type TEXT,
  fuel_consumption DECIMAL(5,2),
  phone TEXT,
  email TEXT
);

-- Enable Row Level Security (RLS) if needed for security
-- ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_vehicles_driver_id ON vehicles (driver_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_status ON vehicles (status);
CREATE INDEX IF NOT EXISTS idx_vehicles_email ON vehicles (email);

-- Optional: Create a policy for RLS if enabled
-- CREATE POLICY "Allow all operations for authenticated users" ON vehicles
-- FOR ALL USING (auth.role() = 'authenticated');
