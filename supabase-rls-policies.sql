-- Enable RLS on tables
ALTER TABLE ride_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE driver_messages ENABLE ROW LEVEL SECURITY;

-- Ride Logs Policies
-- Allow dispatcher to do everything
CREATE POLICY "Dispatcher full access to ride_logs" ON ride_logs
FOR ALL USING (auth.jwt() ->> 'email' = 'dispatcher@shamanride.com'); -- Replace with actual dispatcher email

-- Allow drivers to read all ride_logs
CREATE POLICY "Drivers can read ride_logs" ON ride_logs
FOR SELECT USING (auth.role() = 'authenticated');

-- Allow drivers to update ride_logs for their vehicle
CREATE POLICY "Drivers can update their ride_logs" ON ride_logs
FOR UPDATE USING (
  vehicle_id IN (
    SELECT id FROM vehicles WHERE email = auth.jwt() ->> 'email'
  )
);

-- Vehicles Policies
-- Allow dispatcher to do everything
CREATE POLICY "Dispatcher full access to vehicles" ON vehicles
FOR ALL USING (auth.jwt() ->> 'email' = 'dispatcher@shamanride.com'); -- Replace with actual dispatcher email

-- Allow drivers to read vehicles
CREATE POLICY "Drivers can read vehicles" ON vehicles
FOR SELECT USING (auth.role() = 'authenticated');

-- Allow drivers to update their own vehicle
CREATE POLICY "Drivers can update their vehicle" ON vehicles
FOR UPDATE USING (email = auth.jwt() ->> 'email');

-- Driver Messages Policies
-- Allow authenticated users to read/write messages
CREATE POLICY "Users can manage driver_messages" ON driver_messages
FOR ALL USING (auth.role() = 'authenticated');