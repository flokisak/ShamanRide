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

async function testSchema() {
  console.log('Testing database schema...');

  const tables = ['notifications', 'driver_scores'];

  for (const table of tables) {
    try {
      console.log(`\n--- Checking ${table} table schema ---`);

      // Try to get table structure by attempting to insert with all possible fields
      const testData = {
        notifications: {
          id: 'test-' + Date.now(),
          type: 'info',
          titleKey: 'test.title',
          messageKey: 'test.message',
          messageParams: {},
          timestamp: Date.now(),
          rideLogId: null
        },
        driver_scores: {
          driver_id: 999,
          driver_name: 'Test Driver',
          total_score: 100,
          rides_completed: 0,
          total_distance: 0,
          total_revenue: 0,
          average_rating: 0,
          updated_at: new Date().toISOString()
        }
      };

      const { data, error } = await supabase
        .from(table)
        .insert(testData[table])
        .select();

      if (error) {
        console.error(`❌ Schema test failed for ${table}:`, error.message);
        console.error('Error details:', JSON.stringify(error, null, 2));
      } else {
        console.log(`✅ Schema test succeeded for ${table}`);
        console.log('Data:', data);

        // Clean up test data
        if (data && data.length > 0) {
          await supabase.from(table).delete().eq('id', data[0].id);
          console.log('✅ Test data cleaned up');
        }
      }
    } catch (err) {
      console.error(`❌ Error testing ${table}:`, err.message);
    }
  }
}

testSchema();
