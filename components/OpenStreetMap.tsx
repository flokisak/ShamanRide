import React, { useState, useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, useMap, Popup } from 'react-leaflet';
import L from 'leaflet';
import type { Vehicle, AssignmentResultData, Person } from '../types';
import { VehicleType } from '../types';
import { useTranslation } from '../contexts/LanguageContext';
import { fetchVehiclePositions, GpsVehicle } from '../services/gpsService';

// Fix for default icon path issue with bundlers
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import iconRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import iconUrl from 'leaflet/dist/images/marker-icon.png';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import shadowUrl from 'leaflet/dist/images/marker-shadow.png';

L.Icon.Default.mergeOptions({
  iconRetinaUrl,
  iconUrl,
  shadowUrl,
});


interface OpenStreetMapProps {
    vehicles: Vehicle[];
    people: Person[];
    routeToPreview: string[] | null;
    confirmedAssignment: AssignmentResultData | null;
}

type Coords = [number, number]; // [lat, lon]
type RouteSummary = { distance: string; duration: string; price?: number };

// --- Caching and API helpers ---
const geocodeCache = new Map<string, Coords>();
const SOUTH_MORAVIA_VIEWBOX = '16.3,48.7,17.2,49.3'; // lon_min,lat_min,lon_max,lat_max

const generateColorForVehicle = (vehicleId: number): string => {
  const hue = (vehicleId * 137.5) % 360; // Use golden angle approximation for good distribution
  return `hsl(${hue}, 50%, 55%)`; // Reduced saturation and slightly darker lightness for more muted colors
};


async function geocodeWithGoogle(address: string): Promise<Coords> {
    const apiKey = import.meta.env.VITE_GOOGLE_API_KEY;
    if (!apiKey) {
        throw new Error('Google API key not found');
    }
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${apiKey}`;
    const response = await fetch(url);
    const data = await response.json();
    if (data.status === 'OK' && data.results.length > 0) {
        const loc = data.results[0].geometry.location;
        return [loc.lat, loc.lng];
    }
    throw new Error(`Google geocoding failed: ${data.status}`);
}

async function geocodeAddress(address: string, lang: string): Promise<Coords> {
    const cacheKey = `${address}_${lang}`;
    if (geocodeCache.has(cacheKey)) return geocodeCache.get(cacheKey)!;

    const fetchCoords = async (addrToTry: string): Promise<Coords | null> => {
        const nominatimUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(addrToTry)}&countrycodes=cz&viewbox=${SOUTH_MORAVIA_VIEWBOX}&bounded=1&accept-language=${lang},en;q=0.5&limit=1`;
        const response = await fetch(nominatimUrl, { headers: { 'User-Agent': 'RapidDispatchAI/1.0' } });
        if (!response.ok) return null;
        const data = await response.json();
        return data?.[0] ? [parseFloat(data[0].lat), parseFloat(data[0].lon)] : null;
    };

    try {
        let result = await fetchCoords(address);
        if (!result) {
            const city = address.split(',').map(p => p.trim()).pop();
            if (city && city.toLowerCase() !== address.toLowerCase()) {
                result = await fetchCoords(city);
            }
        }
        if (result) {
            geocodeCache.set(cacheKey, result);
            return result;
        }
        // Fallback to Google Maps if OSM doesn't find the address
        const googleResult = await geocodeWithGoogle(address);
        geocodeCache.set(cacheKey, googleResult);
        return googleResult;
    } catch (error) {
          console.error(`Could not geocode address for map: ${address}`, error);
          throw error;
    }
}


async function getRoute(waypoints: Coords[]): Promise<{geometry: Coords[], summary: RouteSummary} | null> {
    if (waypoints.length < 2) return null;
    const coordsString = waypoints.map(c => `${c[1]},${c[0]}`).join(';');
    const url = `https://router.project-osrm.org/route/v1/driving/${coordsString}?overview=full&geometries=geojson`;
    const response = await fetch(url);
    const data = await response.json();
    if (data.code === 'Ok' && data.routes?.length > 0) {
        const route = data.routes[0];
        const geometry = route.geometry.coordinates.map((c: number[]) => [c[1], c[0]]); // Swap lon,lat to lat,lon
        const summary = {
            distance: `${(route.distance / 1000).toFixed(1)} km`,
            duration: `${Math.round(route.duration / 60)} min`
        };
        return { geometry, summary };
    }
    return null;
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


const VehicleMarker: React.FC<{ vehicle: Vehicle, people: Person[], gpsPosition?: GpsVehicle }> = ({ vehicle, people, gpsPosition }) => {
    const { t, language } = useTranslation();
    const [position, setPosition] = useState<Coords | null>(null);
    const driver = people.find(p => p.id === vehicle.driverId);

    useEffect(() => {
        if (gpsPosition) {
            setPosition([gpsPosition.lat, gpsPosition.lon]);
        } else {
            geocodeAddress(vehicle.location, language)
                .then(setPosition)
                .catch(err => console.error(err));
        }
    }, [vehicle.location, language, gpsPosition]);
    
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
    
    if (!position) return null;
    return (
        <Marker position={position} icon={customIcon}>
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
    return <Polyline positions={routeGeometry} color="#15803d" weight={6} opacity={0.9} dashArray={[10, 5]} />;
};


// --- Main Map Component ---
export const OpenStreetMap: React.FC<OpenStreetMapProps> = ({ vehicles, people, routeToPreview, confirmedAssignment }) => {
    const { t } = useTranslation();
    const [routeSummary, setRouteSummary] = useState<RouteSummary | null>(null);
    const [isMaximized, setIsMaximized] = useState(false);
    const [gpsPositions, setGpsPositions] = useState<GpsVehicle[]>([]);
    const [flyToCoords, setFlyToCoords] = useState<Coords | null>(null);
    const center: Coords = useMemo(() => [48.85, 16.63], []); // Mikulov/Hustopeče area

    // Fetch GPS positions periodically
    // useEffect(() => {
    //     const fetchGps = async () => {
    //         try {
    //             const positions = await fetchVehiclePositions();
    //             setGpsPositions(positions);
    //         } catch (error) {
    //             console.error('Failed to fetch GPS positions:', error);
    //         }
    //     };

    //     fetchGps(); // Initial fetch
    //     const interval = setInterval(fetchGps, 30000); // Update every 30 seconds
    //     return () => clearInterval(interval);
    // }, []);

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
                        <TileLayer
                            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                        />
                         {vehicles.map(v => {
                             const gpsPos = gpsPositions.find(g => g.id === v.id.toString() || g.name === v.name);
                             return <VehicleMarker key={v.id} vehicle={v} people={people} gpsPosition={gpsPos} />;
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
                    <TileLayer
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />
                     {vehicles.map(v => {
                         const gpsPos = gpsPositions.find(g => g.id === v.id.toString() || g.name === v.name);
                         return <VehicleMarker key={v.id} vehicle={v} people={people} gpsPosition={gpsPos} />;
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
                    </div>
                )}
            </div>
        </div>
    );
};
