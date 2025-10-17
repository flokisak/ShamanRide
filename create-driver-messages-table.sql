-- Create the driver_messages table for storing messages between drivers and dispatchers
CREATE TABLE IF NOT EXISTS driver_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  sender_id TEXT NOT NULL,
  receiver_id TEXT NOT NULL,
  message TEXT NOT NULL,
  read BOOLEAN DEFAULT FALSE,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security (RLS) if needed for security
-- ALTER TABLE driver_messages ENABLE ROW LEVEL SECURITY;

-- Create an index on timestamp for efficient ordering
CREATE INDEX IF NOT EXISTS idx_driver_messages_timestamp ON driver_messages (timestamp DESC);

-- Create an index on receiver_id for efficient filtering
CREATE INDEX IF NOT EXISTS idx_driver_messages_receiver_id ON driver_messages (receiver_id);

-- Optional: Create a policy for RLS if enabled
-- CREATE POLICY "Allow all operations for authenticated users" ON driver_messages
-- FOR ALL USING (auth.role() = 'authenticated');
