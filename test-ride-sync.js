import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import dotenv from 'dotenv';

// Load repository root .env explicitly so running from any cwd works
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function testRideSync() {
  console.log('Testing ride synchronization...');

  try {
    // Test 1: Create a test ride
    const uniquePlate = `TEST${Date.now()}`;
    const testRide = {
      id: randomUUID(),
      timestamp: Date.now(),
      vehicle_name: 'Test Vehicle',
      vehicle_license_plate: uniquePlate,
      driver_name: 'Test Driver',
      vehicle_type: null,
  customer_name: 'Test Customer',
  customer_phone: '000000000',
      ride_type: 'business',
      status: 'pending',
  vehicle_id: null,
  stops: [],
  passengers: 1,
  pickup_time: Date.now(),
      estimated_price: 100
    };

    console.log('\nTest 1: Creating test ride');
    const { data: rideData, error: rideError } = await supabase
      .from('ride_logs')
      .insert(testRide)
      .select();

    if (rideError) {
      console.error('❌ Failed to create ride:', rideError);
    } else {
      console.log('✅ Ride created successfully:', rideData);

      // Test 2: Update ride status to accepted
      console.log('\nTest 2: Testing ride status update (accepted)');
      const { error: acceptError } = await supabase
        .from('ride_logs')
        .update({ 
          status: 'accepted',
          accepted_at: Date.now()
        })
        .eq('vehicle_license_plate', uniquePlate);

      if (acceptError) {
        console.error('❌ Failed to update ride status:', acceptError);
      } else {
        console.log('✅ Ride status updated to accepted');

        // Test 3: Update ride status to in_progress
        console.log('\nTest 3: Testing ride status update (in_progress)');
          const { error: startError } = await supabase
          .from('ride_logs')
          .update({ 
            status: 'in_progress',
            started_at: Date.now()
          })
          .eq('vehicle_license_plate', uniquePlate);

        if (startError) {
          console.error('❌ Failed to start ride:', startError);
        } else {
          console.log('✅ Ride started successfully');

          // Test 4: Complete the ride
          console.log('\nTest 4: Testing ride completion');
          const { error: completeError } = await supabase
            .from('ride_logs')
            .update({ 
              status: 'completed',
              completed_at: Date.now(),
              distance: 10.5,
              fuel_cost: 25
            })
            .eq('vehicle_license_plate', uniquePlate);

          if (completeError) {
            console.error('❌ Failed to complete ride:', completeError);
          } else {
            console.log('✅ Ride completed successfully');
          }
        }
      }

      // Test 5: Clean up test data
      console.log('\nTest 5: Cleaning up test data');
      const { error: deleteError } = await supabase
        .from('ride_logs')
        .delete()
        .eq('vehicle_license_plate', uniquePlate);

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
testRideSync();