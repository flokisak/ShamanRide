import { GoogleGenAI, Type } from "@google/genai";
import type { RideRequest, Vehicle, AssignmentResultData, ErrorResult, AssignmentAlternative, Tariff, RideLog, FlatRateRule, MessagingApp } from '../types';
import { VehicleStatus, VehicleType, MessagingApp as AppType, RideType } from '../types';
import { supabaseService } from './supabaseClient';

const GEMINI_API_KEY = process.env.API_KEY;
if (!GEMINI_API_KEY) {
  console.error("API_KEY environment variable not set for Gemini.");
}
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY! });

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
    navApp: 'google' | 'waze' = 'google'
): string {
    if (stopsCoords.length === 0) {
        return navApp === 'waze' ? 'https://waze.com' : 'https://maps.google.com';
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
// Expanded bounds to include Czech Republic, Austria, Slovakia, and nearby areas
// Original South Moravia bounds for preference: { lonMin: 16.3, latMin: 48.7, lonMax: 17.2, latMax: 49.3 }
const EXPANDED_SEARCH_BOUNDS = { lonMin: 12.0, latMin: 46.0, lonMax: 24.0, latMax: 52.0 };

/**
 * Checks if coordinates are within South Moravia bounds.
 */
function isInSouthMoravia(lat: number, lon: number): boolean {
    const SOUTH_MORAVIA_BOUNDS = { lonMin: 16.3, latMin: 48.7, lonMax: 17.2, latMax: 49.3 };
    return lon >= SOUTH_MORAVIA_BOUNDS.lonMin && lon <= SOUTH_MORAVIA_BOUNDS.lonMax &&
           lat >= SOUTH_MORAVIA_BOUNDS.latMin && lat <= SOUTH_MORAVIA_BOUNDS.latMax;
}

function isInCzechRepublic(lat: number, lon: number): boolean {
    // Approximate bounds for Czech Republic
    return lon >= 12.0 && lon <= 18.9 && lat >= 48.5 && lat <= 51.1;
}

/**
 * Converts an address to geographic coordinates using Nominatim (free), falling back to Photon.
 */
export async function geocodeAddress(address: string, language: string): Promise<{ lat: number; lon: number }> {
    const cacheKey = `${address}_${language}`;
    if (geocodeCache.has(cacheKey)) return geocodeCache.get(cacheKey)!;

    const fetchNominatimCoords = async (addrToTry: string) => {
        try {
            const proxyUrl = 'https://corsproxy.io/?';
            const parts = addrToTry.split('|');
            const address = parts[0];
            const placeId = parts[1];

            let nominatimUrl: string;
            if (placeId) {
                // Use Nominatim details API for exact location
                nominatimUrl = `${proxyUrl}https://nominatim.openstreetmap.org/details?place_id=${encodeURIComponent(placeId)}&format=json`;
            } else {
                // Use search API
                nominatimUrl = `${proxyUrl}https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=10&countrycodes=cz&bounded=1&viewbox=${EXPANDED_SEARCH_BOUNDS.lonMin},${EXPANDED_SEARCH_BOUNDS.latMin},${EXPANDED_SEARCH_BOUNDS.lonMax},${EXPANDED_SEARCH_BOUNDS.latMax}`;
            }

            const response = await fetch(nominatimUrl);
            if (!response.ok) return null;
            const data = await response.json();

            if (placeId) {
                // Details API returns single object
                if (data && data.lat && data.lon) {
                    return { lat: parseFloat(data.lat), lon: parseFloat(data.lon) };
                }
            } else {
                // Search API returns array
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
            }
        } catch (error) {
            console.error("Nominatim geocoding error:", error);
        }
        return null;
    };

    const fetchPhotonCoords = async (addrToTry: string, lang: string) => {
        // First try with expanded bounds to find results including foreign countries
        const photonUrl = `https://photon.komoot.io/api/?q=${encodeURIComponent(addrToTry)}&limit=10&bbox=${EXPANDED_SEARCH_BOUNDS.lonMin},${EXPANDED_SEARCH_BOUNDS.latMin},${EXPANDED_SEARCH_BOUNDS.lonMax},${EXPANDED_SEARCH_BOUNDS.latMax}`;
        const response = await fetch(photonUrl);
        if (!response.ok) return null;
        const data = await response.json();
        if (data && data.features && Array.isArray(data.features) && data.features.length > 0) {
            // First priority: results within South Moravia bounds
            for (const feature of data.features) {
                const coords = feature.geometry.coordinates;
                const lon = coords[0];
                const lat = coords[1];
                if (isInSouthMoravia(lat, lon)) {
                    return { lat, lon };
                }
            }
            // Second priority: results within Czech Republic (approximate bounds)
            for (const feature of data.features) {
                const coords = feature.geometry.coordinates;
                const lon = coords[0];
                const lat = coords[1];
                if (isInCzechRepublic(lat, lon)) {
                    return { lat, lon };
                }
            }
            // Third priority: any result within expanded bounds
            const coords = data.features[0].geometry.coordinates;
            return { lat: coords[1], lon: coords[0] };
        }
        return null;
    };

    try {
        // Try Nominatim first
        let result = await fetchNominatimCoords(address);
        if (!result) {
            // Fallback to Photon
            result = await fetchPhotonCoords(address, language);
        }
        if (!result) {
            const city = address.split(',').map(p => p.trim()).pop();
            if (city && city.toLowerCase() !== address.toLowerCase()) {
                result = await fetchNominatimCoords(city);
                if (!result) {
                    result = await fetchPhotonCoords(city, language);
                }
            }
        }

        if (result) {
            geocodeCache.set(cacheKey, result);
            return result;
        }
        throw new Error(`Address not found: ${address}`);
    } catch (error) {
        console.error("Geocoding error:", error);
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

// POI categories with their OSM tags for better search results
const POI_CATEGORIES = {
    // Hotels and accommodation
    hotel: [
        { key: 'tourism', value: 'hotel' },
        { key: 'tourism', value: 'guest_house' },
        { key: 'tourism', value: 'hostel' },
        { key: 'tourism', value: 'motel' },
        { key: 'tourism', value: 'apartment' },
        { key: 'tourism', value: 'chalet' }
    ],
    // Restaurants and food
    restaurant: [
        { key: 'amenity', value: 'restaurant' },
        { key: 'amenity', value: 'cafe' },
        { key: 'amenity', value: 'bar' },
        { key: 'amenity', value: 'pub' },
        { key: 'amenity', value: 'fast_food' }
    ],
    // Wineries and alcohol
    winery: [
        { key: 'craft', value: 'winery' },
        { key: 'shop', value: 'wine' },
        { key: 'amenity', value: 'bar' },
        { key: 'tourism', value: 'attraction' }
    ],
    // Tourism and attractions
    tourism: [
        { key: 'tourism', value: 'attraction' },
        { key: 'tourism', value: 'museum' },
        { key: 'tourism', value: 'gallery' },
        { key: 'tourism', value: 'viewpoint' },
        { key: 'historic', value: 'castle' },
        { key: 'historic', value: 'monument' }
    ],
    // Shopping
    shop: [
        { key: 'shop', value: 'supermarket' },
        { key: 'shop', value: 'mall' },
        { key: 'shop', value: 'department_store' },
        { key: 'shop', value: 'convenience' }
    ],
    // Healthcare
    healthcare: [
        { key: 'amenity', value: 'hospital' },
        { key: 'amenity', value: 'clinic' },
        { key: 'amenity', value: 'pharmacy' },
        { key: 'amenity', value: 'doctors' }
    ],
    // Transportation
    transport: [
        { key: 'amenity', value: 'bus_station' },
        { key: 'amenity', value: 'taxi' },
        { key: 'amenity', value: 'ferry_terminal' },
        { key: 'railway', value: 'station' }
    ],
    // Fuel stations
    fuel: [
        { key: 'amenity', value: 'fuel' },
        { key: 'amenity', value: 'charging_station' }
    ],
    // Parking
    parking: [
        { key: 'amenity', value: 'parking' },
        { key: 'amenity', value: 'parking_entrance' }
    ],
    // Education
    education: [
        { key: 'amenity', value: 'school' },
        { key: 'amenity', value: 'university' },
        { key: 'amenity', value: 'college' }
    ]
};

// Keywords that trigger POI search for each category
const POI_KEYWORDS = {
    hotel: ['hotel', 'hotelu', 'ubytování', 'pension', 'penzion', 'apartmán', 'apartman', 'hostel', 'motel', 'guesthouse'],
    restaurant: ['restaurace', 'restaurant', 'hospoda', 'bar', 'kavárna', 'cafe', 'pizzeria', 'pizza', 'fast food', 'rychlé občerstvení'],
    winery: ['vinárna', 'vinotéka', 'vinařství', 'vinař', 'wine', 'víno', 'vinar', 'degustace', 'degustation'],
    tourism: ['hrad', 'zámek', 'muzeum', 'galerie', 'památka', 'atrakce', 'castle', 'museum', 'gallery', 'attraction'],
    shop: ['obchod', 'supermarket', 'nákupní centrum', 'mall', 'prodejna', 'shop', 'market'],
    healthcare: ['nemocnice', 'lékař', 'doktor', 'lékárna', 'klinika', 'hospital', 'doctor', 'pharmacy', 'clinic'],
    transport: ['nádraží', 'autobus', 'bus', 'vlak', 'taxi', 'letiště', 'airport', 'station'],
    fuel: ['benzín', 'benzínka', 'čerpací stanice', 'fuel', 'gas', 'station', 'tankstelle'],
    parking: ['parkování', 'parking', 'parkoviště', 'garáž', 'garage'],
    education: ['škola', 'škola', 'univerzita', 'vysoká škola', 'school', 'university', 'college']
};

/**
 * Detects if a query contains POI-related keywords and returns matching categories
 */
function detectPOICategories(query: string): string[] {
    const lowerQuery = query.toLowerCase();
    const categories: string[] = [];

    for (const [category, keywords] of Object.entries(POI_KEYWORDS)) {
        if (keywords.some(keyword => lowerQuery.includes(keyword))) {
            categories.push(category);
        }
    }

    return categories;
}

/**
 * Fetches POI-specific suggestions from Photon API
 */
async function fetchPOISuggestions(query: string, categories: string[], language: string): Promise<any[]> {
    const allFeatures: any[] = [];

    // Get POI-specific results for each detected category
    for (const category of categories) {
        const poiTags = POI_CATEGORIES[category as keyof typeof POI_CATEGORIES];
        if (!poiTags) continue;

        for (const tag of poiTags.slice(0, 2)) { // Limit to 2 tags per category to avoid too many requests
            try {
                const poiUrl = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=3&bbox=${EXPANDED_SEARCH_BOUNDS.lonMin},${EXPANDED_SEARCH_BOUNDS.latMin},${EXPANDED_SEARCH_BOUNDS.lonMax},${EXPANDED_SEARCH_BOUNDS.latMax}&osm_tag=${tag.key}:${tag.value}`;

                const response = await fetch(poiUrl);
                if (response.ok) {
                    const data = await response.json();
                    if (data?.features) {
                        allFeatures.push(...data.features);
                    }
                }
            } catch (error) {
                console.warn(`POI search failed for ${category}:${tag.key}=${tag.value}`, error);
            }
        }
    }

    // Remove duplicates based on coordinates
    const uniqueFeatures = allFeatures.filter((feature, index, self) =>
        index === self.findIndex(f =>
            f.geometry?.coordinates?.[0] === feature.geometry?.coordinates?.[0] &&
            f.geometry?.coordinates?.[1] === feature.geometry?.coordinates?.[1]
        )
    );

    return uniqueFeatures.slice(0, 8); // Limit total POI results
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
 * Fetches address suggestions from Photon API based on user input.
 * Enhanced with POI detection and specialized search for hotels, wineries, restaurants, etc.
 * Falls back to Google Places Autocomplete if Photon returns few results.
 */
export async function getAddressSuggestions(query: string, language: string): Promise<{text: string, placeId?: string}[]> {
    if (!query || query.trim().length < 3) {
        return [];
    }
    const cacheKey = `${query.toLowerCase()}_${language}`;
    if (suggestionsCache.has(cacheKey)) {
        return suggestionsCache.get(cacheKey)!;
    }

    const poiCategories = detectPOICategories(query);
    const isPOISearch = poiCategories.length > 0;

    try {
        const suggestions: {text: string, placeId?: string}[] = [];

        // Fetch Nominatim suggestions (includes POI and addresses)
        const nominatimSuggestions = await getNominatimSuggestions(query, isPOISearch);
        suggestions.push(...nominatimSuggestions);

        // If POI keywords detected and Nominatim returned few results, fetch POI-specific results from Photon
        if (isPOISearch && suggestions.length < 5) {
            const poiFeatures = await fetchPOISuggestions(query, poiCategories, language);
            const poiSuggestions = poiFeatures.map((feature: any) => {
                const props = feature.properties;
                const name = props.name || '';
                const city = props.city || props.town || props.village || '';
                const street = props.street || '';
                const housenumber = props.housenumber || '';
                const category = props.osm_value || '';
                const address = [name, street, housenumber, city].filter(Boolean).join(', ');
                return { text: address };
            }).filter(s => s.text.trim());
            suggestions.push(...poiSuggestions);
        }

        // Fetch Photon general suggestions only if still few results
        if (suggestions.length < 5) {
            const generalUrl = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=5&bbox=${EXPANDED_SEARCH_BOUNDS.lonMin},${EXPANDED_SEARCH_BOUNDS.latMin},${EXPANDED_SEARCH_BOUNDS.lonMax},${EXPANDED_SEARCH_BOUNDS.latMax}`;
            const generalResponse = await fetch(generalUrl);
            if (generalResponse.ok) {
                const data = await generalResponse.json();
                if (data?.features) {
                    const generalSuggestions = data.features.map((feature: any) => {
                        const props = feature.properties;
                        const name = props.name || '';
                        const city = props.city || props.town || props.village || '';
                        const street = props.street || '';
                        const housenumber = props.housenumber || '';
                        const address = [name, street, housenumber, city].filter(Boolean).join(', ');
                        return { text: shortenAddress(address) };
                    }).filter(s => s.text.trim());

                    suggestions.push(...generalSuggestions);
                }
            }
        }

        // Add frequent addresses
        const frequentSuggestions = getMatchingFrequentAddresses(query).map(text => ({ text }));
        const allSuggestions = [...frequentSuggestions, ...suggestions.filter(s =>
            !frequentSuggestions.some(f => f.text.toLowerCase() === s.text.toLowerCase())
        )];

        // Limit total suggestions
        const finalSuggestions = allSuggestions.filter(s => s.text && s.text.trim()).slice(0, 8);

        suggestionsCache.set(cacheKey, finalSuggestions);
        return finalSuggestions;

    } catch (error) {
        console.error("Address suggestion fetching error:", error);
        return [];
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
        if ((rateNameLower.includes("mikulov") && pickupLower.includes("mikulov") && destLower.includes("mikulov")) ||
            (rateNameLower.includes("hustopeč") && pickupLower.includes("hustopeče") && destLower.includes("hustopeče")) ||
            (rateNameLower.includes("zaječí") && (pickupLower.includes("zaječí") || destLower.includes("zaječí")))) {
            return chargeVanPrice ? rate.priceVan : rate.priceCar;
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
  isAiEnabled: boolean,
  tariff: Tariff,
  language: string,
  optimize: boolean
): Promise<AssignmentResultData | ErrorResult> {
    if (isAiEnabled && !GEMINI_API_KEY) return { messageKey: "error.missingApiKey" };

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
             let reorderingIndices: number[];

             if (isAiEnabled) {
                const travelTimeMatrix = await buildTravelMatrix(allStopCoords, 'minutes');
                const optimalDestinationOrder = await getOptimalRouteOrder(travelTimeMatrix, rideRequest.stops.length - 1);
                reorderingIndices = [0, ...optimalDestinationOrder]; // Prepend start index
            } else {
                // Use non-AI Nearest Neighbor heuristic
                const travelMatrix = await buildTravelMatrix(allStopCoords, 'seconds');
                reorderingIndices = optimizeRouteNearestNeighbor(travelMatrix);
            }

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
        
        let bestAlternative: AssignmentAlternative;
        let otherAlternatives: AssignmentAlternative[];

        if (isAiEnabled) {
            bestAlternative = await chooseBestVehicleWithAI(rideRequest, suitableVehicles);
            otherAlternatives = suitableVehicles.filter(v => v.vehicle.id !== bestAlternative.vehicle.id);
        } else {
            // In non-AI mode, the best vehicle is simply the first one in the list sorted by ETA.
            bestAlternative = suitableVehicles[0];
            otherAlternatives = suitableVehicles.slice(1);
        }

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

async function getOptimalRouteOrder(matrix: number[][], numDestinations: number): Promise<number[]> {
    const destinationIndices = Array.from({ length: numDestinations }, (_, i) => i + 1);

    const prompt = `
        You are a logistics expert tasked with finding the most efficient route.
        Given a travel time matrix, find the shortest path that starts at index 0 and visits all other specified destinations exactly once. The path does not need to return to the start.

        **Problem Details:**
        - **Start Point:** Index 0 (fixed).
        - **Destinations to Visit:** Indices ${JSON.stringify(destinationIndices)}.
        - **Travel Time Matrix (in minutes):** Each entry matrix[i][j] is the time from location i to location j.
        ${JSON.stringify(matrix)}

        **Required Output:**
        Return a single, valid JSON object with a key "optimal_order". The value should be an array of the destination indices (e.g., ${JSON.stringify(destinationIndices)}) in the most efficient order.
        For example, if the destinations are [1, 2, 3], a valid output showing the optimal path 0 -> 3 -> 1 -> 2 would be:
        {"optimal_order": [3, 1, 2]}

        Do not include any other text, explanations, or markdown formatting.
    `;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                temperature: 0,
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        optimal_order: {
                            type: Type.ARRAY,
                            items: { type: Type.INTEGER }
                        }
                    },
                    required: ["optimal_order"]
                },
            }
        });

        const result = JSON.parse(response.text.trim());
        // Basic validation
        if (Array.isArray(result.optimal_order) && result.optimal_order.length === numDestinations) {
            return result.optimal_order;
        } else {
            console.error("AI returned an invalid route order. Falling back to original order.", result);
            return destinationIndices; // Fallback to original order
        }
    } catch (error) {
        console.error("Error getting optimal route from AI. Falling back to original order.", error);
        return destinationIndices; // Fallback to original order on error
    }
}


async function chooseBestVehicleWithAI(rideRequest: RideRequest, suitableVehicles: AssignmentAlternative[]): Promise<AssignmentAlternative> {
    const vehicleDataForPrompt = suitableVehicles.map(alt => ({ id: alt.vehicle.id, name: alt.vehicle.name, capacity: alt.vehicle.capacity, eta: alt.eta, price: alt.estimatedPrice }));
    const prompt = `
        You are an expert taxi dispatcher. Your task is to select the single best vehicle for a customer from the provided list of options.
        **Ride Request Details:**
        - Number of Passengers: ${rideRequest.passengers}
        - Route: ${rideRequest.stops.join(" -> ")}
        **Vehicle Options (pre-sorted by ETA):**
        ${JSON.stringify(vehicleDataForPrompt, null, 2)}
        **Decision Criteria:**
        Your primary goal is to minimize the customer's wait time. Select the vehicle with the lowest 'eta'.
        If multiple vehicles have the same lowest ETA, choose the first one in the list.
        **Required Output:**
        Return a SINGLE, VALID JSON object containing only the ID of your chosen vehicle. Do not include any other text or markdown.
    `;

    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash', contents: prompt, config: {
            temperature: 0, responseMimeType: "application/json",
            responseSchema: { type: Type.OBJECT, properties: { bestVehicleId: { type: Type.INTEGER } }, required: ["bestVehicleId"] },
        }
    });

    const choiceResult = JSON.parse(response.text.trim());
    const bestVehicleId = choiceResult.bestVehicleId;
    let bestAlternative = suitableVehicles.find(alt => alt.vehicle.id === bestVehicleId);
    if (!bestAlternative) {
        console.error("AI returned an invalid vehicle ID. Falling back to the first suitable vehicle.");
        bestAlternative = suitableVehicles[0];
    }
    return bestAlternative;
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