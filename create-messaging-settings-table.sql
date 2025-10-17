-- Create the messaging_settings table for storing messaging app preferences
CREATE TABLE IF NOT EXISTS messaging_settings (
  id INTEGER PRIMARY KEY DEFAULT 1,
  app TEXT NOT NULL DEFAULT 'SMS'
);

-- Enable Row Level Security (RLS) if needed for security
-- ALTER TABLE messaging_settings ENABLE ROW LEVEL SECURITY;

-- Optional: Create a policy for RLS if enabled
-- CREATE POLICY "Allow all operations for authenticated users" ON messaging_settings
-- FOR ALL USING (auth.role() = 'authenticated');
