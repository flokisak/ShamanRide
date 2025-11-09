import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load root .env so script can be executed from any cwd
dotenv.config({ path: 'c:\\Users\\misah\\Documents\\Projekty\\Dispečink\\ShamanRideDev\\.env' });

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY; // Use anon key

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function testDatabase() {
  console.log('Testing database connection...');

  try {
    // Test basic connection
    const { data, error } = await supabase.from('driver_messages').select('*').limit(1);

    if (error) {
      console.error('Error querying driver_messages table:', error);
      console.log('Error details:', JSON.stringify(error, null, 2));

      // Check if table exists by trying to create it
      console.log('Attempting to check table schema...');

      // Try to get table info
      const { data: tableData, error: tableError } = await supabase
        .from('information_schema.tables')
        .select('*')
        .eq('table_name', 'driver_messages')
        .eq('table_schema', 'public');

      if (tableError) {
        console.error('Error checking table existence:', tableError);
      } else {
        console.log('Table info:', tableData);
      }

    } else {
      console.log('Successfully connected to driver_messages table');
      console.log('Sample data:', data);

      // Check table schema
      const { data: schemaData, error: schemaError } = await supabase
        .from('information_schema.columns')
        .select('*')
        .eq('table_name', 'driver_messages')
        .eq('table_schema', 'public');

      if (schemaError) {
        console.error('Error getting schema:', schemaError);
      } else {
        console.log('Table schema:', schemaData);
      }
    }

  } catch (err) {
    console.error('Unexpected error:', err);
  }
}

testDatabase();
