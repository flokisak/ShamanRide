-- Enable RLS on tables
ALTER TABLE ride_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE driver_messages ENABLE ROW LEVEL SECURITY;

-- Ride Logs Policies
-- TEMPORARY: Allow all authenticated users full access to ride_logs (for testing)
CREATE POLICY "Users full access to ride_logs" ON ride_logs
FOR ALL USING (auth.role() = 'authenticated');

-- Vehicles Policies
-- TEMPORARY: Allow all authenticated users full access to vehicles (for testing)
CREATE POLICY "Users full access to vehicles" ON vehicles
FOR ALL USING (auth.role() = 'authenticated');

-- Driver Messages Policies
-- Allow authenticated users to read/write messages
CREATE POLICY "Users can manage driver_messages" ON driver_messages
FOR ALL USING (auth.role() = 'authenticated');