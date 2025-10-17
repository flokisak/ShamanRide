-- Create the company_info table for storing company information
CREATE TABLE IF NOT EXISTS company_info (
  id INTEGER PRIMARY KEY DEFAULT 1,
  name TEXT NOT NULL,
  address TEXT,
  phone TEXT,
  email TEXT,
  website TEXT,
  tax_id TEXT,
  registration_number TEXT
);

-- Enable Row Level Security (RLS) if needed for security
-- ALTER TABLE company_info ENABLE ROW LEVEL SECURITY;

-- Optional: Create a policy for RLS if enabled
-- CREATE POLICY "Allow all operations for authenticated users" ON company_info
-- FOR ALL USING (auth.role() = 'authenticated');
