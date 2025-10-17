-- Create the driver_stats table for detailed driver statistics
CREATE TABLE IF NOT EXISTS driver_stats (
  driver_id INTEGER PRIMARY KEY,
  total_distance DECIMAL(10,2) DEFAULT 0.0,
  total_revenue DECIMAL(10,2) DEFAULT 0.0,
  total_fuel_cost DECIMAL(10,2) DEFAULT 0.0,
  average_rating DECIMAL(3,2) DEFAULT 0.0,
  total_rides INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security (RLS) if needed for security
-- ALTER TABLE driver_stats ENABLE ROW LEVEL SECURITY;

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_driver_stats_total_revenue ON driver_stats (total_revenue DESC);

-- Optional: Create a policy for RLS if enabled
-- CREATE POLICY "Allow all operations for authenticated users" ON driver_stats
-- FOR ALL USING (auth.role() = 'authenticated');
