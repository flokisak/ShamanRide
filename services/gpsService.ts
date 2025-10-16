/**
 * Service for fetching real-time GPS positions from Supabase locations table.
 */

import { supabase } from './supabaseClient';

export interface GpsVehicle {
    id: string;
    name: string;
    lat: number;
    lon: number;
    lastUpdate: string;
    speed?: number;
    status?: string;
}

/**
 * Fetches current GPS positions of all vehicles from Supabase locations table.
 */
export async function fetchVehiclePositions(): Promise<GpsVehicle[]> {
  if (!SUPABASE_ENABLED) {
    return [];
  }

  try {
    const { data, error } = await supabase
      .from('locations')
      .select('*')
      .order('timestamp', { ascending: false })
      .limit(100);

    if (error) {
      console.warn('Could not fetch locations from Supabase:', error);
      return [];
    }

    if (!data || data.length === 0) {
      return [];
    }

    // Group by vehicle_id and take the most recent location for each
    const vehicleMap = new Map<number, any>();
    for (const location of data) {
      if (!vehicleMap.has(location.vehicle_id)) {
        vehicleMap.set(location.vehicle_id, location);
      }
    }

    return Array.from(vehicleMap.values()).map((loc: any) => ({
      id: loc.vehicle_id.toString(),
      name: loc.vehicle_name || `Vehicle ${loc.vehicle_id}`,
      lat: loc.lat,
      lon: loc.lon,
    }));
  } catch (err) {
    console.warn('Error fetching vehicle positions:', err);
    return [];
  }
}

        if (!locations || locations.length === 0) {
            console.log('No recent locations found in Supabase');
            return [];
        }

        // Get unique vehicle IDs
        const vehicleIds = [...new Set(locations.map(loc => loc.vehicle_id))];

        // Get vehicle information
        const { data: vehicles, error: vehiclesError } = await supabase
            .from('vehicles')
            .select('id, name, status')
            .in('id', vehicleIds);

        if (vehiclesError) {
            console.error('Error fetching vehicles from Supabase:', vehiclesError);
            return [];
        }

        // Create vehicle lookup map
        const vehicleMap = new Map((vehicles as any[])?.map((v: any) => [v.id, v]) || []);

        // Group by vehicle_id and get the most recent location for each vehicle
        const vehiclePositions = new Map<string, GpsVehicle>();

        locations.forEach((location: any) => {
            const vehicleId = location.vehicle_id;
            const vehicle = vehicleMap.get(vehicleId);

            if (vehicle && (!vehiclePositions.has(vehicleId) || new Date(location.timestamp) > new Date(vehiclePositions.get(vehicleId)!.lastUpdate))) {
                vehiclePositions.set(vehicleId, {
                    id: vehicle.id.toString(),
                    name: vehicle.name,
                    lat: location.latitude,
                    lon: location.longitude,
                    lastUpdate: location.timestamp,
                    status: vehicle.status,
                });
            }
        });

        const result = Array.from(vehiclePositions.values());
        console.log(`Fetched ${result.length} vehicle positions from Supabase`);
        return result;

    } catch (error) {
        console.error('Error fetching vehicle positions:', error);
        return [];
    }
}

/**
 * Legacy code for external GPS API - kept for reference but not used.
 * Current implementation uses Supabase locations table.
 */
class RestClient {
    currentLimit: number = 0;
    renewIn: number = 0;
    renewInLocal: number = 0;
    loadCurrent: number = 0;
    loadStable: number = 100; // Assume stable load

    handleLoad() {
        // Implement load calculation if needed
        this.loadCurrent = Math.random() * 100; // Placeholder
    }

    async checkLimits() {
        // Not used in current implementation
        console.log('GPS API limits check not implemented for Supabase');
    }
}

export const restClient = new RestClient();
