-- Create the driver_scores table for gamification
CREATE TABLE IF NOT EXISTS driver_scores (
  driver_id INTEGER PRIMARY KEY,
  total_score INTEGER DEFAULT 0,
  rides_completed INTEGER DEFAULT 0,
  customer_rating DECIMAL(3,2) DEFAULT 0.0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security (RLS) if needed for security
-- ALTER TABLE driver_scores ENABLE ROW LEVEL SECURITY;

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_driver_scores_total_score ON driver_scores (total_score DESC);

-- Optional: Create a policy for RLS if enabled
-- CREATE POLICY "Allow all operations for authenticated users" ON driver_scores
-- FOR ALL USING (auth.role() = 'authenticated');
