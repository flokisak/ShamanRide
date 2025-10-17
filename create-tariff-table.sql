-- Create the tariff table for storing pricing information
CREATE TABLE IF NOT EXISTS tariff (
  id INTEGER PRIMARY KEY DEFAULT 1,
  starting_fee DECIMAL(10,2) NOT NULL,
  price_per_km_car DECIMAL(10,2) NOT NULL,
  price_per_km_van DECIMAL(10,2) NOT NULL,
  flat_rates JSONB DEFAULT '[]'::jsonb,
  time_based_tariffs JSONB DEFAULT '[]'::jsonb
);

-- Enable Row Level Security (RLS) if needed for security
-- ALTER TABLE tariff ENABLE ROW LEVEL SECURITY;

-- Optional: Create a policy for RLS if enabled
-- CREATE POLICY "Allow all operations for authenticated users" ON tariff
-- FOR ALL USING (auth.role() = 'authenticated');
