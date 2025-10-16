import { createClient } from '@supabase/supabase-js';
import { DEFAULT_FUEL_PRICES } from './types';

const isBrowser = typeof window !== 'undefined';
const supabaseUrl = isBrowser ? import.meta.env.VITE_SUPABASE_URL : process.env.SUPABASE_URL;
const supabaseAnonKey = isBrowser ? import.meta.env.VITE_SUPABASE_ANON_KEY : process.env.SUPABASE_ANON_KEY;

export const SUPABASE_ENABLED = Boolean(supabaseUrl && supabaseAnonKey);

export let supabase: any = null;
if (SUPABASE_ENABLED) {
  supabase = createClient(supabaseUrl, supabaseAnonKey);
} else {
  console.warn('Supabase is not configured. Falling back to localStorage-based local mode.');
}

// Minimal localStorage helpers for fallback mode
const TABLE_PREFIX = 'rapid-dispatch-';
const readTable = (table: string) => {
  try {
    return JSON.parse(localStorage.getItem(`${TABLE_PREFIX}${table}`) || '[]');
  } catch {
    return [];
  }
};
const writeTable = (table: string, data: any) => {
  localStorage.setItem(`${TABLE_PREFIX}${table}`, JSON.stringify(data));
};
const readSingle = (key: string) => {
  try {
    return JSON.parse(localStorage.getItem(`${TABLE_PREFIX}${key}`) || 'null');
  } catch {
    return null;
  }
};
const writeSingle = (key: string, value: any) => {
  localStorage.setItem(`${TABLE_PREFIX}${key}`, JSON.stringify(value));
};

// Authentication functions (real or fallback)
export const authService = SUPABASE_ENABLED
  ? {
      async signUp(email: string, password: string) {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        return data;
      },
      async signIn(email: string, password: string) {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        return data;
      },
      async signOut() {
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
      },
      async getCurrentUser() {
        const { data: { user }, error } = await supabase.auth.getUser();
        if (error) throw error;
        return user;
      },
      onAuthStateChange(callback: (event: string, session: any) => void) {
        return supabase.auth.onAuthStateChange(callback);
      },
    }
  : {
      async signUp(email: string, _password: string) {
        const user = { id: `local-${Date.now()}`, email };
        writeSingle('auth-user', user);
        return { user };
      },
      async signIn(email: string, _password: string) {
        const user = readSingle('auth-user');
        if (user && user.email === email) return { user };
        throw new Error('Invalid credentials (local mode)');
      },
      async signOut() {
        localStorage.removeItem(`${TABLE_PREFIX}auth-user`);
      },
      async getCurrentUser() {
        return readSingle('auth-user');
      },
      onAuthStateChange(callback: (event: string, session: any) => void) {
        // Immediately notify caller with current state and return a compatible subscription object
        const user = readSingle('auth-user');
        setTimeout(() => callback(user ? 'SIGNED_IN' : 'SIGNED_OUT', { user }), 0);
        return { data: { subscription: { unsubscribe: () => {} } } };
      },
    };

// Helper to upsert item(s) in a local table by 'id' or provided key
const upsertLocal = (table: string, items: any | any[], key = 'id') => {
  const existing = readTable(table);
  const rows = Array.isArray(items) ? items : [items];
  for (const row of rows) {
    const idx = existing.findIndex((r: any) => r[key] === row[key]);
    if (idx !== -1) existing[idx] = { ...existing[idx], ...row };
    else existing.push(row);
  }
  writeTable(table, existing);
};

// Helper to delete by id
const deleteLocal = (table: string, id: any, key = 'id') => {
  const existing = readTable(table).filter((r: any) => r[key] !== id);
  writeTable(table, existing);
};

// Runtime flag: if Supabase is enabled but the project's database schema
// doesn't contain the expected tables/columns we flip this to false and
// use localStorage-only fallback for subsequent calls to avoid spamming
// the network with failing requests.
let supabaseHealthy = true;

const isSchemaError = (err: any) => {
  const code = err?.code || err?.status || null;
  const msg = String(err?.message || err || '');
  return (
    code === 'PGRST204' ||
    code === 'PGRST205' ||
    /Could not find/i.test(msg) ||
    /schema cache/i.test(msg) ||
    /Could not find the table/i.test(msg)
  );
};

async function runWithFallback<T>(
  remoteCall: () => Promise<T>,
  fallbackCall: () => Promise<T>,
  label = 'supabase'
) {
  if (!SUPABASE_ENABLED || !supabaseHealthy) return fallbackCall();
  try {
    return await remoteCall();
  } catch (err) {
    if (isSchemaError(err)) {
      console.warn(`${label} failed due to missing schema/table; switching to local fallback`, err);
      supabaseHealthy = false;
    } else {
      console.warn(`${label} failed, falling back to localStorage`, err);
    }
    return fallbackCall();
  }
}

// Geocoding constants and cache
const geocodeCache = new Map<string, { lat: number; lon: number }>();
const SOUTH_MORAVIA_BOUNDS = { lonMin: 16.3, latMin: 48.7, lonMax: 17.2, latMax: 49.3 };
const EXPANDED_SEARCH_BOUNDS = { lonMin: 12.0, latMin: 46.0, lonMax: 24.0, latMax: 52.0 };

// Geocoding functions
const fetchPhotonCoords = async (addrToTry: string): Promise<{ lat: number; lon: number } | null> => {
  const addr = addrToTry.split('|')[0];
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
        return { lat, lon };
      }
    }
    // Second priority: results within Czech Republic
    for (const feature of data.features) {
      const coords = feature.geometry.coordinates;
      const lon = coords[0];
      const lat = coords[1];
      if (lon >= 12.0 && lon <= 18.9 && lat >= 48.5 && lat <= 51.1) {
        return { lat, lon };
      }
    }
    // Third priority: any result within expanded bounds
    const coords = data.features[0].geometry.coordinates;
    return { lat: coords[1], lon: coords[0] };
  }
  return null;
};

async function geocodeAddress(address: string, language: string): Promise<{ lat: number; lon: number }> {
    // Clean up malformed addresses that might have timestamps or other data appended
    const cleanAddress = address.split('|')[0].trim();

    // Log if address was cleaned
    if (cleanAddress !== address) {
        console.warn('Cleaned malformed address:', address, '->', cleanAddress);
    }

    const cacheKey = `${cleanAddress}_${language}`;
    if (geocodeCache.has(cacheKey)) return geocodeCache.get(cacheKey)!;

    try {
        // Try Nominatim first (more reliable for Czech addresses)
        console.log('Trying Nominatim for address:', cleanAddress);
        const nominatimResult = await geocodeWithNominatim(cleanAddress);
        if (nominatimResult) {
            geocodeCache.set(cacheKey, nominatimResult);
            return nominatimResult;
        }

        // Fallback to Photon
        console.log('Nominatim failed, trying Photon for address:', cleanAddress);
        const photonResult = await fetchPhotonCoords(cleanAddress);
        if (photonResult) {
            geocodeCache.set(cacheKey, photonResult);
            return photonResult;
        }

        // Fallback to Google Maps if API key available
        const googleMapsApiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
        if (googleMapsApiKey) {
            console.log('Photon failed, trying Google Maps for address:', cleanAddress);
            const proxyUrl = 'https://corsproxy.io/?';
            const geocodingUrl = `${proxyUrl}https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(cleanAddress)}&key=${googleMapsApiKey}&language=${language}&region=cz&bounds=${SOUTH_MORAVIA_BOUNDS.latMin},${SOUTH_MORAVIA_BOUNDS.lonMin}|${SOUTH_MORAVIA_BOUNDS.latMax},${SOUTH_MORAVIA_BOUNDS.lonMax}`;

            const response = await fetch(geocodingUrl);
            if (response.ok) {
                const data = await response.json();
                if (data.status === 'OK' && data.results && data.results.length > 0) {
                    const result = data.results[0];
                    const location = result.geometry.location;
                    const coords = { lat: location.lat, lon: location.lng };
                    geocodeCache.set(cacheKey, coords);
                    return coords;
                }
            }
        }

        throw new Error(`All geocoding services failed for address: ${cleanAddress}`);
    } catch (error) {
        console.error("Geocoding error:", error);
        throw error;
    }
}

function isInSouthMoravia(lat: number, lon: number): boolean {
  return lon >= SOUTH_MORAVIA_BOUNDS.lonMin && lon <= SOUTH_MORAVIA_BOUNDS.lonMax &&
         lat >= SOUTH_MORAVIA_BOUNDS.latMin && lat <= SOUTH_MORAVIA_BOUNDS.latMax;
}

function isInCzechRepublic(lat: number, lon: number): boolean {
  // Approximate bounds for Czech Republic
  return lon >= 12.0 && lon <= 18.9 && lat >= 48.5 && lat <= 51.1;
}

const geocodeWithNominatim = async (address: string): Promise<{ lat: number; lon: number }> => {
  const tryGeocode = async (query: string): Promise<{ lat: number; lon: number } | null> => {
    const proxyUrl = 'https://corsproxy.io/?';
    const nominatimUrl = `${proxyUrl}https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=10`;

    try {
      const response = await fetch(nominatimUrl);
      if (!response.ok) {
        console.warn(`Nominatim API error: ${response.status} for query: ${query}`);
        return null;
      }
      const data = await response.json();

      if (data && Array.isArray(data) && data.length > 0) {
        console.log(`Nominatim found ${data.length} results for "${query}"`);
        // First priority: results within South Moravia bounds
        for (const result of data) {
          const lat = parseFloat(result.lat);
          const lon = parseFloat(result.lon);
          if (isInSouthMoravia(lat, lon)) {
            console.log(`Using South Moravia result: ${lat}, ${lon}`);
            return { lat, lon };
          }
        }
        // Second priority: results within Czech Republic
        for (const result of data) {
          const lat = parseFloat(result.lat);
          const lon = parseFloat(result.lon);
          if (isInCzechRepublic(lat, lon)) {
            console.log(`Using Czech Republic result: ${lat}, ${lon}`);
            return { lat, lon };
          }
        }
        // Third priority: any result
        const result = data[0];
        console.log(`Using any result: ${result.lat}, ${result.lon}`);
        return { lat: parseFloat(result.lat), lon: parseFloat(result.lon) };
      }
      console.warn(`No results from Nominatim for "${query}"`);
      return null;
    } catch (error) {
      console.error(`Nominatim fetch error for "${query}":`, error);
      return null;
    }
  };

  try {
    // Try full address first
    let result = await tryGeocode(address);
    if (result) return result;

    // Try simplified address (first part before comma)
    const simplified = address.split(',')[0].trim();
    if (simplified !== address) {
      console.log('Trying simplified address:', simplified);
      result = await tryGeocode(simplified);
      if (result) return result;
    }

    // Try the city part (usually the third or second part in Czech addresses)
    const parts = address.split(',').map(p => p.trim());
    if (parts.length >= 3) {
      // Try the third part (city)
      const cityCandidate = parts[2];
      if (cityCandidate && !cityCandidate.includes('okres') && !cityCandidate.includes('kraj')) {
        console.log('Trying city candidate:', cityCandidate);
        result = await tryGeocode(cityCandidate);
        if (result) return result;
      }
      // Try the second part
      const secondCandidate = parts[1];
      if (secondCandidate && secondCandidate !== simplified) {
        console.log('Trying second candidate:', secondCandidate);
        result = await tryGeocode(secondCandidate);
        if (result) return result;
      }
    }

    // Try just the city name (remove numbers and special chars)
    const cityMatch = address.match(/^([^,0-9]+)/);
    if (cityMatch) {
      const cityOnly = cityMatch[1].trim();
      if (cityOnly !== simplified && cityOnly !== address) {
        console.log('Trying city only:', cityOnly);
        result = await tryGeocode(cityOnly);
        if (result) return result;
      }
    }

    console.error(`All geocoding attempts failed for address: ${address}`);
    return null;
  } catch (error) {
    console.error("Nominatim geocoding error:", error);
    return null;
  }
}

// Helper functions for data operations (real supabase or local fallback)
const supabaseService: any = SUPABASE_ENABLED ? {
      // --- Helpers to map between app's camelCase and DB snake_case ---
       _toDbVehicle(v: any) {
         return {
           id: v.id,
           name: v.name,
           driver_id: v.driverId ?? null,
           license_plate: v.licensePlate ?? null,
           type: v.type,
           status: v.status,
           location: v.location ?? null,
           capacity: v.capacity ?? null,
           mileage: v.mileage ?? null,
           free_at: v.freeAt ?? null,
           service_interval: v.serviceInterval ?? null,
           last_service_mileage: v.lastServiceMileage ?? null,
           technical_inspection_expiry: v.technicalInspectionExpiry ?? null,
           vignette_expiry: v.vignetteExpiry ?? null,
            fuel_type: v.fuelType ? v.fuelType.charAt(0).toUpperCase() + v.fuelType.slice(1).toLowerCase() : null,
           fuel_consumption: v.fuelConsumption ?? null,
           phone: v.phone ?? null,
           email: v.email ?? null,
         };
       },
       _fromDbVehicle(db: any) {
         return {
           id: db.id,
           name: db.name,
           driverId: db.driver_id ?? null,
           licensePlate: db.license_plate ?? null,
           type: db.type,
           status: db.status,
           location: db.location ?? null,
           capacity: db.capacity ?? null,
           mileage: db.mileage ?? null,
           freeAt: db.free_at ?? undefined,
           serviceInterval: db.service_interval ?? null,
           lastServiceMileage: db.last_service_mileage ?? null,
           technicalInspectionExpiry: db.technical_inspection_expiry ?? null,
           vignetteExpiry: db.vignette_expiry ?? null,
            fuelType: db.fuel_type ? db.fuel_type.toUpperCase() : null,
           fuelConsumption: db.fuel_consumption ?? null,
           phone: db.phone ?? null,
           email: db.email ?? null,
         };
       },

      _toDbTariff(t: any) {
        return {
          id: 1,
          starting_fee: t.startingFee,
          price_per_km_car: t.pricePerKmCar,
          price_per_km_van: t.pricePerKmVan,
          flat_rates: t.flatRates || [],
          time_based_tariffs: t.timeBasedTariffs || [],
        };
      },
      _fromDbTariff(db: any) {
        if (!db) return null;
        return {
          startingFee: db.starting_fee,
          pricePerKmCar: db.price_per_km_car,
          pricePerKmVan: db.price_per_km_van,
          flatRates: db.flat_rates || [],
          timeBasedTariffs: db.time_based_tariffs || [],
        };
      },

      _toDbFuelPrices(fp: any) {
        return { id: 1, diesel: fp.DIESEL, petrol: fp.PETROL };
      },
       _fromDbFuelPrices(db: any) {
          if (!db) return null;
          return { DIESEL: db.diesel, PETROL: db.petrol };
        },

          _toDbRideLog(r: any) {
             const result: any = {
               id: r.id,
               timestamp: r.timestamp,
               vehicle_name: r.vehicleName ?? null,
               vehicle_license_plate: r.vehicleLicensePlate ?? null,
               driver_name: r.driverName ?? null,
               vehicle_type: r.vehicleType ?? null,
               customer_name: r.customerName,
               ride_type: (r.rideType ?? 'BUSINESS').toLowerCase(),
               customer_phone: r.customerPhone,
               stops: r.stops,
               passengers: r.passengers,
               pickup_time: r.pickupTime,
                status: r.status, // Keep original status format
               vehicle_id: r.vehicleId ?? null,
               notes: r.notes ?? null,
               estimated_price: r.estimatedPrice ?? null,
               estimated_pickup_timestamp: r.estimatedPickupTimestamp || null,
               estimated_completion_timestamp: r.estimatedCompletionTimestamp || null,
                fuel_cost: r.fuelCost ?? null,
               distance: r.distance ?? null,
              };

              // Add timestamp fields if they exist
              if (r.acceptedAt) result.accepted_at = r.acceptedAt;
              if (r.startedAt) result.started_at = r.startedAt;
              if (r.completedAt) result.completed_at = r.completedAt;

              return result;
         },
        _fromDbRideLog(db: any) {
            return {
              id: db.id,
              timestamp: db.timestamp,
             vehicleName: db.vehicle_name ?? null,
            vehicleLicensePlate: db.vehicle_license_plate ?? null,
            driverName: db.driver_name ?? null,
            vehicleType: db.vehicle_type ?? null,
            customerName: db.customer_name,
            rideType: (db.ride_type ?? 'business').toUpperCase(),
            customerPhone: db.customer_phone,
            stops: db.stops,
            passengers: db.passengers,
            pickupTime: db.pickup_time,
             status: (db.status || '').toUpperCase().replace(/_/g, '_'),
            vehicleId: db.vehicle_id ?? null,
            notes: db.notes ?? null,
            estimatedPrice: db.estimated_price ?? null,
              estimatedPickupTimestamp: db.estimated_pickup_timestamp,
              estimatedCompletionTimestamp: db.estimated_completion_timestamp,
              fuelCost: db.fuel_cost ?? null,
            distance: db.distance ?? null,
            acceptedAt: db.accepted_at ?? null,
            startedAt: db.started_at ?? null,
            completedAt: db.completed_at ?? null,
          };
       },

      // Vehicles
      async getVehicles() {
        const { data, error } = await supabase.from('vehicles').select('*');
        if (error) throw error;
        return (data || []).map((d: any) => this._fromDbVehicle(d));
      },
      async updateVehicles(vehicles: any[]) {
        const dbRows = vehicles.map(v => this._toDbVehicle(v));
        const { error } = await supabase.from('vehicles').upsert(dbRows, { onConflict: 'id' });
        if (error) throw error;
      },
      async deleteVehicle(vehicleId: number) {
        const { error } = await supabase.from('vehicles').delete().eq('id', vehicleId);
        if (error) throw error;
      },
      async addVehicle(vehicle: any) {
        const { error } = await supabase.from('vehicles').upsert(this._toDbVehicle(vehicle), { onConflict: 'id' });
        if (error) throw error;
      },

      // People
      async getPeople() {
        const { data, error } = await supabase.from('people').select('*');
        if (error) throw error;
        return data || [];
      },
      async updatePeople(people: any[]) {
        const { error } = await supabase.from('people').upsert(people, { onConflict: 'id' });
        if (error) throw error;
      },
      async addPerson(person: any) {
        const { error } = await supabase.from('people').insert(person);
        if (error) throw error;
      },
      async deletePerson(personId: number) {
        const { error } = await supabase.from('people').delete().eq('id', personId);
        if (error) throw error;
      },

       // Ride Logs
        async getRideLogs() {
          const { data, error } = await supabase.from('ride_logs').select('*');
          if (error) throw error;
          return (data || []).map((d: any) => this._fromDbRideLog(d));
        },
        async getRideLogsByVehicle(vehicleId: number, status?: string, limit?: number) {
          let query = supabase.from('ride_logs').select('*').eq('vehicle_id', vehicleId);
          if (status) {
            query = query.eq('status', status);
          }
          query = query.order('timestamp', { ascending: false });
          if (limit) {
            query = query.limit(limit);
          }
          const { data, error } = await query;
          if (error) throw error;
          return (data || []).map((d: any) => this._fromDbRideLog(d));
        },
          async addRideLog(rideLog: any) {
            const dbData = this._toDbRideLog(rideLog);
            console.log('addRideLog: sending to database:', dbData);
            if (SUPABASE_ENABLED) {
              const { error } = await supabase.from('ride_logs').upsert(dbData, { onConflict: 'id' });
              if (error) {
                console.error('addRideLog error:', error);
                throw error;
              }
              console.log('addRideLog: successfully saved to Supabase');
            } else {
              console.log('addRideLog: Supabase not enabled, using localStorage');
            }
            upsertLocal('ride-log', rideLog);
          },
        async updateRideLogs(rideLogs: any[]) {
          if (SUPABASE_ENABLED) {
            try {
              const dbRows = rideLogs.map(r => this._toDbRideLog(r));
              const { error } = await supabase.from('ride_logs').upsert(dbRows, { onConflict: 'id' });
              if (error) throw error;
            } catch (err) {
              console.warn('Failed to update ride logs in supabase, updating local:', err);
            }
          }
          writeTable('ride-log', rideLogs);
        },
        async deleteRideLog(rideLogId: string) {
          if (SUPABASE_ENABLED) {
            try {
              const { error } = await supabase.from('ride_logs').delete().eq('id', rideLogId);
              if (error) throw error;
            } catch (err) {
              console.warn('Failed to delete ride log from supabase, deleting from local:', err);
            }
          }
          deleteLocal('ride-log', rideLogId, 'id');
        },

      // Notifications
      async getNotifications() {
        const { data, error } = await supabase.from('notifications').select('*');
        if (error) throw error;
        return data || [];
      },
      async addNotification(notification: any) {
        const { error } = await supabase.from('notifications').insert(notification);
        if (error) throw error;
      },
      async updateNotifications(notifications: any[]) {
        const { error } = await supabase.from('notifications').upsert(notifications, { onConflict: 'id' });
        if (error) throw error;
      },

      // Tariff
      async getTariff() {
        const { data, error } = await supabase.from('tariff').select('*').single();
        if (error) throw error;
        return this._fromDbTariff(data);
      },
      async updateTariff(tariff: any) {
        const dbRow = this._toDbTariff(tariff);
        const { error } = await supabase.from('tariff').upsert(dbRow);
        if (error) throw error;
      },

      // Fuel Prices
      async getFuelPrices() {
        try {
          const { data, error } = await supabase.from('fuel_prices').select('*').single();
          if (error) throw error;
          return this._fromDbFuelPrices(data);
        } catch (err) {
          console.warn('Failed to load fuel prices from supabase, falling back to local:', err);
          return readSingle('fuel-prices') || DEFAULT_FUEL_PRICES;
        }
      },
      async updateFuelPrices(fuelPrices: any) {
        if (SUPABASE_ENABLED) {
          try {
            const dbRow = this._toDbFuelPrices(fuelPrices);
            const { error } = await supabase.from('fuel_prices').upsert(dbRow);
            if (error) throw error;
            return;
          } catch (err) {
            console.warn('Failed to save fuel prices to supabase, falling back to local:', err);
          }
        }
        writeSingle('fuel-prices', fuelPrices);
      },

      // Messaging App
      async getMessagingApp() {
        const { data, error } = await supabase.from('messaging_settings').select('*').single();
        if (error) throw error;
        return data?.app || 'SMS';
      },
      async updateMessagingApp(app: string) {
        const { error } = await supabase.from('messaging_settings').upsert({ app, id: 1 });
        if (error) throw error;
      },

      // SMS Messages (outgoing/incoming records)
      async getSmsMessages() {
        return runWithFallback(
          async () => {
            const { data, error } = await supabase.from('sms_messages').select('*').order('timestamp', { ascending: false });
            if (error) throw error;
            return data || [];
          },
          async () => readTable('sms-messages'),
          'Supabase sms_messages'
        );
      },
      async addSmsMessage(message: any) {
        return runWithFallback(
          async () => {
            const { error } = await supabase.from('sms_messages').insert(message);
            if (error) throw error;
          },
          async () => {
            const existing = readTable('sms-messages');
            existing.unshift(message);
            writeTable('sms-messages', existing);
          },
          'Supabase addSmsMessage'
        );
      },
      async updateSmsMessages(messages: any[]) {
        return runWithFallback(
          async () => {
            const { error } = await supabase.from('sms_messages').upsert(messages, { onConflict: 'id' });
            if (error) throw error;
          },
          async () => writeTable('sms-messages', messages),
          'Supabase updateSmsMessages'
        );
      },

      // Company Info
      async getCompanyInfo() {
        const { data, error } = await supabase.from('company_info').select('*').single();
        if (error) throw error;
        return data;
      },
      async updateCompanyInfo(companyInfo: any) {
        const { error } = await supabase.from('company_info').upsert({ ...companyInfo, id: 1 });
        if (error) throw error;
      },

      // Gamification
      async getDriverScores() {
        const { data, error } = await supabase.from('driver_scores').select('*').order('total_score', { ascending: false });
        if (error) throw error;
        return data || [];
      },
      async updateDriverScore(driverId: number, scoreData: any) {
        const { error } = await supabase.from('driver_scores').upsert({ driver_id: driverId, ...scoreData, updated_at: new Date().toISOString() }, { onConflict: 'driver_id' });
        if (error) throw error;
      },
      async getDriverAchievements(driverId: number) {
        const { data, error } = await supabase.from('achievements').select('*').eq('driver_id', driverId);
        if (error) throw error;
        return data || [];
      },
      async addAchievement(achievement: any) {
        const { error } = await supabase.from('achievements').insert(achievement);
        if (error) throw error;
      },
      async getDriverStats(driverId: number) {
        const { data, error } = await supabase.from('driver_stats').select('*').eq('driver_id', driverId).single();
        if (error && error.code !== 'PGRST116') throw error;
        return data;
      },
      async updateDriverStats(driverId: number, stats: any) {
        const { error } = await supabase.from('driver_stats').upsert({ driver_id: driverId, ...stats, updated_at: new Date().toISOString() }, { onConflict: 'driver_id' });
        if (error) throw error;
      },

      // Manual Entries
      async getManualEntries(driverId?: number) {
        let query = supabase.from('manual_entries').select('*').order('created_at', { ascending: false });
        if (driverId) {
          query = query.eq('driver_id', driverId);
        }
        const { data, error } = await query;
        if (error) throw error;
        return data || [];
      },
      async addManualEntry(entry: any) {
        const { error } = await supabase.from('manual_entries').insert(entry);
        if (error) throw error;
      },
      async updateManualEntry(entryId: string, entry: any) {
        const { error } = await supabase.from('manual_entries').update(entry).eq('id', entryId);
        if (error) throw error;
      },
      async deleteManualEntry(entryId: string) {
        const { error } = await supabase.from('manual_entries').delete().eq('id', entryId);
        if (error) throw error;
      },

      // User Settings
      async getUserSettings(userId: string) {
        return runWithFallback(
          async () => {
            const { data, error } = await supabase.from('user_settings').select('*').eq('user_id', userId).single();
            if (error && error.code !== 'PGRST116') throw error;
            return data;
          },
          async () => {
            // fallback: read from local user-settings table
            const all = readTable('user-settings');
            return all.find((s: any) => String(s.user_id) === String(userId)) || null;
          },
          'Supabase user_settings'
        );
      },
      async updateUserSettings(userId: string, settings: any) {
        return runWithFallback(
          async () => {
            const { error } = await supabase.from('user_settings').upsert({ user_id: userId, ...settings, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
            if (error) throw error;
          },
          async () => upsertLocal('user-settings', { user_id: userId, ...settings, updated_at: new Date().toISOString() }, 'user_id'),
          'Supabase updateUserSettings'
        );
      },
    } : {
      // LocalStorage fallback implementations
      async getVehicles() {
        return readTable('vehicles');
      },
      async updateVehicles(vehicles: any[]) {
        writeTable('vehicles', vehicles);
      },
      async deleteVehicle(vehicleId: number) {
        deleteLocal('vehicles', vehicleId);
      },
      async addVehicle(vehicle: any) {
        upsertLocal('vehicles', vehicle);
      },

      // People
      async getPeople() {
        return readTable('people');
      },
      async updatePeople(people: any[]) {
        writeTable('people', people);
      },
      async addPerson(person: any) {
        upsertLocal('people', person);
      },
      async deletePerson(personId: number) {
        deleteLocal('people', personId);
      },

      // Ride Logs
      async getRideLogs() {
        return readTable('ride-log');
      },
      async addRideLog(rideLog: any) {
        upsertLocal('ride-log', rideLog);
      },
      async updateRideLogs(rideLogs: any[]) {
        writeTable('ride-log', rideLogs);
      },
      async deleteRideLog(rideLogId: string) {
        deleteLocal('ride-log', rideLogId, 'id');
      },

      // Notifications
      async getNotifications() {
        return readTable('notifications');
      },
      async addNotification(notification: any) {
        const existing = readTable('notifications');
        existing.unshift(notification);
        writeTable('notifications', existing);
      },
      async updateNotifications(notifications: any[]) {
        writeTable('notifications', notifications);
      },

      // Tariff
      async getTariff() {
        return readSingle('tariff');
      },
      async updateTariff(tariff: any) {
        writeSingle('tariff', tariff);
      },

      // Fuel Prices
      async getFuelPrices() {
        return readSingle('fuel-prices');
      },
      async updateFuelPrices(fuelPrices: any) {
        writeSingle('fuel-prices', fuelPrices);
      },

      // Messaging App
      async getMessagingApp() {
        const ms = readSingle('messaging-app');
        return (ms && ms.app) || 'SMS';
      },
      async updateMessagingApp(app: string) {
        writeSingle('messaging-app', { app });
      },

      // SMS Messages (local fallback)
      async getSmsMessages() {
        return readTable('sms-messages');
      },
      async addSmsMessage(message: any) {
        const existing = readTable('sms-messages');
        existing.unshift(message);
        writeTable('sms-messages', existing);
      },
      async updateSmsMessages(messages: any[]) {
        writeTable('sms-messages', messages);
      },

      // Company Info
      async getCompanyInfo() {
        return readSingle('company-info');
      },
      async updateCompanyInfo(companyInfo: any) {
        writeSingle('company-info', companyInfo);
      },

      // Gamification
      async getDriverScores() {
        return readTable('driver-scores');
      },
      async updateDriverScore(driverId: number, scoreData: any) {
        upsertLocal('driver-scores', { driver_id: driverId, ...scoreData }, 'driver_id');
      },
      async getDriverAchievements(driverId: number) {
        return readTable('achievements').filter((a: any) => a.driver_id === driverId);
      },
      async addAchievement(achievement: any) {
        const existing = readTable('achievements');
        existing.push(achievement);
        writeTable('achievements', existing);
      },
      async getDriverStats(driverId: number) {
        const stats = readTable('driver-stats').find((s: any) => s.driver_id === driverId) || null;
        return stats;
      },
      async updateDriverStats(driverId: number, stats: any) {
        upsertLocal('driver-stats', { driver_id: driverId, ...stats }, 'driver_id');
      },

      // Manual Entries
      async getManualEntries(driverId?: number) {
        const entries = readTable('manual-entries');
        if (driverId) {
          return entries.filter((e: any) => e.driver_id === driverId);
        }
        return entries;
      },
      async addManualEntry(entry: any) {
        const existing = readTable('manual-entries');
        existing.push(entry);
        writeTable('manual-entries', existing);
      },
      async updateManualEntry(entryId: string, entry: any) {
        const existing = readTable('manual-entries');
        const index = existing.findIndex((e: any) => e.id === entryId);
        if (index !== -1) {
          existing[index] = { ...existing[index], ...entry };
          writeTable('manual-entries', existing);
        }
      },
      async deleteManualEntry(entryId: string) {
        const existing = readTable('manual-entries').filter((e: any) => e.id !== entryId);
        writeTable('manual-entries', existing);
      },

      // User Settings
      async getUserSettings(userId: string) {
        const settings = readTable('user-settings').find((s: any) => s.user_id === userId) || null;
        return settings;
      },
      async updateUserSettings(userId: string, settings: any) {
        upsertLocal('user-settings', { user_id: userId, ...settings }, 'user_id');
      },
    };

export { supabaseService, geocodeAddress };
