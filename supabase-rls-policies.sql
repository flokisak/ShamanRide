-- Enable RLS on tables
ALTER TABLE ride_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE driver_messages ENABLE ROW LEVEL SECURITY;

-- Ride Logs Policies
-- Allow anonymous access for driver app updates (temporary)
DROP POLICY IF EXISTS "Allow all access to ride_logs" ON ride_logs;
CREATE POLICY "Allow all access to ride_logs" ON ride_logs
FOR ALL USING (true);

-- Vehicles Policies
-- TEMPORARY: Allow all authenticated users full access to vehicles (for testing)
DROP POLICY IF EXISTS "Users full access to vehicles" ON vehicles;
CREATE POLICY "Users full access to vehicles" ON vehicles
FOR ALL USING (auth.role() = 'authenticated');

-- Driver Messages Policies
-- Allow authenticated users to read/write messages
DROP POLICY IF EXISTS "Users can manage driver_messages" ON driver_messages;
CREATE POLICY "Users can manage driver_messages" ON driver_messages
FOR ALL USING (auth.role() = 'authenticated');