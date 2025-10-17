-- Complete SQL script to create all required tables for the ShamanRide application
-- Run this script in your Supabase SQL editor to set up the database schema

-- 1. Driver Messages Table
\i create-driver-messages-table.sql

-- 2. Locations Table
\i create-locations-table.sql

-- 3. Ride Logs Table
\i create-ride-logs-table.sql

-- 4. Vehicles Table
\i create-vehicles-table.sql

-- 5. People Table
\i create-people-table.sql

-- 6. Notifications Table
\i create-notifications-table.sql

-- 7. Tariff Table
\i create-tariff-table.sql

-- 8. Fuel Prices Table
\i create-fuel-prices-table.sql

-- 9. Messaging Settings Table
\i create-messaging-settings-table.sql

-- 10. SMS Messages Table
\i create-sms-messages-table.sql

-- 11. Company Info Table
\i create-company-info-table.sql

-- 12. Driver Scores Table
\i create-driver-scores-table.sql

-- 13. Achievements Table
\i create-achievements-table.sql

-- 14. Driver Stats Table
\i create-driver-stats-table.sql

-- 15. Manual Entries Table
\i create-manual-entries-table.sql

-- 16. User Settings Table
\i create-user-settings-table.sql

-- Optional: Insert some default data
-- INSERT INTO tariff (starting_fee, price_per_km_car, price_per_km_van) VALUES (50.00, 15.00, 20.00) ON CONFLICT (id) DO NOTHING;
-- INSERT INTO fuel_prices (diesel, petrol) VALUES (35.00, 32.00) ON CONFLICT (id) DO NOTHING;
-- INSERT INTO messaging_settings (app) VALUES ('SMS') ON CONFLICT (id) DO NOTHING;
