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
    try {
        // Get recent locations (last 5 minutes) with vehicle information
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

        const { data: locations, error } = await supabase
            .from('locations')
            .select(`
                vehicle_id,
                latitude,
                longitude,
                timestamp,
                vehicles(id, name, status)
            `)
            .gte('timestamp', fiveMinutesAgo)
            .order('timestamp', { ascending: false });

        if (error) {
            console.error('Error fetching locations from Supabase:', error);
            return [];
        }

        if (!locations || locations.length === 0) {
            console.log('No recent locations found in Supabase');
            return [];
        }

        // Group by driver_id and get the most recent location for each vehicle
        const vehiclePositions = new Map<string, GpsVehicle>();

        locations.forEach((location: any) => {
            const vehicleId = location.vehicle_id;
            const vehicle = location.vehicles;

            if (!vehiclePositions.has(vehicleId) || new Date(location.timestamp) > new Date(vehiclePositions.get(vehicleId)!.lastUpdate)) {
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
