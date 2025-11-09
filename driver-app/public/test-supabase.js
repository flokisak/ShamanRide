// Test script to verify Supabase authentication
// Run this in the browser console of the driver-app

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://dmxkqofoecqdjbigxoon.supabase.co";
const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRteGtxb2ZvZWNxZGpiaWd4b29uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgxNDE5OTUsImV4cCI6MjA3MzcxNzk5NX0.FTnH0I9OC_rN7tyhK4Uss5yPWQ3B27XS72v5p1FAINo";

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function testConnection() {
  console.log('Testing Supabase connection...');

  try {
    // Test basic connection by trying to get auth status
    const { data, error } = await supabase.auth.getSession();
    if (error) {
      console.error('Connection test failed:', error);
      return false;
    }

    console.log('Connection successful. Current session:', data.session ? 'Active' : 'None');
    return true;
  } catch (err) {
    console.error('Connection test error:', err);
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
    console.error('Sign in error:', err);
    return false;
  }
}

// Make functions available globally
window.testSupabaseConnection = testConnection;
window.testSupabaseSignIn = testSignIn;

console.log('Test functions loaded. Use:');
console.log('- testSupabaseConnection()');
console.log('- testSupabaseSignIn("email@example.com", "password")');