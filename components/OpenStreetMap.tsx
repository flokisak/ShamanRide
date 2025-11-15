import React, { useState, useEffect, useMemo, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, useMap, Popup } from 'react-leaflet';
import L from 'leaflet';
import type { Vehicle, AssignmentResultData, Person } from '../types';
import { useTranslation } from '../contexts/LanguageContext';
import { fetchVehiclePositions, GpsVehicle } from '../services/gpsService';
import { splitAddressAndPlaceId } from '../services/addressUtils';

// Polyline decoding function for Google Maps
function decodePolyline(encoded: string): [number, number][] {
  const poly: [number, number][] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let b;
    let shift = 0;
    let result = 0;

    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);

    const dlat = ((result & 1) ? ~(result >> 1) : (result >> 1));
    lat += dlat;

    shift = 0;
    result = 0;

    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);

    const dlng = ((result & 1) ? ~(result >> 1) : (result >> 1));
    lng += dlng;

    poly.push([lat * 1e-5, lng * 1e-5]); // Convert to [lat, lng]
  }

  return poly;
}

// Fix for default icon path issue with bundlers
// @ts-ignore - _getIconUrl is an internal property that may not be in types
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});


interface OpenStreetMapProps {
    vehicles: Vehicle[];
    people: Person[];
    locations: Record<string, {latitude: number; longitude: number; timestamp: string}> | null;
    routeToPreview: string[] | null;
    confirmedAssignment: AssignmentResultData | null;
}

type Coords = [number, number]; // [lat, lon]
type RouteSummary = { distance: string; duration: string; price?: number; fallback?: boolean };

// --- Caching and API helpers ---
const geocodeCache = new Map<string, Coords>();
const routeCache = new Map<string, {geometry: Coords[], summary: RouteSummary}>();
const EXPANDED_VIEWBOX = '12.0,46.0,24.0,52.0'; // lon_min,lat_min,lon_max,lat_max

const generateColorForVehicle = (vehicleId: number): string => {
  const hue = (vehicleId * 137.5) % 360; // Use golden angle approximation for good distribution
  return `hsl(${hue}, 50%, 55%)`; // Reduced saturation and slightly darker lightness for more muted colors
};




async function geocodeAddress(address: string, lang: string): Promise<Coords> {
    const cacheKey = `${address}_${lang}`;
    if (geocodeCache.has(cacheKey)) return geocodeCache.get(cacheKey)!;

    const fetchNominatimCoords = async (addrToTry: string): Promise<Coords | null> => {
        const { text: addr } = splitAddressAndPlaceId(addrToTry); // Strip placeId if present

        const nominatimUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(addr)}&countrycodes=cz&viewbox=${EXPANDED_VIEWBOX}&accept-language=${lang},en;q=0.5&limit=10`;

        const response = await fetch(nominatimUrl, { headers: { 'User-Agent': 'RapidDispatchAI/1.0' } });
        if (!response.ok) return null;
        const data = await response.json();
        if (data && Array.isArray(data) && data.length > 0) {
            // First priority: results within South Moravia bounds
            for (const result of data) {
                const lat = parseFloat(result.lat);
                const lon = parseFloat(result.lon);
                if (lon >= 16.3 && lon <= 17.2 && lat >= 48.7 && lat <= 49.3) {
                    return [lat, lon];
                }
            }
            // Second priority: results within Czech Republic
            for (const result of data) {
                const lat = parseFloat(result.lat);
                const lon = parseFloat(result.lon);
                if (lon >= 12.0 && lon <= 18.9 && lat >= 48.5 && lat <= 51.1) {
                    return [lat, lon];
                }
            }
            // Third priority: any result
            const result = data[0];
            return [parseFloat(result.lat), parseFloat(result.lon)];
        }
        return null;
    };

    const fetchPhotonCoords = async (addrToTry: string): Promise<Coords | null> => {
        const { text: addr } = splitAddressAndPlaceId(addrToTry);
        const photonUrl = `https://photon.komoot.io/api/?q=${encodeURIComponent(addr)}&limit=10&bbox=12.0,46.0,24.0,52.0`;
        const response = await fetch(photonUrl);
        if (!response.ok) return null;
        const data = await response.json();
        if (data && data.features && Array.isArray(data.features) && data.features.length > 0) {
            // First priority: results within South Moravia bounds
            for (const feature of data.features) {
                const coords = feature.geometry.coordinates;
                const lon = coords[0];
                const lat = coords[1];
                if (lon >= 16.3 && lon <= 17.2 && lat >= 48.7 && lat <= 49.3) {
                    return [lat, lon];
                }
            }
            // Second priority: results within Czech Republic
            for (const feature of data.features) {
                const coords = feature.geometry.coordinates;
                const lon = coords[0];
                const lat = coords[1];
                if (lon >= 12.0 && lon <= 18.9 && lat >= 48.5 && lat <= 51.1) {
                    return [lat, lon];
                }
            }
            // Third priority: any result within expanded bounds
            const coords = data.features[0].geometry.coordinates;
            return [coords[1], coords[0]];
        }
        return null;
    };

    try {
        // Try Photon first (no rate limit)
        let result = await fetchPhotonCoords(address);
        if (!result) {
            // Fallback to Nominatim
            result = await fetchNominatimCoords(address);
        }
        if (!result) {
            const city = address.split(',').map(p => p.trim()).pop();
            if (city && city.toLowerCase() !== address.toLowerCase()) {
                result = await fetchPhotonCoords(city);
                if (!result) {
                    result = await fetchNominatimCoords(city);
                }
            }
        }
        if (result) {
            geocodeCache.set(cacheKey, result);
            return result;
        }
        throw new Error(`Address not found: ${address}`);
    } catch (error) {
           console.error(`Could not geocode address for map: ${address}`, error);
           throw error;
    }
}

// Haversine distance calculation
function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Radius of the Earth in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

async function getRoute(waypoints: Coords[]): Promise<{geometry: Coords[], summary: RouteSummary} | null> {
    if (waypoints.length < 2) return null;

    // Create cache key from waypoints
    const cacheKey = waypoints.map(w => `${w[0]},${w[1]}`).join(';');

    // Check cache first
    const cached = routeCache.get(cacheKey);
    if (cached) {
        console.log('🔄 Using cached route for:', cacheKey);
        return cached;
    }

    console.log('🌐 Calculating route for:', cacheKey);

    // Try Google Maps API directly
    const googleMapsApiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
    if (googleMapsApiKey) {
      try {
        console.log('Trying Google Maps routing...');
        const origin = `${waypoints[0][0]},${waypoints[0][1]}`;
        const destination = `${waypoints[waypoints.length - 1][0]},${waypoints[waypoints.length - 1][1]}`;
        let waypointsParam = '';
        if (waypoints.length > 2) {
          const intermediate = waypoints.slice(1, -1).map(w => `${w[0]},${w[1]}`).join('|');
          waypointsParam = `&waypoints=${intermediate}`;
        }
        const googleUrl = `https://maps.googleapis.com/maps/api/directions/json?origin=${origin}&destination=${destination}${waypointsParam}&mode=driving&key=${googleMapsApiKey}`;
        const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(googleUrl)}`;
        const googleResponse = await fetch(proxyUrl);

        if (googleResponse.ok) {
          const proxyData = await googleResponse.json();
          const googleData = JSON.parse(proxyData.contents);
          if (googleData.status === 'OK' && googleData.routes && googleData.routes.length > 0) {
            const route = googleData.routes[0];
            const geometry = decodePolyline(route.overview_polyline.points);
            const totalDistance = route.legs.reduce((sum: number, leg: any) => sum + leg.distance.value, 0);
            const totalDuration = route.legs.reduce((sum: number, leg: any) => sum + leg.duration.value, 0);
            const summary = {
              distance: `${(totalDistance / 1000).toFixed(1)} km`,
              duration: `${Math.round(totalDuration / 60)} min`
            };
            const result = { geometry, summary };
            routeCache.set(cacheKey, result);
            setTimeout(() => routeCache.delete(cacheKey), 10 * 60 * 1000);
            return result;
          }
        }
        console.log('Google Maps routing failed');
      } catch (error) {
        console.log('Google Maps routing error:', error);
      }
    }

    try {
        const coordsString = waypoints.map(c => `${c[1]},${c[0]}`).join(';');
        const url = `/api/route?coordinates=${encodeURIComponent(coordsString)}`;
        const response = await fetch(url);

        if (!response.ok) {
            console.log(`Routing API returned ${response.status}, trying multiple routing services...`);
            // Skip to fallback calculation below
        } else {
            const data = await response.json();

        // Check if we got a fallback response from server
        if (data.fallback) {
            console.log('All routing services unavailable, using local fallback calculation');
            // Skip to fallback calculation below
        } else if (data.code === 'Ok' && data.routes?.length > 0) {
                const route = data.routes[0];
                // Check if geometry and coordinates exist
                if (route.geometry && route.geometry.coordinates && Array.isArray(route.geometry.coordinates)) {
                    // Server returns coordinates as [lat, lng] for Leaflet
                    const geometry = route.geometry.coordinates;
                    const summary = {
                        distance: `${(route.distance / 1000).toFixed(1)} km`,
                        duration: `${Math.round(route.duration / 60)} min`
                    };
                    const result = { geometry, summary };
                    // Cache successful results for 10 minutes
                    routeCache.set(cacheKey, result);
                    setTimeout(() => routeCache.delete(cacheKey), 10 * 60 * 1000);
                    return result;
                }
            }
        }
    } catch (error) {
        console.log('Network error occurred, using fallback calculation:', error.message);
    }

    // Fallback: improved routing calculation using road-like paths
    console.log('Using improved fallback routing calculation');

    // Create a more realistic route by adding intermediate waypoints for longer distances
    const enhancedWaypoints = [];
    for (let i = 0; i < waypoints.length - 1; i++) {
        const start = waypoints[i];
        const end = waypoints[i + 1];
        const distance = haversineDistance(start[0], start[1], end[0], end[1]);

        enhancedWaypoints.push(start);

        // For distances over 5km, add intermediate points to simulate road curvature
        if (distance > 5) {
            const numIntermediates = Math.min(Math.floor(distance / 2), 10); // More intermediates
            for (let j = 1; j <= numIntermediates; j++) {
                const ratio = j / (numIntermediates + 1);
                const lat = start[0] + (end[0] - start[0]) * ratio;
                const lon = start[1] + (end[1] - start[1]) * ratio;
                // Add random variation to simulate road curvature (±1km)
                const variation = 0.01; // ~1km in degrees
                enhancedWaypoints.push([
                    lat + (Math.random() - 0.5) * variation,
                    lon + (Math.random() - 0.5) * variation
                ]);
            }
        }
    }
    enhancedWaypoints.push(waypoints[waypoints.length - 1]);

    let totalDistance = 0;
    for (let i = 1; i < enhancedWaypoints.length; i++) {
        totalDistance += haversineDistance(
            enhancedWaypoints[i-1][0], enhancedWaypoints[i-1][1],
            enhancedWaypoints[i][0], enhancedWaypoints[i][1]
        );
    }

    // More realistic speed estimation based on distance
    // City driving: ~25 km/h, Highway: ~80 km/h, mix for longer distances
    let avgSpeed;
    if (totalDistance < 5) {
        avgSpeed = 25; // City driving
    } else if (totalDistance < 20) {
        avgSpeed = 40; // Mixed city/highway
    } else {
        avgSpeed = 60; // Mostly highway
    }

    const estimatedDuration = Math.round((totalDistance / avgSpeed) * 60);

    const result = {
        geometry: enhancedWaypoints,
        summary: {
            distance: `${totalDistance.toFixed(1)} km`,
            duration: `${estimatedDuration} min`,
            fallback: true // Mark this as fallback routing
        }
    };

    // Cache fallback results too (shorter cache time)
    routeCache.set(cacheKey, result);
    setTimeout(() => routeCache.delete(cacheKey), 5 * 60 * 1000); // 5 minutes for fallback

    return result;
}

// --- Internal Map Components ---
const MapResizeController: React.FC = () => {
    const map = useMap();
    useEffect(() => {
        const timer = setTimeout(() => map.invalidateSize(), 100);
        return () => clearTimeout(timer);
    }, [map]);
    return null;
};


const VehicleMarker: React.FC<{ vehicle: Vehicle, people: Person[], gpsPosition?: GpsVehicle, lastLocation?: {latitude: number; longitude: number; timestamp: string} }> = ({ vehicle, people, gpsPosition, lastLocation }) => {
    const { t, language } = useTranslation();
    const [position, setPosition] = useState<Coords | null>(null);
    const driver = people.find(p => p.id === vehicle.driverId);
    const markerRef = useRef<L.Marker | null>(null);

    useEffect(() => {
        // Always prioritize real-time GPS positions over any cached/stored locations
        if (gpsPosition) {
            setPosition([gpsPosition.lat, gpsPosition.lon]);
        } else if (lastLocation) {
            // Use last known location from ride data
            setPosition([lastLocation.latitude, lastLocation.longitude]);
        } else {
            // Only fall back to geocoded address, not ride destination data
            geocodeAddress(vehicle.location, language)
                .then(setPosition)
                .catch(err => console.error(err));
        }
    }, [vehicle.location, language, gpsPosition, lastLocation]);
    
    const color = generateColorForVehicle(vehicle.id);
    const driverFirstName = driver?.name ? driver.name.split(' ')[0] : '';
    const isGps = !!gpsPosition;


    const iconHtml = `
      <div class="custom-marker-content">
        <div class="marker-dot" style="background: ${color}"></div>
        <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="${color}" stroke="${color}" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">
          <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/>
          <circle cx="7" cy="17" r="2"/>
          <circle cx="17" cy="17" r="2"/>
          <path d="M9 17h6"/>
          <circle cx="12" cy="12" r="1" fill="white"/>
        </svg>
        ${driverFirstName ? `<span class="driver-name-label">${driverFirstName}</span>` : ''}
        ${isGps ? '<span class="gps-indicator">📍</span>' : ''}
      </div>
    `;

    const customIcon = new L.DivIcon({
        html: iconHtml,
        className: 'custom-vehicle-marker',
        iconSize: [40, 50],
        iconAnchor: [20, 20],
        popupAnchor: [0, -20]
    });

    useEffect(() => {
        if (markerRef.current) {
            markerRef.current.setIcon(customIcon);
        }
    }, [customIcon]);

    if (!position) return null;
    return (
        <Marker ref={markerRef} position={position}>
            <Popup>
                <div className="text-sm">
                    <p className="font-bold text-base">{vehicle.name}</p>
                    <p>{driver?.name || t('general.unassigned')}</p>
                    <p className="font-mono text-xs">{vehicle.licensePlate}</p>
                    {isGps && (
                        <p className="text-green-400 text-xs">GPS: {new Date(gpsPosition.lastUpdate).toLocaleTimeString()}</p>
                    )}
                </div>
            </Popup>
        </Marker>
    );
};

const MapFlyController: React.FC<{ flyToCoords: Coords | null }> = ({ flyToCoords }) => {
    const map = useMap();

    useEffect(() => {
        if (flyToCoords) {
            map.flyTo(flyToCoords, 15, { duration: 1.5 });
        }
    }, [flyToCoords, map]);

    return null;
};

const SearchControl: React.FC<{ onSearch: (coords: Coords) => void }> = ({ onSearch }) => {
    const { language } = useTranslation();
    const [searchQuery, setSearchQuery] = useState('');
    const [isSearching, setIsSearching] = useState(false);

    const handleSearch = async () => {
        if (!searchQuery.trim()) return;
        setIsSearching(true);
        try {
            const coords = await geocodeAddress(searchQuery, language);
            onSearch(coords);
        } catch (error) {
            console.error('Search failed:', error);
            // Could add toast notification here
        } finally {
            setIsSearching(false);
        }
    };

    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            handleSearch();
        }
    };

    return (
        <div className="flex items-center space-x-2 mb-2">
            <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Vyhledat adresu..."
                className="flex-1 bg-slate-700 border border-slate-600 rounded px-3 py-1 text-white text-sm placeholder-gray-400 focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
            />
            <button
                onClick={handleSearch}
                disabled={isSearching || !searchQuery.trim()}
                className="bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-600 text-white px-3 py-1 rounded text-sm transition-colors"
            >
                {isSearching ? '...' : '🔍'}
            </button>
        </div>
    );
};

const RouteDrawer: React.FC<{
    routeToPreview: OpenStreetMapProps['routeToPreview'];
    confirmedAssignment: OpenStreetMapProps['confirmedAssignment'];
    onRouteCalculated: (summary: RouteSummary | null) => void;
}> = ({ routeToPreview, confirmedAssignment, onRouteCalculated }) => {
    const { language } = useTranslation();
    const map = useMap();
    const [routeGeometry, setRouteGeometry] = useState<Coords[] | null>(null);

    useEffect(() => {
        let isMounted = true;
        const calculateAndDrawRoute = async (stops: string[]) => {
            try {
                const waypoints = await Promise.all(stops.map(stop => geocodeAddress(stop, language)));
                if (!isMounted || waypoints.length < 2) {
                    setRouteGeometry(null);
                    onRouteCalculated(null);
                    return;
                }

                const routeData = await getRoute(waypoints);
                if (isMounted && routeData?.geometry.length > 0) {
                    setRouteGeometry(routeData.geometry);
                    let summary = routeData.summary;
                    // Calculate basic price for preview or confirmed assignment
                    const distanceKm = parseFloat(routeData.summary.distance.replace(' km', ''));
                    const price = Math.round(distanceKm * 40 + 50); // basic estimate: distance * 40 + 50
                    summary = { ...summary, price };
                    onRouteCalculated(summary);
                    map.fitBounds(L.latLngBounds(routeData.geometry), { padding: [50, 50] });
                } else if (isMounted) {
                    setRouteGeometry(null);
                    onRouteCalculated(null);
                }
            } catch (err) {
                console.error("Failed to draw route:", err);
                if (isMounted) {
                    setRouteGeometry(null);
                    onRouteCalculated(null);
                }
            }
        };

        let stopsToDraw: string[] | null = null;
        if (confirmedAssignment) {
            const finalStops = confirmedAssignment.optimizedStops || confirmedAssignment.rideRequest.stops;
            stopsToDraw = [confirmedAssignment.vehicle.location, ...finalStops];
        } else if (routeToPreview && routeToPreview.length >= 2) {
            stopsToDraw = routeToPreview;
        }

        if (stopsToDraw) {
            calculateAndDrawRoute(stopsToDraw);
        } else {
            setRouteGeometry(null);
            onRouteCalculated(null);
        }

        return () => { isMounted = false; };
    }, [routeToPreview, confirmedAssignment, map, onRouteCalculated, language]);
    
    if (!routeGeometry) return null;
    return <Polyline positions={routeGeometry} pathOptions={{color: "#15803d", weight: 6, opacity: 0.9, dashArray: [10, 5]}} />;
};


// --- Main Map Component ---
export const OpenStreetMap: React.FC<OpenStreetMapProps> = ({ vehicles, people, locations, routeToPreview, confirmedAssignment }) => {
    const { t } = useTranslation();
    const [routeSummary, setRouteSummary] = useState<RouteSummary | null>(null);
    const [isMaximized, setIsMaximized] = useState(false);
    const [gpsPositions, setGpsPositions] = useState<GpsVehicle[]>([]);
    const [flyToCoords, setFlyToCoords] = useState<Coords | null>(null);
    const center: Coords = useMemo(() => [48.85, 16.63], []); // Mikulov/Hustopeče area

    const latestLocations = locations;

    // Fetch GPS positions periodically
    useEffect(() => {
        const fetchGps = async () => {
            try {
                const positions = await fetchVehiclePositions();
                setGpsPositions(positions);
                console.log('Updated GPS positions:', positions.length, 'vehicles');
            } catch (error) {
                console.error('Failed to fetch GPS positions:', error);
            }
        };

        fetchGps(); // Initial fetch
        const interval = setInterval(fetchGps, 15000); // Update every 15 seconds
        return () => clearInterval(interval);
    }, []);

    const toggleMaximize = () => {
        setIsMaximized(!isMaximized);
    };

    if (isMaximized) {
        return (
            <div className="fixed inset-0 z-[2000] bg-slate-800">
                <div className="absolute top-4 right-4 z-[2001]">
                    <button
                        onClick={toggleMaximize}
                        className="bg-slate-700 hover:bg-slate-600 text-white p-2 rounded-lg shadow-lg transition-colors"
                        aria-label="Zmenšit mapu"
                    >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
                <div className="w-full h-full">
                    <MapContainer center={center} zoom={11} className="w-full h-full" scrollWheelZoom={true}>
                        <MapResizeController />
                        <MapFlyController flyToCoords={flyToCoords} />
                        // @ts-expect-error
                        <TileLayer
                            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                        />
                       {vehicles.map(v => {
                             const gpsPos = gpsPositions.find(g => g.id === v.id.toString() || g.name === v.name);
                             const lastLoc = locations ? locations[v.id.toString()] : undefined;
                             return <VehicleMarker key={v.id} vehicle={v} people={people} gpsPosition={gpsPos} lastLocation={lastLoc} />;
                         })}

                        <RouteDrawer
                            routeToPreview={routeToPreview}
                            confirmedAssignment={confirmedAssignment}
                            onRouteCalculated={setRouteSummary}
                        />
                    </MapContainer>
                    {routeSummary && (
                        <div className="absolute bottom-4 left-4 bg-slate-900 p-3 rounded-lg text-white text-sm shadow-lg backdrop-blur-sm animate-fade-in z-[1000]">
                            <p><strong>{t('map.distance')}:</strong> {routeSummary.distance}</p>
                            <p><strong>{t('map.duration')}:</strong> {routeSummary.duration}</p>
                            {routeSummary.fallback && (
                                <p className="text-yellow-400 text-xs mt-1">⚠️ Estimated route (OSRM unavailable)</p>
                            )}
                        </div>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div className="bg-slate-800 p-2 rounded-lg shadow-2xl flex flex-col h-full">
            <SearchControl onSearch={setFlyToCoords} />
            <div className="flex-grow w-full rounded-lg bg-slate-700 overflow-hidden border border-slate-700 relative z-0">
                <MapContainer center={center} zoom={11} className="w-full h-full" scrollWheelZoom={true}>
                    <MapResizeController />
                    <MapFlyController flyToCoords={flyToCoords} />
                    // @ts-expect-error
                    <TileLayer
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />
                      {vehicles.map(v => {
                            const gpsPos = gpsPositions.find(g => g.id === v.id.toString() || g.name === v.name);
                            const lastLoc = locations ? locations[v.id.toString()] : undefined;
                            return <VehicleMarker key={v.id} vehicle={v} people={people} gpsPosition={gpsPos} lastLocation={lastLoc} />;
                        })}
                    <RouteDrawer
                        routeToPreview={routeToPreview}
                        confirmedAssignment={confirmedAssignment}
                        onRouteCalculated={setRouteSummary}
                    />
                </MapContainer>
                    {routeSummary && (
                        <div className="absolute bottom-4 left-4 bg-slate-900 p-3 rounded-lg text-white text-sm shadow-lg backdrop-blur-sm animate-fade-in z-[1000]">
                            <p><strong>{t('map.distance')}:</strong> {routeSummary.distance}</p>
                            <p><strong>{t('map.duration')}:</strong> {routeSummary.duration}</p>
                            {routeSummary.price && <p><strong>{t('rideLog.table.price')}:</strong> {routeSummary.price} Kč</p>}
                            {routeSummary.fallback && (
                                <p className="text-yellow-400 text-xs mt-1">⚠️ Estimated route (OSRM unavailable)</p>
                            )}
                        </div>
                    )}
            </div>
        </div>
    );
};
