-- Create driver_messages table for chat functionality
CREATE TABLE IF NOT EXISTS driver_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  sender_id TEXT NOT NULL,
  receiver_id TEXT NOT NULL,
  message TEXT NOT NULL,
  read BOOLEAN DEFAULT FALSE,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for efficient queries
CREATE INDEX IF NOT EXISTS idx_driver_messages_timestamp ON driver_messages (timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_driver_messages_sender_receiver ON driver_messages (sender_id, receiver_id);
CREATE INDEX IF NOT EXISTS idx_driver_messages_receiver ON driver_messages (receiver_id);

-- Enable RLS (will be disabled later if needed)
ALTER TABLE driver_messages ENABLE ROW LEVEL SECURITY;

-- Allow all access for now (temporary)
DROP POLICY IF EXISTS "Allow all access to driver_messages" ON driver_messages;
CREATE POLICY "Allow all access to driver_messages" ON driver_messages
FOR ALL USING (true);