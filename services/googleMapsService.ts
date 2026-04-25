import { Loader } from '@googlemaps/js-api-loader';

let googleMaps: typeof google.maps | null = null;
let loadPromise: Promise<typeof google.maps> | null = null;

async function loadGoogleMaps(): Promise<typeof google.maps> {
  if (googleMaps) return googleMaps;
  if (loadPromise) return loadPromise;

  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    throw new Error('Google Maps API key not configured. Please set VITE_GOOGLE_MAPS_API_KEY in your environment.');
  }

  loadPromise = (new Loader({
    apiKey,
    version: 'weekly',
    libraries: ['geometry']
  }) as any).load();

  googleMaps = await loadPromise;
  return googleMaps;
}

export interface RouteResult {
  geometry: [number, number][]; // [lat, lng][]
  summary: {
    distance: string;
    duration: string;
    distanceMeters?: number;
    durationSeconds?: number;
  };
}

export async function getGoogleMapsRoute(waypoints: [number, number][]): Promise<RouteResult | null> {
  if (waypoints.length < 2) return null;

  try {
    const maps = await loadGoogleMaps();
    const directionsService = new maps.DirectionsService();

    // Convert waypoints to Google Maps LatLng objects
    const origin = new maps.LatLng(waypoints[0][0], waypoints[0][1]);
    const destination = new maps.LatLng(waypoints[waypoints.length - 1][0], waypoints[waypoints.length - 1][1]);

    // Handle intermediate waypoints
    const waypointsGoogle: google.maps.LatLng[] = [];
    if (waypoints.length > 2) {
      for (let i = 1; i < waypoints.length - 1; i++) {
        waypointsGoogle.push(new maps.LatLng(waypoints[i][0], waypoints[i][1]));
      }
    }

    const request: google.maps.DirectionsRequest = {
      origin,
      destination,
      waypoints: waypointsGoogle.map(wp => ({ location: wp, stopover: true })),
      travelMode: google.maps.TravelMode.DRIVING,
      optimizeWaypoints: false,
      avoidHighways: false,
      avoidTolls: false,
    };

    return new Promise((resolve, reject) => {
      directionsService.route(request, (result: google.maps.DirectionsResult | null, status: google.maps.DirectionsStatus) => {
        if (status === google.maps.DirectionsStatus.OK && result) {
          const route = result.routes[0];
          if (route && route.overview_path) {
            // Convert Google Maps path to our format [lat, lng][]
            const geometry: [number, number][] = route.overview_path.map((point: google.maps.LatLng) => [
              point.lat(),
              point.lng()
            ]);

            const totalDistance = result.routes[0].legs.reduce((sum: number, leg: google.maps.DirectionsLeg) => sum + (leg.distance?.value || 0), 0);
            const totalDuration = result.routes[0].legs.reduce((sum: number, leg: google.maps.DirectionsLeg) => sum + (leg.duration?.value || 0), 0);

            const summary = {
              distance: `${(totalDistance / 1000).toFixed(1)} km`,
              duration: `${Math.round(totalDuration / 60)} min`,
              distanceMeters: totalDistance,
              durationSeconds: totalDuration
            };

            resolve({ geometry, summary });
          } else {
            reject(new Error('No route found'));
          }
        } else {
          reject(new Error(`Google Maps Directions API error: ${status}`));
        }
      });
    });
  } catch (error) {
    console.error('Google Maps routing error:', error);
    throw error;
  }
}

export function isGoogleMapsConfigured(): boolean {
  return !!import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
}
