-- Create the fuel_prices table for storing fuel pricing information
CREATE TABLE IF NOT EXISTS fuel_prices (
  id INTEGER PRIMARY KEY DEFAULT 1,
  diesel DECIMAL(5,2) NOT NULL,
  petrol DECIMAL(5,2) NOT NULL
);

-- Enable Row Level Security (RLS) if needed for security
-- ALTER TABLE fuel_prices ENABLE ROW LEVEL SECURITY;

-- Optional: Create a policy for RLS if enabled
-- CREATE POLICY "Allow all operations for authenticated users" ON fuel_prices
-- FOR ALL USING (auth.role() = 'authenticated');
