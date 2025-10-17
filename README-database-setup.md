# Database Setup for ShamanRide

This guide explains how to set up the Supabase database schema for the ShamanRide application.

## Prerequisites

- A Supabase project (create one at https://supabase.com)
- Access to the Supabase SQL editor

## Quick Setup

1. Go to your Supabase dashboard: https://supabase.com/dashboard/project/YOUR_PROJECT_ID/editor
2. Open the SQL Editor
3. Copy and paste the contents of `create-all-tables.sql`
4. Click "Run" to execute the script

## Individual Table Scripts

If you prefer to run tables individually or need more control, you can execute each table creation script separately:

- `create-driver-messages-table.sql` - Messages between drivers and dispatchers
- `create-locations-table.sql` - GPS location data from driver apps
- `create-ride-logs-table.sql` - Ride information and logs
- `create-vehicles-table.sql` - Vehicle information
- `create-people-table.sql` - Driver and staff information
- `create-notifications-table.sql` - System notifications
- `create-tariff-table.sql` - Pricing information
- `create-fuel-prices-table.sql` - Fuel pricing data
- `create-messaging-settings-table.sql` - Messaging app preferences
- `create-sms-messages-table.sql` - SMS message records
- `create-company-info-table.sql` - Company information
- `create-driver-scores-table.sql` - Gamification scores
- `create-achievements-table.sql` - Driver achievements
- `create-driver-stats-table.sql` - Detailed driver statistics
- `create-manual-entries-table.sql` - Manually entered ride data
- `create-user-settings-table.sql` - User-specific settings

## Environment Variables

Make sure your environment variables are set correctly in your `.env` file:

```env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
VITE_SUPABASE_SERVICE_KEY=your_supabase_service_key
```

## Row Level Security (RLS)

By default, the table creation scripts include commented-out RLS policies. If you want to enable RLS for security:

1. Uncomment the `ALTER TABLE ... ENABLE ROW LEVEL SECURITY;` lines
2. Uncomment and modify the policy creation statements according to your security requirements
3. Run the scripts again

## Troubleshooting

### Locations Table Issues

If you see errors about the locations table not existing:

1. Make sure you've run the `create-locations-table.sql` script
2. Check that your Supabase project has the necessary permissions
3. Verify the table was created in the Table Editor

### Permission Errors

If you encounter permission errors:

1. Check that you're using the correct Supabase keys
2. Ensure your user has the necessary permissions in Supabase
3. Try running the scripts as a service role if available

### Schema Mismatches

If the application reports schema errors:

1. Verify all tables were created with the correct column names and types
2. Check the Supabase logs for any creation errors
3. Compare the created tables with the SQL scripts

## Support

If you encounter issues:

1. Check the Supabase documentation: https://supabase.com/docs
2. Review the application logs for specific error messages
3. Ensure all environment variables are correctly set
