import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function testTables() {
  console.log('Testing which tables exist in Supabase...');

  const tables = [
    'ride_logs',
    'driver_messages',
    'vehicles',
    'people',
    'notifications',
    'sms_messages',
    'driver_scores',
    'achievements',
    'driver_stats',
    'manual_entries',
    'locations',
    'user_settings',
    'messaging_settings',
    'company_info',
    'tariff',
    'fuel_prices'
  ];

  for (const table of tables) {
    try {
      const { data, error } = await supabase
        .from(table)
        .select('*')
        .limit(1);

      if (error) {
        console.error(`❌ ${table}: ${error.message}`);
      } else {
        console.log(`✅ ${table}: EXISTS (${Array.isArray(data) ? data.length : 0} records)`);
      }
    } catch (err) {
      console.error(`❌ ${table}: ${err.message}`);
    }
  }
}

testTables();
