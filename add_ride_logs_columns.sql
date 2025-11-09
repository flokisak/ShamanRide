-- Add missing timestamp columns to ride_logs table
-- Run this SQL in your Supabase SQL editor

-- Add timestamp columns for ride lifecycle tracking
ALTER TABLE ride_logs ADD COLUMN IF NOT EXISTS accepted_at BIGINT;
ALTER TABLE ride_logs ADD COLUMN IF NOT EXISTS started_at BIGINT;
ALTER TABLE ride_logs ADD COLUMN IF NOT EXISTS completed_at BIGINT;

-- Add other missing columns that may be needed
ALTER TABLE ride_logs ADD COLUMN IF NOT EXISTS fuel_cost DECIMAL(10,2);
ALTER TABLE ride_logs ADD COLUMN IF NOT EXISTS distance DECIMAL(10,2);
ALTER TABLE ride_logs ADD COLUMN IF NOT EXISTS payment TEXT;
ALTER TABLE ride_logs ADD COLUMN IF NOT EXISTS start_mileage INTEGER;
ALTER TABLE ride_logs ADD COLUMN IF NOT EXISTS end_mileage INTEGER;
ALTER TABLE ride_logs ADD COLUMN IF NOT EXISTS purpose TEXT;
ALTER TABLE ride_logs ADD COLUMN IF NOT EXISTS business_purpose TEXT;

-- Add comments for clarity
COMMENT ON COLUMN ride_logs.accepted_at IS 'Timestamp when ride was accepted by driver (milliseconds since epoch)';
COMMENT ON COLUMN ride_logs.started_at IS 'Timestamp when ride started (milliseconds since epoch)';
COMMENT ON COLUMN ride_logs.completed_at IS 'Timestamp when ride was completed (milliseconds since epoch)';
COMMENT ON COLUMN ride_logs.fuel_cost IS 'Fuel cost for the ride';
COMMENT ON COLUMN ride_logs.distance IS 'Distance traveled in km';
COMMENT ON COLUMN ride_logs.payment IS 'Payment method used';
COMMENT ON COLUMN ride_logs.start_mileage IS 'Vehicle mileage at start of ride';
COMMENT ON COLUMN ride_logs.end_mileage IS 'Vehicle mileage at end of ride';
COMMENT ON COLUMN ride_logs.purpose IS 'Purpose of private ride';
COMMENT ON COLUMN ride_logs.business_purpose IS 'Purpose of business ride';