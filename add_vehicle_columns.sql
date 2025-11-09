-- Add missing columns to vehicles table
-- Run this SQL in your Supabase SQL editor

-- Add last_location_update column (timestamp when location was last updated)
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS last_location_update BIGINT;

-- Add mileage column (current vehicle mileage)
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS mileage INTEGER;

-- Add shift-related columns
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS shift_start TIMESTAMPTZ;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS shift_end TIMESTAMPTZ;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS shift_start_odo INTEGER;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS shift_end_odo INTEGER;

-- Add other optional vehicle management columns if they don't exist
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS service_interval INTEGER; -- in km
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS last_service_mileage INTEGER; -- in km
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS technical_inspection_expiry DATE; -- YYYY-MM-DD
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS vignette_expiry DATE; -- YYYY-MM-DD
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS vehicle_notes TEXT;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS fuel_type TEXT; -- 'DIESEL' or 'PETROL'
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS fuel_consumption DECIMAL(5,2); -- L/100km
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS phone TEXT; -- Phone number for the vehicle's built-in phone
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS email TEXT; -- Driver's email for authentication

-- Add comments for clarity
COMMENT ON COLUMN vehicles.last_location_update IS 'Timestamp when vehicle location was last updated';
COMMENT ON COLUMN vehicles.mileage IS 'Current vehicle mileage in km';
COMMENT ON COLUMN vehicles.shift_start IS 'Timestamp when current shift started';
COMMENT ON COLUMN vehicles.shift_end IS 'Timestamp when current shift ended';
COMMENT ON COLUMN vehicles.shift_start_odo IS 'Odometer reading when shift started';
COMMENT ON COLUMN vehicles.shift_end_odo IS 'Odometer reading when shift ended';
