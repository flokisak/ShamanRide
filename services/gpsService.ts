/**
 * Service for fetching real-time GPS positions from Lokatory GPS API.
 */

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
 * Fetches current GPS positions of all vehicles via local server proxy.
 */
export async function fetchVehiclePositions(): Promise<GpsVehicle[]> {
    try {
        const response = await fetch('/api/gps-vehicles', {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            },
        });

        if (!response.ok) {
            throw new Error(`GPS API error: ${response.status}`);
        }

        const data = await response.json();
        // Assume the API returns an array of vehicles with id, name, lat, lon, etc.
        return data.map((vehicle: any) => ({
            id: vehicle.id || vehicle.vehicleId,
            name: vehicle.name || vehicle.vehicleName,
            lat: parseFloat(vehicle.lat),
            lon: parseFloat(vehicle.lon),
            lastUpdate: vehicle.lastUpdate || new Date().toISOString(),
            speed: vehicle.speed ? parseFloat(vehicle.speed) : undefined,
            status: vehicle.status,
        }));
    } catch (error) {
        console.error('Error fetching vehicle positions:', error);
        return [];
    }
}

/**
 * Monitors API rate limits (based on provided example).
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
        try {
            const response = await fetch(`${GPS_API_BASE}/limits`, {
                method: 'GET',
                headers: {
                    'Authorization': 'Basic ' + btoa('5186800:Hustopece2024'),
                },
            });
            if (response.ok) {
                const data = await response.json();
                this.currentLimit = data.remaining || 0;
                this.renewIn = data.resetIn || 0;
            }
        } catch (error) {
            console.error('Error checking API limits:', error);
        }
    }
}

export const restClient = new RestClient();