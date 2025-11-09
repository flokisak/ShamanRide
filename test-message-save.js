import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import io from 'socket.io-client';

dotenv.config({ path: 'realtime-server/.env' });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function testMessageSaving() {
  console.log('Testing message saving through Socket.IO...');

  try {
    // Get a session token for authentication
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session) {
      console.error('No valid session found:', sessionError);
      return;
    }

    const token = session.access_token;
    console.log('Got session token, connecting to socket...');

    // Connect to socket
    const socket = io('http://localhost:3000', {
      auth: { token },
      transports: ['websocket', 'polling']
    });

    socket.on('connect', async () => {
      console.log('Connected to socket server');

      // Join a test room
      socket.emit('join_chat_dispatcher_driver', {
        dispatcherId: 'dispatcher',
        driverId: '1' // Test with driver 1
      });

      console.log('Joined chat room, sending test message...');

      // Send a test message
      const testMessage = {
        room: 'chat:Ddispatcher_R1',
        message: 'Test message from Node.js script',
        senderId: 'dispatcher',
        receiverId: 'driver_1',
        type: 'dispatcher_driver'
      };

      socket.emit('message', testMessage);

      // Wait a bit then check if message was saved
      setTimeout(async () => {
        console.log('Checking if message was saved to database...');

        const { data: messages, error } = await supabase
          .from('driver_messages')
          .select('*')
          .eq('sender_id', 'dispatcher')
          .eq('receiver_id', 'driver_1')
          .order('timestamp', { ascending: false })
          .limit(5);

        if (error) {
          console.error('Error checking messages:', error);
        } else {
          console.log('Recent messages:', messages);

          // Check if our test message is there
          const testMsg = messages.find(msg =>
            msg.message.includes('Test message from Node.js script')
          );

          if (testMsg) {
            console.log('✅ SUCCESS: Test message was saved to database!');
            console.log('Message details:', testMsg);
          } else {
            console.log('❌ Test message not found in database');
            console.log('All recent messages:', messages);
          }
        }

        socket.disconnect();
        process.exit(0);
      }, 2000);

    });

    socket.on('connect_error', (error) => {
      console.error('Socket connection error:', error);
      process.exit(1);
    });

    socket.on('message_delivered', (data) => {
      console.log('Message delivery confirmation:', data);
    });

    socket.on('message_error', (error) => {
      console.error('Message error:', error);
    });

  } catch (err) {
    console.error('Unexpected error:', err);
    process.exit(1);
  }
}

testMessageSaving();
