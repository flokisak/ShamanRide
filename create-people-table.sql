-- Create the people table for storing driver and staff information
CREATE TABLE IF NOT EXISTS people (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  role TEXT DEFAULT 'driver'
);

-- Enable Row Level Security (RLS) if needed for security
-- ALTER TABLE people ENABLE ROW LEVEL SECURITY;

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_people_email ON people (email);
CREATE INDEX IF NOT EXISTS idx_people_role ON people (role);

-- Optional: Create a policy for RLS if enabled
-- CREATE POLICY "Allow all operations for authenticated users" ON people
-- FOR ALL USING (auth.role() = 'authenticated');
