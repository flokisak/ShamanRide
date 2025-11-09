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

async function testClientQuery() {
  console.log('Testing client-side query logic...');

  try {
    // Test the same query logic as in SocketChat component
    const targetId = '1'; // Test with driver 1
    const chatType = 'dispatcher_driver';

    let query = supabase
      .from('driver_messages')
      .select('*')
      .order('timestamp', { ascending: true })
      .limit(50);

    if (chatType === 'dispatcher_driver') {
      query = query.or(`and(sender_id.eq.dispatcher,receiver_id.eq.driver_${targetId}),and(sender_id.eq.driver_${targetId},receiver_id.eq.dispatcher)`);
    }

    console.log('Query URL:', query.url.toString());

    const { data, error } = await query;

    if (error) {
      console.error('Error with complex OR query:', error);
      console.log('Error details:', JSON.stringify(error, null, 2));

      // Try a simpler query
      console.log('Trying simpler query...');
      const simpleQuery = supabase
        .from('driver_messages')
        .select('*')
        .or(`sender_id.eq.dispatcher,receiver_id.eq.dispatcher`)
        .order('timestamp', { ascending: false })
        .limit(10);

      const { data: simpleData, error: simpleError } = await simpleQuery;

      if (simpleError) {
        console.error('Error with simple query:', simpleError);
      } else {
        console.log('Simple query successful:', simpleData);
      }

    } else {
      console.log('✅ Complex OR query successful!');
      console.log('Messages found:', data?.length || 0);
      if (data && data.length > 0) {
        console.log('Sample messages:', data.slice(0, 3));
      }
    }

  } catch (err) {
    console.error('Unexpected error:', err);
  }
}

testClientQuery();
