import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load repository root .env explicitly so running from any cwd works
dotenv.config({ path: 'c:\\Users\\misah\\Documents\\Projekty\\Dispečink\\ShamanRideDev\\.env' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function testMessageSync() {
  console.log('Testing message synchronization...');

  try {
    // Test 1: Send a test message
    const uniqueBody = `Test message ${Date.now()}`;
    const testMessage = {
      sender_id: 'test-sender',
      receiver_id: 'test-receiver',
      message: uniqueBody,
      timestamp: new Date().toISOString(),
  temp_id: Date.now(),
      read: false,
      encrypted: null,
      room: null
    };

    console.log('\nTest 1: Inserting test message');
    const { data: messageData, error: messageError } = await supabase
      .from('driver_messages')
      .insert(testMessage)
      .select();

    if (messageError) {
      console.error('❌ Failed to insert message:', messageError);
    } else {
  console.log('✅ Message inserted successfully:', messageData);

      // Test 2: Verify message exists
      console.log('\nTest 2: Verifying message persistence');
      const { data: verifyData, error: verifyError } = await supabase
        .from('driver_messages')
        .select('*')
        .eq('message', uniqueBody)
        .limit(1);

      if (verifyError) {
        console.error('❌ Failed to verify message:', verifyError);
      } else {
        console.log('✅ Message verified in database:', verifyData);
      }

      // Test 3: Update message status
      console.log('\nTest 3: Testing message status update');
      const { error: updateError } = await supabase
        .from('driver_messages')
        .update({ read: true })
        .eq('message', uniqueBody);

      if (updateError) {
        console.error('❌ Failed to update message status:', updateError);
      } else {
        console.log('✅ Message status updated successfully');
      }

      // Test 4: Clean up test data
      console.log('\nTest 4: Cleaning up test data');
      const { error: deleteError } = await supabase
        .from('driver_messages')
        .delete()
        .eq('message', uniqueBody);

      if (deleteError) {
        console.error('❌ Failed to clean up test data:', deleteError);
      } else {
        console.log('✅ Test data cleaned up successfully');
      }
    }

  } catch (err) {
    console.error('❌ Unexpected error:', err);
  }
}

// Run the test
testMessageSync();