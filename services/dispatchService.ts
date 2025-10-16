import type { RideRequest, Vehicle, AssignmentResultData, ErrorResult, AssignmentAlternative, Tariff, RideLog, FlatRateRule, MessagingApp } from '../types';
import { VehicleStatus, VehicleType, MessagingApp as AppType, RideType } from '../types';
import { supabaseService } from './supabaseClient';

const urlShortenCache = new Map<string, string>();

/**
 * Shortens a URL using the TinyURL API.
 * Falls back to the original URL if the API call fails.
 */
export async function shortenUrl(longUrl: string): Promise<string> {
    if (urlShortenCache.has(longUrl)) {
        return urlShortenCache.get(longUrl)!;
    }

    if (longUrl === 'https://maps.google.com' || !longUrl.startsWith('http')) {
        return longUrl;
    }

    try {
        // Using a CORS proxy to bypass browser restrictions on calling the TinyURL API directly.
        const proxyUrl = 'https://corsproxy.io/?';
        const apiUrl = `${proxyUrl}https://tinyurl.com/api-create.php?url=${encodeURIComponent(longUrl)}`;
        
        const response = await fetch(apiUrl);
        if (response.ok) {
            const shortUrl = await response.text();
            if (shortUrl.startsWith('http')) {
                urlShortenCache.set(longUrl, shortUrl);
                return shortUrl;
            }
        }
        console.warn('TinyURL API call failed or returned invalid response, returning original URL.');
        return longUrl;
    } catch (error) {
        console.error('Error shortening URL:', error);
        return longUrl; // Fallback to the original URL on error
    }
}

/**
 * Shortens an address to the first 3 parts separated by commas.
 */
function shortenAddress(address: string): string {
  return address.split(",").map(part => part.trim()).slice(0, 3).join(", ");
}

/**
 * Generates an SMS message for the driver in the selected language.
 */
export function generateWazeUrl(nav: string | undefined): string {
    if (!nav) return '';
    try {
        const u = new URL(nav);
        const dest = u.searchParams.get('destination');
        if (dest) {
            const coordMatch = dest.match(/(-?\d+\.\d+),\s*(-?\d+\.\d+)/);
            if (coordMatch) return `https://waze.com/ul?ll=${coordMatch[1]},${coordMatch[2]}&navigate=yes`;
        }
        const pathMatch = u.pathname.match(/(-?\d+\.\d+),(-?\d+\.\d+)/);
        if (pathMatch) return `https://waze.com/ul?ll=${pathMatch[1]},${pathMatch[2]}&navigate=yes`;
    } catch (err) {
        // ignore
    }
    return nav;
}

export function generateSms(ride: RideRequest | RideLog, t: (key: string, params?: any) => string, navigationUrl?: string, navPreferred: 'google' | 'waze' = 'google'): string {
  let formattedPickupTime = ride.pickupTime;
    // Normalize pickup time: accept 'ihned', 'ASAP', localized keys (e.g. 'sms.pickupASAP') or ISO timestamps
    if (typeof ride.pickupTime === 'string') {
        const pt = ride.pickupTime.trim();
        if (pt === 'ihned' || pt.toLowerCase() === 'asap' || pt.toLowerCase() === 'ihned') {
            formattedPickupTime = t('sms.pickupASAP');
        } else if (pt.startsWith('sms.')) {
            // If a localized key was stored accidentally, resolve it
            try { formattedPickupTime = t(pt); } catch { formattedPickupTime = pt; }
        } else if (!isNaN(new Date(pt).getTime())) {
            const date = new Date(pt);
            const hours = date.getHours().toString().padStart(2, '0');
            const minutes = date.getMinutes().toString().padStart(2, '0');
            formattedPickupTime = `${hours}:${minutes}`;
        }
    }

    // Build a concise stops line (no numbering unless needed)
    const stopsShort = ride.stops.map(s => shortenAddress(s));
    const stopsText = stopsShort.join(' \u2192 '); // arrow

    // If caller prefers Waze, convert navigation url first
    if (navigationUrl && navPreferred === 'waze') {
        navigationUrl = generateWazeUrl(navigationUrl);
    }

    // Helper to compress long navigation URLs for SMS (keep destination, hide long waypoints)
    const compressNavigationUrl = (url: string) => {
        try {
            const u = new URL(url);
            const dest = u.searchParams.get('destination');
            const waypoints = u.searchParams.get('waypoints');
                // Preserve api=1 and travelmode for a valid Google Maps directions link.
                if (dest) {
                    const preserved = new URL(u.origin + u.pathname);
                    preserved.searchParams.set('api', '1');
                    preserved.searchParams.set('destination', dest);
                    if (waypoints) {
                        // keep waypoints for proper navigation
                        preserved.searchParams.set('waypoints', waypoints);
                    }
                    // preserve travelmode if present, otherwise default to driving
                    const tm = u.searchParams.get('travelmode') || 'driving';
                    preserved.searchParams.set('travelmode', tm);
                    return preserved.toString();
                }
                return url;
        } catch {
            return url;
        }
    };

    const parts: string[] = [];
    parts.push(`${t('sms.route')}: ${stopsText}`);
    parts.push(`${ride.customerName} • ${ride.customerPhone} • ${ride.passengers} ${t('sms.passengers')}`);
    parts.push(`${t('sms.pickupTime')}: ${formattedPickupTime}`);

    if (ride.notes) parts.push(`${t('sms.note')}: ${ride.notes}`);

    let baseSms = parts.join('\n');

    if (navigationUrl && navigationUrl !== 'https://maps.google.com') {
        baseSms += `\n${t('sms.navigation')}: ${compressNavigationUrl(navigationUrl)}`;
    }

    return baseSms;
}

/**
 * Generates an SMS message for the customer after vehicle assignment.
 */
export function generateCustomerSms(vehicle: Vehicle, eta: number, driverName: string): string {
    const roundedEta = Math.round(eta);
    return `Vaše jízda byla přidělena. Vůz: ${vehicle.name} (${vehicle.licensePlate}). Řidič: ${driverName || 'Neznámý'}. Odhadovaný příjezd: ${roundedEta} min.`;
}

/**
 * Generates a shareable link for various messaging apps.
 */
export function generateShareLink(app: AppType, phone: string, text: string): string {
    const encodedText = encodeURIComponent(text);
    const cleanPhone = phone.replace(/\s/g, '');

    switch(app) {
        case AppType.WhatsApp:
            // The phone number needs to be in international format without '+' or '00' for wa.me links
            const internationalPhone = cleanPhone.startsWith('420') ? cleanPhone : `420${cleanPhone}`;
            return `https://wa.me/${internationalPhone}?text=${encodedText}`;
        case AppType.Telegram:
            // Telegram share link doesn't support phone numbers directly, it opens the share sheet.
            return `tg://share/url?text=${encodedText}`;
        case AppType.SMS:
        default:
            return `sms:${cleanPhone}?body=${encodedText}`;
    }
}

/**
 * Generates a Google Maps URL using the Directions API format (`?api=1`),
 * which is reliable for triggering the navigation mode in mobile apps with a clear "Start" button.
 * This format handles destination and multiple waypoints using coordinates.
 * Origin is omitted to use the driver's current location.
 */
export function generateNavigationUrl(
    driverLocationCoords: { lat: number; lon: number } | null,
    stopsCoords: { lat: number; lon: number }[],
    navApp: 'google' | 'waze' | 'mapy' = 'google'
): string {
    if (stopsCoords.length === 0) {
        if (navApp === 'waze') return 'https://waze.com';
        if (navApp === 'mapy') return 'https://mapy.cz';
        return 'https://maps.google.com';
    }

    if (navApp === 'waze') {
        const formatCoord = (coord: { lat: number; lon: number }) => `${coord.lat},${coord.lon}`;
        const origin = stopsCoords[0];
        const destination = stopsCoords[stopsCoords.length - 1];
        const waypoints = stopsCoords.slice(1, -1);

        let url = `https://waze.com/ul?ll=${formatCoord(destination)}&from=${formatCoord(origin)}&navigate=yes`;
        if (waypoints.length > 0) {
            url += `&via=${waypoints.map(formatCoord).join('|')}`;
        }
        return url;
    }

    if (navApp === 'mapy') {
        const formatCoord = (coord: { lat: number; lon: number }) => `${coord.lat},${coord.lon}`;
        const destination = stopsCoords[stopsCoords.length - 1];
        const waypoints = stopsCoords.slice(0, -1);

        // Mapy.cz uses a different URL format
        let url = `https://mapy.cz/zakladni?x=${destination.lon}&y=${destination.lat}&z=15`;
        if (waypoints.length > 0) {
            // Add waypoints as route points
            const routePoints = waypoints.map((wp, index) => `&rl${index + 1}=${wp.lon}%2C${wp.lat}`);
            url += routePoints.join('');
        }
        return url;
    }

    // Google Maps
    const formatCoord = (coord: { lat: number; lon: number }) => `${coord.lat},${coord.lon}`;

    const destination = formatCoord(stopsCoords[stopsCoords.length - 1]);
    const waypoints = stopsCoords.slice(0, -1).map(formatCoord);

    const params = new URLSearchParams();
    params.append('api', '1');
    params.append('destination', destination);

    if (waypoints.length > 0) {
        params.append('waypoints', waypoints.join('|'));
    }

    params.append('travelmode', 'driving');

    const baseUrl = 'https://www.google.com/maps/dir/';
    return `${baseUrl}?${params.toString()}`;
}


// Simple in-memory cache for geocoding results
const geocodeCache = new Map<string, { lat: number; lon: number }>();
// Bounding box for South Moravia to prioritize local search results
const SOUTH_MORAVIA_BOUNDS = { lonMin: 16.3, latMin: 48.7, lonMax: 17.2, latMax: 49.3 };
// Expanded bounds to include Czech Republic, Austria, Slovakia, and nearby areas
const EXPANDED_SEARCH_BOUNDS = { lonMin: 12.0, latMin: 46.0, lonMax: 24.0, latMax: 52.0 };

/**
 * Checks if coordinates are within South Moravia bounds.
 */
function isInSouthMoravia(lat: number, lon: number): boolean {
    return lon >= SOUTH_MORAVIA_BOUNDS.lonMin && lon <= SOUTH_MORAVIA_BOUNDS.lonMax &&
           lat >= SOUTH_MORAVIA_BOUNDS.latMin && lat <= SOUTH_MORAVIA_BOUNDS.latMax;
}

function isInCzechRepublic(lat: number, lon: number): boolean {
    // Approximate bounds for Czech Republic
    return lon >= 12.0 && lon <= 18.9 && lat >= 48.5 && lat <= 51.1;
}

/**
 * Converts an address to geographic coordinates using Google Maps Geocoding API.
 */
export async function geocodeAddress(address: string, language: string): Promise<{ lat: number; lon: number }> {
    // Clean up malformed addresses that might have timestamps or other data appended
    const cleanAddress = address.split('|')[0].trim();

    // Log if address was cleaned
    if (cleanAddress !== address) {
        console.warn('Cleaned malformed address:', address, '->', cleanAddress);
    }

    const cacheKey = `${cleanAddress}_${language}`;
    if (geocodeCache.has(cacheKey)) return geocodeCache.get(cacheKey)!;

    const googleMapsApiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
    if (!googleMapsApiKey) {
        console.warn('Google Maps API key not configured, falling back to Nominatim');
        // Fallback to Nominatim for now
        return await geocodeWithNominatim(cleanAddress);
    }

    try {
        const proxyUrl = 'https://corsproxy.io/?';
        const geocodingUrl = `${proxyUrl}https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(cleanAddress)}&key=${googleMapsApiKey}&language=${language}&region=cz&bounds=${SOUTH_MORAVIA_BOUNDS.latMin},${SOUTH_MORAVIA_BOUNDS.lonMin}|${SOUTH_MORAVIA_BOUNDS.latMax},${SOUTH_MORAVIA_BOUNDS.lonMax}`;

        const response = await fetch(geocodingUrl);
        if (!response.ok) {
            throw new Error(`Geocoding API error: ${response.status}`);
        }

        const data = await response.json();

        if (data.status === 'OK' && data.results && data.results.length > 0) {
            const result = data.results[0];
            const location = result.geometry.location;
            const coords = { lat: location.lat, lon: location.lng };

            geocodeCache.set(cacheKey, coords);
            return coords;
        } else {
            console.warn('Google Maps geocoding failed:', data.status, data.error_message);

            // Fallback to Nominatim
            return await geocodeWithNominatim(cleanAddress);
        }
    } catch (error) {
        console.error("Google Maps geocoding error:", error);
        // Fallback to Nominatim
        return await geocodeWithNominatim(cleanAddress);
    }
}

/**
 * Fallback geocoding using Nominatim (OpenStreetMap)
 */
async function geocodeWithNominatim(address: string): Promise<{ lat: number; lon: number }> {
    try {
        const proxyUrl = 'https://corsproxy.io/?';
        const nominatimUrl = `${proxyUrl}https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=10&countrycodes=cz&bounded=1&viewbox=${EXPANDED_SEARCH_BOUNDS.lonMin},${EXPANDED_SEARCH_BOUNDS.latMin},${EXPANDED_SEARCH_BOUNDS.lonMax},${EXPANDED_SEARCH_BOUNDS.latMax}`;

        const response = await fetch(nominatimUrl);
        if (!response.ok) throw new Error(`Nominatim API error: ${response.status}`);
        const data = await response.json();

        if (data && Array.isArray(data) && data.length > 0) {
            // First priority: results within South Moravia bounds
            for (const result of data) {
                const lat = parseFloat(result.lat);
                const lon = parseFloat(result.lon);
                if (isInSouthMoravia(lat, lon)) {
                    return { lat, lon };
                }
            }
            // Second priority: results within Czech Republic
            for (const result of data) {
                const lat = parseFloat(result.lat);
                const lon = parseFloat(result.lon);
                if (isInCzechRepublic(lat, lon)) {
                    return { lat, lon };
                }
            }
            // Third priority: any result
            const result = data[0];
            return { lat: parseFloat(result.lat), lon: parseFloat(result.lon) };
        }
        throw new Error(`Address not found: ${cleanAddress}`);
    } catch (error) {
        console.error("Nominatim geocoding error:", error);
        throw new Error(`Could not find coordinates for address: ${address}.`);
    }
}

// In-memory cache for suggestions to avoid repeated API calls for the same query
const suggestionsCache = new Map<string, {text: string, placeId?: string}[]>();

interface FrequentAddress {
    address: string;
    count: number;
    lastUsed: number;
}

const FREQUENT_ADDRESSES_KEY = 'frequentAddresses';

function getFrequentAddresses(): FrequentAddress[] {
    try {
        const stored = localStorage.getItem(FREQUENT_ADDRESSES_KEY);
        return stored ? JSON.parse(stored) : [];
    } catch {
        return [];
    }
}

function saveFrequentAddresses(addresses: FrequentAddress[]) {
    localStorage.setItem(FREQUENT_ADDRESSES_KEY, JSON.stringify(addresses));
}

export function updateFrequentAddress(address: string) {
    const addresses = getFrequentAddresses();
    const existing = addresses.find(a => a.address.toLowerCase() === address.toLowerCase());
    if (existing) {
        existing.count += 1;
        existing.lastUsed = Date.now();
    } else {
        addresses.push({ address, count: 1, lastUsed: Date.now() });
    }
    saveFrequentAddresses(addresses);
}

function getMatchingFrequentAddresses(query: string): string[] {
    const addresses = getFrequentAddresses();
    return addresses
        .filter(a => a.address.toLowerCase().includes(query.toLowerCase()))
        .sort((a, b) => b.count - a.count || b.lastUsed - a.lastUsed)
        .map(a => a.address);
}



/**
 * Fetches address suggestions from Nominatim (free), falling back to Photon if needed.
 */
async function getNominatimSuggestions(query: string, isPOISearch: boolean = false): Promise<{text: string, placeId?: string}[]> {
    try {
        let suggestions: {text: string, placeId?: string}[] = [];

        // Use CORS proxy to bypass browser restrictions
        const proxyUrl = 'https://corsproxy.io/?';
        const nominatimUrl = `${proxyUrl}https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=8&countrycodes=cz&bounded=1&viewbox=${EXPANDED_SEARCH_BOUNDS.lonMin},${EXPANDED_SEARCH_BOUNDS.latMin},${EXPANDED_SEARCH_BOUNDS.lonMax},${EXPANDED_SEARCH_BOUNDS.latMax}`;
        const response = await fetch(nominatimUrl);
        if (response.ok) {
            const data = await response.json();
            if (data && Array.isArray(data)) {
                suggestions = data.map((result: any) => ({
                    text: result.display_name,
                    placeId: result.place_id?.toString() // Nominatim place_id is string
                }));
            }
        }

        return suggestions;
    } catch (error) {
        console.error("Nominatim suggestions error:", error);
        return [];
    }
}

/**
 * Fetches address suggestions using Google Places Autocomplete API.
 * Falls back to Nominatim if Google API is not available or fails.
 */
export async function getAddressSuggestions(query: string, language: string): Promise<{text: string, placeId?: string}[]> {
    if (!query || query.trim().length < 3) {
        return [];
    }
    const cacheKey = `${query.toLowerCase()}_${language}`;
    if (suggestionsCache.has(cacheKey)) {
        return suggestionsCache.get(cacheKey)!;
    }

    const googleMapsApiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
    if (!googleMapsApiKey) {
        console.warn('Google Maps API key not configured, falling back to Nominatim');
        // Fallback to Nominatim
        return await getNominatimSuggestions(query, false);
    }

    try {
        const proxyUrl = 'https://corsproxy.io/?';
        const autocompleteUrl = `${proxyUrl}https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(query)}&key=${googleMapsApiKey}&language=${language}&region=cz&bounds=${SOUTH_MORAVIA_BOUNDS.latMin},${SOUTH_MORAVIA_BOUNDS.lonMin}|${SOUTH_MORAVIA_BOUNDS.latMax},${SOUTH_MORAVIA_BOUNDS.lonMax}`;

        const response = await fetch(autocompleteUrl);
        if (!response.ok) {
            throw new Error(`Places Autocomplete API error: ${response.status}`);
        }

        const data = await response.json();

        if (data.status === 'OK' && data.predictions && data.predictions.length > 0) {
            const suggestions = data.predictions.map((prediction: any) => ({
                text: prediction.description,
                placeId: prediction.place_id
            }));

            // Add frequent addresses
            const frequentSuggestions = getMatchingFrequentAddresses(query).map(text => ({ text }));
            const allSuggestions = [...frequentSuggestions, ...suggestions.filter(s =>
                !frequentSuggestions.some(f => f.text.toLowerCase() === s.text.toLowerCase())
            )];

            // Limit total suggestions
            const finalSuggestions = allSuggestions.filter(s => s.text && s.text.trim()).slice(0, 8);

            suggestionsCache.set(cacheKey, finalSuggestions);
            return finalSuggestions;
        } else {
            console.warn('Google Places Autocomplete failed:', data.status, data.error_message);
            // Fallback to Nominatim
            return await getNominatimSuggestions(query, false);
        }
    } catch (error) {
        console.error("Google Places Autocomplete error:", error);
        // Fallback to Nominatim
        return await getNominatimSuggestions(query, false);
    }
}


/**
 * Gets route details (duration, distance) from OSRM.
 */
async function getOsrmRoute(coordinates: string): Promise<{ duration: number; distance: number } | null> {
     try {
         const response = await fetch(`https://router.project-osrm.org/route/v1/driving/${coordinates}?overview=false`);
         if (!response.ok) throw new Error('Network response was not ok for OSRM');
         const data = await response.json();
         if (data.code === 'Ok' && data.routes?.length > 0) {
             const route = data.routes[0];
             return { duration: route.duration, distance: route.distance };
         }
         return null;
     } catch (error) {
         console.error("OSRM error:", error);
         return null;
     }
}

/**
 * Calculates the price of a ride based on a tariff, prioritizing flat rates.
 */
function calculatePrice(
    pickupAddress: string,
    destinationAddress: string,
    rideDistanceKm: number,
    vehicleType: VehicleType,
    passengers: number,
    tariff: Tariff
): number {
    const pickupLower = pickupAddress.toLowerCase();
    const destLower = destinationAddress.toLowerCase();

    // A ride for more than 4 passengers requires a van price, regardless of the vehicle used.
    // Also, if a van is used for a smaller ride, the van price still applies.
    const chargeVanPrice = vehicleType === VehicleType.Van || passengers > 4;

    for (const rate of tariff.flatRates) {
        const rateNameLower = rate.name.toLowerCase();
        if (rateNameLower.includes("mikulov") && pickupLower.includes("mikulov") && destLower.includes("mikulov")) {
            return chargeVanPrice ? rate.priceVan : rate.priceCar;
        } else if (rateNameLower.includes("hustopeč") && pickupLower.includes("hustopeče") && destLower.includes("hustopeče")) {
            return chargeVanPrice ? rate.priceVan : rate.priceCar;
        } else if (rateNameLower.includes("zaječí")) {
            // Zaječí flat rate applies only for rides between any address in Zaječí and Retro music club
            const isPickupInZajeci = pickupLower.includes("zaječí");
            const isDestInZajeci = destLower.includes("zaječí");
            const isPickupRetro = pickupLower.includes("retro");
            const isDestRetro = destLower.includes("retro");
            if ((isPickupInZajeci && isDestRetro) || (isPickupRetro && isDestInZajeci)) {
                return chargeVanPrice ? rate.priceVan : rate.priceCar;
            }
        }
    }

    // Check time-based tariffs
    const now = new Date();
    const currentTime = now.getHours() * 60 + now.getMinutes(); // minutes since midnight

    // Ensure timeBasedTariffs is an array before iterating
    const timeBasedTariffs = tariff.timeBasedTariffs || [];

    for (const timeTariff of timeBasedTariffs) {
        const [startHour, startMin] = timeTariff.startTime.split(':').map(Number);
        const [endHour, endMin] = timeTariff.endTime.split(':').map(Number);
        const startMinutes = startHour * 60 + startMin;
        const endMinutes = endHour * 60 + endMin;

        // Handle overnight tariffs (e.g., 22:00 to 06:00)
        const isOvernight = startMinutes > endMinutes;
        const isInRange = isOvernight
            ? currentTime >= startMinutes || currentTime <= endMinutes
            : currentTime >= startMinutes && currentTime <= endMinutes;

        if (isInRange) {
            const pricePerKm = chargeVanPrice ? timeTariff.pricePerKmVan : timeTariff.pricePerKmCar;
            return Math.round(timeTariff.startingFee + (rideDistanceKm * pricePerKm));
        }
    }

    // Fallback to default tariff
    const pricePerKm = chargeVanPrice ? tariff.pricePerKmVan : tariff.pricePerKmCar;
    return Math.round(tariff.startingFee + (rideDistanceKm * pricePerKm));
}

/**
 * Calculates a travel time matrix between a set of coordinates.
 */
async function buildTravelMatrix(coords: { lat: number; lon: number }[], unit: 'seconds' | 'minutes'): Promise<number[][]> {
    const matrix: number[][] = [];
    for (const origin of coords) {
        const row: number[] = [];
        for (const destination of coords) {
            if (origin === destination) {
                row.push(0);
                continue;
            }
            const route = await getOsrmRoute(`${origin.lon},${origin.lat};${destination.lon},${destination.lat}`);
            if (route) {
                const value = unit === 'minutes' ? Math.round(route.duration / 60) : route.duration;
                row.push(value);
            } else {
                row.push(unit === 'minutes' ? 999 : 99999); // Use a large number for errors
            }
        }
        matrix.push(row);
    }
    return matrix;
}

/**
 * Optimizes route order using a simple Nearest Neighbor heuristic.
 * This is a non-AI fallback for route optimization.
 * Returns the new order of original indices, e.g., [0, 2, 1, 3].
 */
function optimizeRouteNearestNeighbor(matrix: number[][]): number[] {
    if (matrix.length < 3) {
        return Array.from({ length: matrix.length }, (_, i) => i);
    }

    const numPoints = matrix.length;
    const path = [0]; // Start at the pickup location (index 0)
    const visited = new Set<number>([0]);
    let lastPoint = 0;

    while (path.length < numPoints) {
        let nearestPoint = -1;
        let minDistance = Infinity;

        for (let i = 0; i < numPoints; i++) {
            if (!visited.has(i)) {
                if (matrix[lastPoint][i] < minDistance) {
                    minDistance = matrix[lastPoint][i];
                    nearestPoint = i;
                }
            }
        }

        if (nearestPoint !== -1) {
            path.push(nearestPoint);
            visited.add(nearestPoint);
            lastPoint = nearestPoint;
        } else {
            for (let i = 0; i < numPoints; i++) {
                if (!visited.has(i)) {
                    path.push(i);
                    visited.add(i);
                }
            }
            break;
        }
    }
    return path;
}


/**
 * Main function to find the best vehicle for a multi-stop ride request.
 */
export async function findBestVehicle(
  rideRequest: RideRequest,
  vehicles: Vehicle[],
  tariff: Tariff,
  language: string,
  optimize: boolean
): Promise<AssignmentResultData | ErrorResult> {

    // Ensure tariff has proper structure
    const ensuredTariff: Tariff = {
        ...tariff,
        timeBasedTariffs: tariff.timeBasedTariffs || []
    };

    const vehiclesInService = vehicles.filter(v => v.status !== VehicleStatus.OutOfService && v.status !== VehicleStatus.NotDrivingToday);
    if (vehiclesInService.length === 0) return { messageKey: "error.noVehiclesInService" };
    
    const t = (key: string, params?: any) => key;
    let sms = '';
    let optimizedStops: string[] | undefined = undefined;

    try {
        let allStopCoords = await Promise.all(rideRequest.stops.map(stop => geocodeAddress(stop, language)));
        const vehicleCoords = await Promise.all(vehiclesInService.map(v => geocodeAddress(v.location, language)));
        const pickupCoords = allStopCoords[0];
        
        // --- Optimize route if more than 2 stops and requested ---
        if (rideRequest.stops.length > 2 && optimize) {
             // Use Nearest Neighbor heuristic for route optimization
             const travelMatrix = await buildTravelMatrix(allStopCoords, 'seconds');
             const reorderingIndices = optimizeRouteNearestNeighbor(travelMatrix);

             const reorderedStops = reorderingIndices.map(i => rideRequest.stops[i]);
             const reorderedCoords = reorderingIndices.map(i => allStopCoords[i]);

             allStopCoords = reorderedCoords;
             optimizedStops = reorderedStops;
        }

        const mainRideRoute = await getOsrmRoute(allStopCoords.map(c => `${c.lon},${c.lat}`).join(';'));
        if (!mainRideRoute) return { messageKey: "error.mainRouteCalculationFailed" };

        const rideDistanceKm = mainRideRoute.distance / 1000;
        const rideDurationMinutes = Math.round(mainRideRoute.duration / 60);

        const etasData = await Promise.all(vehicleCoords.map(coords => getOsrmRoute(`${coords.lon},${coords.lat};${pickupCoords.lon},${pickupCoords.lat}`)));
        
        const alternativesWithEta: AssignmentAlternative[] = vehiclesInService.map((vehicle, index) => {
            const route = etasData[index];
            const eta = route ? Math.round(route.duration / 60) : 999;
            const waitTime = vehicle.status === VehicleStatus.Busy && vehicle.freeAt ? Math.max(0, Math.round((vehicle.freeAt - Date.now()) / 60000)) : 0;
            const finalDestination = (optimizedStops || rideRequest.stops).slice(-1)[0];
            return {
                vehicle,
                eta: eta + waitTime,
                waitTime,
                estimatedPrice: calculatePrice(rideRequest.stops[0], finalDestination, rideDistanceKm, vehicle.type, rideRequest.passengers, ensuredTariff),
            };
        });

        alternativesWithEta.sort((a, b) => a.eta - b.eta);

        const suitableVehicles = alternativesWithEta.filter(alt => alt.vehicle.capacity >= rideRequest.passengers);
        if (suitableVehicles.length === 0) return { messageKey: "error.insufficientCapacity", message: `${rideRequest.passengers}` };
        
        // Select the best vehicle by ETA (first in sorted list)
        const bestAlternative = suitableVehicles[0];
        const otherAlternatives = suitableVehicles.slice(1);

        const bestVehicleIndex = vehiclesInService.findIndex(v => v.id === bestAlternative.vehicle.id);
        const bestVehicleCoords = vehicleCoords[bestVehicleIndex];
        const longNavigationUrl = generateNavigationUrl(bestVehicleCoords, allStopCoords);
        const navigationUrl = await shortenUrl(longNavigationUrl);
        sms = generateSms({ ...rideRequest, stops: optimizedStops || rideRequest.stops }, t, navigationUrl);

        return {
            vehicle: bestAlternative.vehicle,
            eta: bestAlternative.eta,
            waitTime: bestAlternative.waitTime,
            estimatedPrice: bestAlternative.estimatedPrice,
            rideDuration: rideDurationMinutes,
            rideDistance: rideDistanceKm,
            sms,
            alternatives: otherAlternatives,
            rideRequest,
            optimizedStops,
            vehicleLocationCoords: bestVehicleCoords,
            stopCoords: allStopCoords,
            navigationUrl,
        };

    } catch (e: any) {
        return { messageKey: "error.geocodingFailed", message: e.message };
    }
}



/**
 * Calculates the distance traveled for a ride based on start and end mileage.
 */
export function calculateRideDistance(startMileage: number | null, endMileage: number | null): number | null {
    if (!startMileage || !endMileage || endMileage < startMileage) {
        return null;
    }
    return endMileage - startMileage;
}

/**
 * Updates vehicle mileage after a ride is completed.
 */
export function updateVehicleMileage(vehicle: Vehicle, endMileage: number): Vehicle {
    return {
        ...vehicle,
        mileage: endMileage,
        lastServiceMileage: vehicle.lastServiceMileage ? vehicle.lastServiceMileage + (endMileage - (vehicle.mileage || 0)) : endMileage
    };
}

/**
 * Calculates fuel cost for a ride based on distance and fuel consumption.
 */
export function calculateFuelCost(distanceKm: number, fuelConsumption: number, fuelPrice: number): number {
    if (!distanceKm || !fuelConsumption || !fuelPrice) {
        return 0;
    }
    const fuelUsed = (distanceKm * fuelConsumption) / 100;
    return Math.round(fuelUsed * fuelPrice * 100) / 100; // Round to 2 decimal places
}

/**
 * Validates mileage data for a ride log entry.
 */
export function validateMileageData(startMileage?: number, endMileage?: number, vehicleMileage?: number): { isValid: boolean; error?: string } {
    if (!startMileage || !endMileage) {
        return { isValid: true }; // Optional fields
    }

    if (endMileage < startMileage) {
        return { isValid: false, error: "Konečný stav km nemůže být menší než počáteční stav km" };
    }

    if (vehicleMileage && startMileage < vehicleMileage) {
        return { isValid: false, error: "Počáteční stav km nemůže být menší než aktuální stav vozidla" };
    }

    return { isValid: true };
}

/**
 * Generates a summary of mileage data for reporting purposes.
 */
export function generateMileageSummary(rideLogs: RideLog[], vehicles: Vehicle[]): {
    totalBusinessDistance: number;
    totalPrivateDistance: number;
    totalFuelCost: number;
    vehicleSummaries: Array<{
        vehicleId: number;
        vehicleName: string;
        businessDistance: number;
        privateDistance: number;
        fuelCost: number;
    }>;
} {
    const vehicleSummaries = vehicles.map(vehicle => ({
        vehicleId: vehicle.id,
        vehicleName: vehicle.name,
        businessDistance: 0,
        privateDistance: 0,
        fuelCost: 0
    }));

    let totalBusinessDistance = 0;
    let totalPrivateDistance = 0;
    let totalFuelCost = 0;

    rideLogs.forEach(log => {
        if (log.distance && log.status === 'COMPLETED') {
            const fuelCost = log.fuelCost || 0;

            if (log.rideType === RideType.BUSINESS) {
                totalBusinessDistance += log.distance;
            } else if (log.rideType === RideType.PRIVATE) {
                totalPrivateDistance += log.distance;
            }

            totalFuelCost += fuelCost;

            const vehicleSummary = vehicleSummaries.find(v => v.vehicleId === log.vehicleId);
            if (vehicleSummary) {
                if (log.rideType === RideType.BUSINESS) {
                    vehicleSummary.businessDistance += log.distance;
                } else if (log.rideType === RideType.PRIVATE) {
                    vehicleSummary.privateDistance += log.distance;
                }
                vehicleSummary.fuelCost += fuelCost;
            }
        }
    });

    return {
        totalBusinessDistance,
        totalPrivateDistance,
        totalFuelCost,
        vehicleSummaries
    };
}

/**
 * Checks if a vehicle needs service based on mileage.
 */
export function checkServiceRequired(vehicle: Vehicle): { required: boolean; kmOverdue: number; message: string } {
    if (!vehicle.mileage || !vehicle.serviceInterval || !vehicle.lastServiceMileage) {
        return { required: false, kmOverdue: 0, message: "Nedostatečná data pro kontrolu servisu" };
    }

    const kmSinceLastService = vehicle.mileage - vehicle.lastServiceMileage;
    const kmOverdue = kmSinceLastService - vehicle.serviceInterval;

    if (kmOverdue > 0) {
        return {
            required: true,
            kmOverdue,
            message: `Servis po termínu o ${kmOverdue} km`
        };
    } else if (kmSinceLastService >= vehicle.serviceInterval * 0.9) {
        return {
            required: false,
            kmOverdue: 0,
            message: `Servis za ${vehicle.serviceInterval - kmSinceLastService} km`
        };
    }

    return { required: false, kmOverdue: 0, message: "Servis v pořádku" };
}