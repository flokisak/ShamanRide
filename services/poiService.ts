/**
 * POI (Point of Interest) Search Service
 * Uses Google Places API for enhanced POI discovery
 */

export interface POIResult {
  placeId: string;
  name: string;
  address: string;
  location: { lat: number; lng: number };
  types: string[];
  rating?: number;
  priceLevel?: number;
  businessStatus: string;
  vicinity?: string;
  photos?: Array<{
    photoReference: string;
    width: number;
    height: number;
  }>;
}

export interface POISearchOptions {
  query?: string;
  location?: { lat: number; lng: number };
  radius?: number;
  types?: string[];
  language?: string;
  minPrice?: number;
  maxPrice?: number;
  openNow?: boolean;
  rankBy?: 'prominence' | 'distance';
}

const CACHE_EXPIRY = 30 * 60 * 1000; // 30 minutes
const searchCache = new Map<string, { results: POIResult[]; timestamp: number }>();

/**
 * Generates cache key for POI search
 */
function generateCacheKey(options: POISearchOptions): string {
  const key = JSON.stringify({
    query: options.query,
    location: options.location,
    radius: options.radius,
    types: options.types?.sort(),
    language: options.language,
    minPrice: options.minPrice,
    maxPrice: options.maxPrice,
    openNow: options.openNow,
    rankBy: options.rankBy
  });
  return btoa(key).replace(/[^a-zA-Z0-9]/g, '');
}

/**
 * Checks if cached results are still valid
 */
function isCacheValid(timestamp: number): boolean {
  return Date.now() - timestamp < CACHE_EXPIRY;
}

/**
 * Searches for Points of Interest using Google Places API
 */
export async function searchPOIs(options: POISearchOptions): Promise<POIResult[]> {
  const cacheKey = generateCacheKey(options);

  // Check cache first
  const cached = searchCache.get(cacheKey);
  if (cached && isCacheValid(cached.timestamp)) {
    console.log('Using cached POI results for:', options.query || options.types?.join(','));
    return cached.results;
  }

  const googleMapsApiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  if (!googleMapsApiKey) {
    console.warn('Google Maps API key not configured for POI search');
    return [];
  }

  try {
    let url: string;

    if (options.query) {
      // Text search
      url = `${proxyUrl}https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(options.query)}&key=${googleMapsApiKey}`;
    } else {
      // Nearby search
      const location = options.location ? `${options.location.lat},${options.location.lng}` : '';
      url = `${proxyUrl}https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${location}&key=${googleMapsApiKey}`;
    }

    // Add optional parameters
    const params = new URLSearchParams();

    if (options.radius && options.query) {
      params.append('radius', options.radius.toString());
    }

    if (options.types && options.types.length > 0) {
      params.append('type', options.types[0]); // Google allows only one type for nearby search
    }

    if (options.language) {
      params.append('language', options.language);
    }

    if (options.minPrice !== undefined) {
      params.append('minprice', options.minPrice.toString());
    }

    if (options.maxPrice !== undefined) {
      params.append('maxprice', options.maxPrice.toString());
    }

    if (options.openNow) {
      params.append('opennow', 'true');
    }

    if (options.rankBy) {
      params.append('rankby', options.rankBy);
    }

    if (params.toString()) {
      url += '&' + params.toString();
    }

    console.log('Searching POIs with URL:', url.replace(googleMapsApiKey, '[API_KEY]'));

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Places API error: ${response.status}`);
    }

    const data = await response.json();

    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
      console.warn('Google Places API error:', data.status, data.error_message);
      return [];
    }

    const results: POIResult[] = (data.results || []).map((place: any) => ({
      placeId: place.place_id,
      name: place.name,
      address: place.formatted_address || place.vicinity || '',
      location: {
        lat: place.geometry.location.lat,
        lng: place.geometry.location.lng
      },
      types: place.types || [],
      rating: place.rating,
      priceLevel: place.price_level,
      businessStatus: place.business_status || 'OPERATIONAL',
      vicinity: place.vicinity,
      photos: place.photos?.map((photo: any) => ({
        photoReference: photo.photo_reference,
        width: photo.width,
        height: photo.height
      }))
    }));

    // Cache the results
    searchCache.set(cacheKey, {
      results,
      timestamp: Date.now()
    });

    console.log(`Found ${results.length} POI results for:`, options.query || options.types?.join(','));

    // Clean up old cache entries (keep only last 50)
    if (searchCache.size > 50) {
      const oldestKey = Array.from(searchCache.keys())[0];
      searchCache.delete(oldestKey);
    }

    return results;

  } catch (error) {
    console.error('POI search error:', error);
    return [];
  }
}

/**
 * Gets detailed information about a specific POI
 */
export async function getPOIDetails(placeId: string, language?: string): Promise<POIResult | null> {
  const googleMapsApiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  if (!googleMapsApiKey) {
    console.warn('Google Maps API key not configured for POI details');
    return null;
  }

  try {
    const params = new URLSearchParams({
      place_id: placeId,
      key: googleMapsApiKey
    });

    if (language) {
      params.append('language', language);
    }

    const url = `${proxyUrl}https://maps.googleapis.com/maps/api/place/details/json?${params.toString()}`;

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Places Details API error: ${response.status}`);
    }

    const data = await response.json();

    if (data.status !== 'OK') {
      console.warn('Google Places Details API error:', data.status, data.error_message);
      return null;
    }

    const place = data.result;
    return {
      placeId: place.place_id,
      name: place.name,
      address: place.formatted_address || '',
      location: {
        lat: place.geometry.location.lat,
        lng: place.geometry.location.lng
      },
      types: place.types || [],
      rating: place.rating,
      priceLevel: place.price_level,
      businessStatus: place.business_status || 'OPERATIONAL',
      vicinity: place.vicinity,
      photos: place.photos?.map((photo: any) => ({
        photoReference: photo.photo_reference,
        width: photo.width,
        height: photo.height
      }))
    };

  } catch (error) {
    console.error('POI details error:', error);
    return null;
  }
}

/**
 * Gets autocomplete suggestions for POI search
 */
export async function getPOIAutocomplete(
  query: string,
  location?: { lat: number; lng: number },
  radius?: number,
  types?: string[],
  language?: string
): Promise<Array<{ text: string; placeId: string; types: string[] }>> {
  const googleMapsApiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  if (!googleMapsApiKey) {
    console.warn('Google Maps API key not configured for POI autocomplete');
    return [];
  }

  if (query.trim().length < 2) {
    return [];
  }

  try {
    const params = new URLSearchParams({
      input: query,
      key: googleMapsApiKey
    });

    if (location) {
      params.append('location', `${location.lat},${location.lng}`);
    }

    if (radius) {
      params.append('radius', radius.toString());
    }

    if (types && types.length > 0) {
      params.append('types', types.join('|'));
    }

    if (language) {
      params.append('language', language);
    }

    const url = `${proxyUrl}https://maps.googleapis.com/maps/api/place/autocomplete/json?${params.toString()}`;

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Places Autocomplete API error: ${response.status}`);
    }

    const data = await response.json();

    if (data.status !== 'OK') {
      console.warn('Google Places Autocomplete API error:', data.status, data.error_message);
      return [];
    }

    return (data.predictions || []).map((prediction: any) => ({
      text: prediction.description,
      placeId: prediction.place_id,
      types: prediction.types || []
    }));

  } catch (error) {
    console.error('POI autocomplete error:', error);
    return [];
  }
}

/**
 * Predefined POI type categories for easy searching
 */
export const POI_CATEGORIES = {
  ACCOMMODATION: ['lodging', 'hotel', 'motel', 'bed_and_breakfast', 'hostel', 'campground'],
  FOOD_DRINK: ['restaurant', 'bar', 'cafe', 'food', 'meal_delivery', 'meal_takeaway'],
  SHOPPING: ['store', 'shopping_mall', 'supermarket', 'convenience_store', 'clothing_store', 'electronics_store'],
  ENTERTAINMENT: ['movie_theater', 'night_club', 'casino', 'bowling_alley', 'amusement_park'],
  HEALTHCARE: ['hospital', 'doctor', 'pharmacy', 'dentist', 'veterinary_care'],
  EDUCATION: ['school', 'university', 'library'],
  TRANSPORT: ['airport', 'bus_station', 'train_station', 'subway_station', 'taxi_stand'],
  RELIGIOUS: ['church', 'hindu_temple', 'mosque', 'synagogue'],
  SPORTS: ['gym', 'stadium', 'park', 'spa', 'beauty_salon'],
  BUSINESS: ['bank', 'atm', 'gas_station', 'car_repair', 'car_wash', 'parking']
} as const;

/**
 * Searches for specific business types (hotels, wineries, B&Bs, etc.)
 */
export async function searchBusinessTypes(
  businessTypes: readonly string[],
  location?: { lat: number; lng: number },
  radius: number = 5000,
  language?: string
): Promise<POIResult[]> {
  const options: POISearchOptions = {
    location,
    radius,
    types: [...businessTypes],
    language,
    rankBy: 'distance'
  };

  return searchPOIs(options);
}

/**
 * Searches for wineries and wine-related businesses
 */
export async function searchWineries(
  location?: { lat: number; lng: number },
  radius: number = 10000,
  language?: string
): Promise<POIResult[]> {
  return searchBusinessTypes(['liquor_store', 'bar', 'restaurant'], location, radius, language);
}

/**
 * Searches for hotels and accommodation
 */
export async function searchHotels(
  location?: { lat: number; lng: number },
  radius: number = 10000,
  language?: string
): Promise<POIResult[]> {
  return searchBusinessTypes(POI_CATEGORIES.ACCOMMODATION, location, radius, language);
}

/**
 * Searches for restaurants and food establishments
 */
export async function searchRestaurants(
  location?: { lat: number; lng: number },
  radius: number = 5000,
  language?: string
): Promise<POIResult[]> {
  return searchBusinessTypes(POI_CATEGORIES.FOOD_DRINK, location, radius, language);
}

/**
 * Clears the POI search cache
 */
export function clearPOICache(): void {
  searchCache.clear();
  console.log('POI search cache cleared');
}
