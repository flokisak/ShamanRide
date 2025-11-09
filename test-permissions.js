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

async function testPermissions() {
  console.log('Testing database permissions...');

  // Test operations that are failing in the browser
  const tests = [
    {
      name: 'Insert notification',
      operation: () => supabase.from('notifications').insert({
        id: 'test-' + Date.now(),
        type: 'info',
        titleKey: 'test.title',
        messageKey: 'test.message',
        timestamp: Date.now()
      })
    },
    {
      name: 'Insert SMS message',
      operation: () => supabase.from('sms_messages').insert({
        id: 'test-sms-' + Date.now(),
        timestamp: Date.now(),
        direction: 'outgoing',
        to: '+420123456789',
        text: 'Test SMS',
        status: 'sent'
      })
    },
    {
      name: 'Upsert driver score',
      operation: () => supabase.from('driver_scores').upsert({
        driver_id: 999,
        total_score: 100,
        updated_at: new Date().toISOString()
      }, { onConflict: 'driver_id' })
    }
  ];

  for (const test of tests) {
    try {
      console.log(`\nTesting: ${test.name}`);
      const { data, error } = await test.operation();

      if (error) {
        console.error(`❌ ${test.name} failed:`, error.message);
        console.error('Error details:', JSON.stringify(error, null, 2));
      } else {
        console.log(`✅ ${test.name} succeeded`);
        console.log('Result:', data);
      }
    } catch (err) {
      console.error(`❌ ${test.name} error:`, err.message);
    }
  }
}

testPermissions();
