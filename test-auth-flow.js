import { io } from 'socket.io-client';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load repository root .env explicitly so running from any cwd works
dotenv.config({ path: 'c:\\Users\\misah\\Documents\\Projekty\\Dispečink\\ShamanRideDev\\.env' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const socketUrl = process.env.VITE_SOCKET_URL || 'http://localhost:3000';

const supabase = createClient(supabaseUrl, supabaseKey);

async function testAuthFlow() {
    console.log('Starting Authentication Flow Tests...');

    try {
        // Test 1: Connect with invalid token
        console.log('\nTest 1: Invalid Token Connection');
        const invalidSocket = io(socketUrl, {
            auth: { token: 'invalid_token' }
        });

        invalidSocket.on('connect_error', (error) => {
            console.log('✅ Expected error for invalid token:', error.message);
            invalidSocket.disconnect();
        });

        // Test 2: Connect with valid token
        console.log('\nTest 2: Valid Token Connection');
        const { data: { session }, error: loginError } = await supabase.auth.signInWithPassword({
            email: process.env.TEST_USER_EMAIL || 'test@example.com',
            password: process.env.TEST_USER_PASSWORD || 'testpassword'
        });

        if (loginError) {
            console.error('❌ Login failed:', loginError.message);
            return;
        }

        const validSocket = io(socketUrl, {
            auth: { token: session.access_token }
        });

        validSocket.on('connect', () => {
            console.log('✅ Successfully connected with valid token');
            
            // Test 3: Verify presence updates
            console.log('\nTest 3: Presence Updates');
            validSocket.on('presence_update', (data) => {
                console.log('✅ Received presence update:', data);
            });

            // Test 4: Room joining
            console.log('\nTest 4: Room Joining');
            validSocket.emit('join_chat_dispatcher_driver', {
                dispatcherId: 'test-dispatcher',
                driverId: 'test-driver'
            });

            // Cleanup after tests
            setTimeout(() => {
                console.log('\nTests completed, cleaning up...');
                validSocket.disconnect();
                process.exit(0);
            }, 5000);
        });

        validSocket.on('connect_error', (error) => {
            console.error('❌ Connection failed:', error.message);
        });

    } catch (error) {
        console.error('❌ Test execution failed:', error);
        process.exit(1);
    }
}

// Run the tests
testAuthFlow();