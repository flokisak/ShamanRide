import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://dmxkqofoecqdjbigxoon.supabase.co";
const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRteGtxb2ZvZWNxZGpiaWd4b29uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgxNDE5OTUsImV4cCI6MjA3MzcxNzk5NX0.FTnH0I9OC_rN7tyhK4Uss5yPWQ3B27XS72v5p1FAINo";

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function testConnection() {
  console.log('Testing Supabase connection...');

  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) {
      console.error('Connection test failed:', error.message);
      return false;
    }

    console.log('Connection successful. Current session:', data.session ? 'Active' : 'None');
    return true;
  } catch (err) {
    console.error('Connection test error:', err.message);
    return false;
  }
}

async function createTestUser(email, password) {
  console.log(`Creating test user: ${email}`);

  try {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    });

    if (error) {
      console.error('User creation failed:', error.message);
      return false;
    }

    console.log('User created successfully:', data.user?.email);
    return true;
  } catch (err) {
    console.error('User creation error:', err.message);
    return false;
  }
}

async function testSignIn(email, password) {
  console.log(`Testing sign in for ${email}...`);

  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      console.error('Sign in failed:', error.message);
      return false;
    }

    console.log('Sign in successful:', data.user?.email);
    return true;
  } catch (err) {
    console.error('Sign in error:', err.message);
    return false;
  }
}

async function main() {
  // Test connection
  const connected = await testConnection();
  if (!connected) {
    console.error('Cannot connect to Supabase. Exiting.');
    return;
  }

  // Create test user
  const testEmail = 'test-driver@example.com';
  const testPassword = 'testpassword123';

  console.log('Creating test user...');
  const userCreated = await createTestUser(testEmail, testPassword);
  if (!userCreated) {
    console.log('User might already exist, trying to sign in...');
  }

  // Test sign in
  console.log('Testing sign in...');
  await testSignIn(testEmail, testPassword);
}

main().catch(console.error);