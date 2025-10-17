-- Create the user_settings table for storing user-specific settings
CREATE TABLE IF NOT EXISTS user_settings (
  user_id TEXT PRIMARY KEY,
  theme TEXT DEFAULT 'light',
  language TEXT DEFAULT 'en',
  notifications_enabled BOOLEAN DEFAULT TRUE,
  sound_enabled BOOLEAN DEFAULT TRUE,
  vibration_enabled BOOLEAN DEFAULT TRUE,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security (RLS) if needed for security
-- ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_user_settings_updated_at ON user_settings (updated_at DESC);

-- Optional: Create a policy for RLS if enabled
-- CREATE POLICY "Users can only access their own settings" ON user_settings
-- FOR ALL USING (auth.uid()::text = user_id);
