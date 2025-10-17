-- Create the sms_messages table for storing SMS message records
CREATE TABLE IF NOT EXISTS sms_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  direction TEXT NOT NULL, -- 'outgoing' or 'incoming'
  phone_number TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT DEFAULT 'sent',
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  ride_id TEXT,
  gateway_response JSONB
);

-- Enable Row Level Security (RLS) if needed for security
-- ALTER TABLE sms_messages ENABLE ROW LEVEL SECURITY;

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_sms_messages_timestamp ON sms_messages (timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_sms_messages_phone_number ON sms_messages (phone_number);
CREATE INDEX IF NOT EXISTS idx_sms_messages_ride_id ON sms_messages (ride_id);

-- Optional: Create a policy for RLS if enabled
-- CREATE POLICY "Allow all operations for authenticated users" ON sms_messages
-- FOR ALL USING (auth.role() = 'authenticated');
