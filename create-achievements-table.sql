-- Create the achievements table for gamification
CREATE TABLE IF NOT EXISTS achievements (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  driver_id INTEGER NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  points INTEGER DEFAULT 0,
  unlocked_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security (RLS) if needed for security
-- ALTER TABLE achievements ENABLE ROW LEVEL SECURITY;

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_achievements_driver_id ON achievements (driver_id);
CREATE INDEX IF NOT EXISTS idx_achievements_unlocked_at ON achievements (unlocked_at DESC);

-- Optional: Create a policy for RLS if enabled
-- CREATE POLICY "Allow all operations for authenticated users" ON achievements
-- FOR ALL USING (auth.role() = 'authenticated');
