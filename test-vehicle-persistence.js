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

async function testVehiclePersistence() {
  console.log('Testing vehicle persistence...');

  try {
    // Test 1: Create a test vehicle
    const testVehicle = {
      id: 999999, // Use a high ID to avoid conflicts
      name: 'Test Vehicle',
      license_plate: 'TEST123',
      type: 'car',
      status: 'available',
      location: 'Test Location',
      capacity: 4,
      mileage: 10000,
      service_interval: 15000,
      last_service_mileage: 5000,
      technical_inspection_expiry: '2025-12-31',
      vignette_expiry: '2025-12-31',
      fuel_type: 'Petrol',
      fuel_consumption: 8.5,
      phone: '+420123456789',
      email: 'test@example.com'
    };

    console.log('\nTest 1: Creating test vehicle');
    const { data: vehicleData, error: vehicleError } = await supabase
      .from('vehicles')
      .upsert(testVehicle, { onConflict: 'id' })
      .select();

    if (vehicleError) {
      console.error('❌ Failed to create vehicle:', vehicleError);
      return;
    } else {
      console.log('✅ Vehicle created successfully:', vehicleData);
    }

    // Test 2: Update vehicle (simulate driver assignment and mileage update)
    const updatedVehicle = {
      ...testVehicle,
      driver_id: 1, // Assign to first driver
      mileage: 10500, // Update mileage
      status: 'busy'
    };

    console.log('\nTest 2: Updating vehicle (driver assignment and mileage)');
    const { data: updatedData, error: updateError } = await supabase
      .from('vehicles')
      .upsert(updatedVehicle, { onConflict: 'id' })
      .select();

    if (updateError) {
      console.error('❌ Failed to update vehicle:', updateError);
      return;
    } else {
      console.log('✅ Vehicle updated successfully:', updatedData);

      // Verify the changes persisted
      const driverAssigned = updatedData[0].driver_id === 1;
      const mileageUpdated = updatedData[0].mileage === 10500;
      const statusUpdated = updatedData[0].status === 'busy';

      if (driverAssigned && mileageUpdated && statusUpdated) {
        console.log('✅ All changes persisted correctly');
      } else {
        console.log('❌ Some changes did not persist:', {
          driverAssigned,
          mileageUpdated,
          statusUpdated
        });
      }
    }

    // Test 3: Clean up test data
    console.log('\nTest 3: Cleaning up test data');
    const { error: deleteError } = await supabase
      .from('vehicles')
      .delete()
      .eq('id', testVehicle.id);

    if (deleteError) {
      console.error('❌ Failed to clean up test data:', deleteError);
    } else {
      console.log('✅ Test data cleaned up successfully');
    }

  } catch (err) {
    console.error('❌ Unexpected error:', err);
  }
}

// Run the test
testVehiclePersistence();