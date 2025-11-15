import { supabase, supabaseService } from '../supabaseClient';

// Driver app specific sync helpers - simplified version without socket dependencies
export async function persistRide(rideData: any) {
  try {
    // For driver app, use supabaseService which properly maps camelCase to snake_case
    await supabaseService.addRideLog(rideData);
    return { via: 'supabase', data: rideData };
  } catch (err) {
    console.error('Error persisting ride in driver app:', err);
    return { via: 'failed', error: err };
  }
}

export async function updateVehicles(updatedVehicles: any[], options?: any) {
  try {
    // For driver app, update vehicle status and shift-related fields
    for (const vehicle of updatedVehicles) {
      const updateData: any = {};

      // Add fields that are present in the vehicle object
      if (vehicle.status !== undefined) updateData.vehicle_status = vehicle.status;
      if (vehicle.location !== undefined) updateData.location = vehicle.location;
      if (vehicle.mileage !== undefined) updateData.mileage = vehicle.mileage;
      if (vehicle.shiftStart !== undefined) updateData.shift_start = vehicle.shiftStart;
      if (vehicle.shiftEnd !== undefined) updateData.shift_end = vehicle.shiftEnd;
      if (vehicle.shiftStartOdo !== undefined) updateData.shift_start_odo = vehicle.shiftStartOdo;
      if (vehicle.shiftEndOdo !== undefined) updateData.shift_end_odo = vehicle.shiftEndOdo;

      console.log(`Updating vehicle ${vehicle.id} with data:`, updateData);

      const { error } = await supabase
        .from('vehicles')
        .update(updateData)
        .eq('id', vehicle.id);

      if (error) {
        console.error(`Failed to update vehicle ${vehicle.id}:`, error);
      } else {
        console.log(`Successfully updated vehicle ${vehicle.id}`);
      }
    }

    return { via: 'supabase' };
  } catch (err) {
    console.error('Error updating vehicles in driver app:', err);
    return { via: 'failed', error: err };
  }
}