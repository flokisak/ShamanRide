import { createClient } from '@supabase/supabase-js';
import { DEFAULT_FUEL_PRICES, RideStatus } from '../types';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables in Node.js
const isBrowser = typeof window !== 'undefined';
if (!isBrowser) {
  dotenv.config({ path: path.join(process.cwd(), '..', '.env') });
}
const supabaseUrl = isBrowser ? import.meta.env.VITE_SUPABASE_URL : process.env.SUPABASE_URL;
const supabaseAnonKey = isBrowser ? import.meta.env.VITE_SUPABASE_ANON_KEY : process.env.SUPABASE_ANON_KEY;
const supabaseServiceKey = isBrowser ? import.meta.env.VITE_SUPABASE_SERVICE_KEY : process.env.SUPABASE_SERVICE_KEY;



export const SUPABASE_ENABLED = Boolean(supabaseUrl && (supabaseAnonKey || supabaseServiceKey));

let supabase: any = null;
if (SUPABASE_ENABLED) {
  // Use service key if available (for driver app), otherwise anon key
  const key = supabaseServiceKey || supabaseAnonKey;
  if (isBrowser) {
    // Reuse a single Supabase client instance across bundles to avoid
    // multiple GoTrueClient instances which may conflict when sharing
    // the same storage key in the browser.
    const GLOBAL_KEY = '__shamanride_supabase_client__';
    (window as any)[GLOBAL_KEY] = (window as any)[GLOBAL_KEY] || createClient(supabaseUrl, key);
    supabase = (window as any)[GLOBAL_KEY];
  } else {
    supabase = createClient(supabaseUrl, key);
  }
} else {
  console.warn('Supabase is not configured. Falling back to localStorage-based local mode.');
}

export { supabase };

// Keep a cached access token on the window object so other modules (sockets)
// can read it synchronously without calling getSession() repeatedly.
if (typeof window !== 'undefined' && supabase && supabase.auth) {
  try {
    // Initialize cache from current session (non-blocking)
    supabase.auth.getSession().then(({ data: { session } }) => {
      (window as any).__shamanride_access_token = session?.access_token ?? null;
    }).catch(() => {
      (window as any).__shamanride_access_token = null;
    });

    // Update the cache on auth state changes
    supabase.auth.onAuthStateChange((_event: string, session: any) => {
      (window as any).__shamanride_access_token = session?.access_token ?? null;
    });
  } catch (err) {
    // ignore
  }
}

export function getCachedAccessToken() {
  if (typeof window === 'undefined') return null;
  return (window as any).__shamanride_access_token ?? null;
}

// Rate-limited, defensive refresh helper.
// Avoids spamming Supabase /auth/token when multiple components attempt refreshes.
export async function safeRefreshSession(opts?: { force?: boolean, minIntervalMs?: number }) {
  if (!SUPABASE_ENABLED || !supabase || !supabase.auth) return null;

  const minIntervalMs = opts?.minIntervalMs ?? 30 * 1000; // default 30s between refresh attempts
  if (typeof window === 'undefined') return null;

  (window as any).__shamanride_refresh_lock__ = (window as any).__shamanride_refresh_lock__ || { lastAttempt: 0, failures: 0 };
  const lock = (window as any).__shamanride_refresh_lock__;
  const now = Date.now();

  if (!opts?.force && now - (lock.lastAttempt || 0) < minIntervalMs) {
    // Too soon to attempt another refresh
    return null;
  }

  lock.lastAttempt = now;

  try {
    // Try to get the current session first
    const { data: { session: currentSession } } = await supabase.auth.getSession();
    if (!currentSession?.refresh_token) {
      console.warn('safeRefreshSession: No refresh token available');
      return null;
    }

    // Use our proxy endpoint to avoid CORS issues
    const proxyResponse = await fetch('/api/auth-refresh', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        refresh_token: currentSession.refresh_token
      })
    });

    if (!proxyResponse.ok) {
      const errorData = await proxyResponse.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP ${proxyResponse.status}`);
    }

    const proxyData = await proxyResponse.json();

    if (!proxyData.success || !proxyData.data) {
      throw new Error(proxyData.error || 'Refresh failed');
    }

    // Update the Supabase client with the new session data
    const newSession = {
      access_token: proxyData.data.access_token,
      refresh_token: proxyData.data.refresh_token || currentSession.refresh_token,
      expires_at: proxyData.data.expires_at,
      user: proxyData.data.user || currentSession.user
    };

    // Manually update the session in Supabase client
    await supabase.auth.setSession(newSession);

    lock.failures = 0;

    // Update cached token
    try {
      (window as any).__shamanride_access_token = newSession.access_token;
    } catch (e) {
      // ignore
    }

    return { data: { session: newSession } };
  } catch (err) {
    lock.failures = (lock.failures || 0) + 1;
    // Exponential backoff applied by callers via minIntervalMs if needed
    console.warn('safeRefreshSession: refresh failed', err);
    return null;
  }
}

// Synchronously return cached token or attempt a safe refresh if forceRefresh is true.
export async function safeGetAccessToken({ forceRefresh = false } = {}) {
  const cached = getCachedAccessToken();
  if (cached && !forceRefresh) return cached;
  // Try to refresh in a defensive way (respect caller's forceRefresh flag)
  await safeRefreshSession({ force: forceRefresh });
  return getCachedAccessToken();
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
    /Could not find the table/i.test(msg) ||
    /NetworkError/i.test(msg) ||
    /fetch resource/i.test(msg)
  );
};

async function runWithFallback<T>(
  remoteCall: () => Promise<T>,
  fallbackCall: () => Promise<T>,
  label = 'supabase'
) {
  if (!SUPABASE_ENABLED || !supabaseHealthy) return fallbackCall();
  try {
    const result = await remoteCall();
    supabaseHealthy = true; // Reset to healthy on success
    return result;
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

// Helper functions for data operations (real supabase or local fallback)
export const supabaseService = SUPABASE_ENABLED
  ? {
      // --- Helpers to map between app's camelCase and DB snake_case ---
       _toDbVehicle(v: any) {
         return {
           id: v.id,
           name: v.name,
           driver_id: v.driverId ?? null,
           license_plate: v.licensePlate ?? null,
           type: v.type,
            vehicle_status: v.status,
           location: v.location ?? null,
           capacity: v.capacity ?? null,
           mileage: v.mileage ?? null,
           free_at: v.freeAt ?? null,
           service_interval: v.serviceInterval ?? null,
           last_service_mileage: v.lastServiceMileage ?? null,
           technical_inspection_expiry: v.technicalInspectionExpiry ?? null,
           vignette_expiry: v.vignetteExpiry ?? null,
            fuel_type: v.fuelType ?? null,
            fuel_consumption: v.fuelConsumption ?? null,
            phone: v.phone ?? null,
            email: v.email ?? null,
            shift_start: v.shiftStart ?? null,
            shift_end: v.shiftEnd ?? null,
            shift_start_odo: v.shiftStartOdo ?? null,
            shift_end_odo: v.shiftEndOdo ?? null,
            last_location_update: v.lastLocationUpdate ?? null,
          };
       },
       _fromDbVehicle(db: any) {
         return {
           id: db.id,
           name: db.name,
           driverId: db.driver_id ?? null,
           licensePlate: db.license_plate ?? null,
           type: db.type,
            status: db.vehicle_status?.toUpperCase(),
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
            shiftStart: db.shift_start ?? null,
            shiftEnd: db.shift_end ?? null,
            shiftStartOdo: db.shift_start_odo ?? null,
            shiftEndOdo: db.shift_end_odo ?? null,
            lastLocationUpdate: db.last_location_update ?? null,
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
                 status: r.status.toLowerCase(),
              vehicle_id: r.vehicleId ?? null,
              notes: r.notes ?? null,
              estimated_price: r.estimatedPrice ?? null,
              estimated_pickup_timestamp: r.estimatedPickupTimestamp || null,
              estimated_completion_timestamp: r.estimatedCompletionTimestamp || null,
                fuel_cost: r.fuelCost ?? null,
               distance: r.distance ?? null,
               payment: r.payment ?? null,
             };

             // Add timestamp fields if they exist
             if (r.acceptedAt) result.accepted_at = r.acceptedAt;
             if (r.startedAt) result.started_at = r.startedAt;
             if (r.completedAt) result.completed_at = r.completedAt;

             // Only include navigation_url if it exists (to avoid schema errors)
             if (r.navigationUrl) {
               result.navigation_url = r.navigationUrl;
             }

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
              status: (db.status || '').toUpperCase().replace(/ /g, '_') as RideStatus,
            vehicleId: db.vehicle_id ?? null,
            notes: db.notes ?? null,
            estimatedPrice: db.estimated_price ?? null,
              estimatedPickupTimestamp: db.estimated_pickup_timestamp,
              estimatedCompletionTimestamp: db.estimated_completion_timestamp,
              fuelCost: db.fuel_cost ?? null,
             distance: db.distance ?? null,
             payment: db.payment ?? null,
              acceptedAt: db.accepted_at ? new Date(db.accepted_at).getTime() : null,
              startedAt: db.started_at ? new Date(db.started_at).getTime() : null,
              completedAt: db.completed_at ? new Date(db.completed_at).getTime() : null,
             navigationUrl: db.navigation_url ?? null,
           };
       },

      // Vehicles
      async getVehicles() {
        const { data, error } = await supabase.from('vehicles').select('*');
        if (error) throw error;
        console.log('Fetched vehicles from DB:', data);
        const mapped = (data || []).map((d: any) => this._fromDbVehicle(d));
        console.log('Mapped vehicles:', mapped);
        return mapped;
      },
      async updateVehicles(vehicles: any[], options?: { excludeStatus?: boolean; excludeMileage?: boolean; excludeShiftTimes?: boolean; excludeLastLocationUpdate?: boolean }) {
        const dbRows = vehicles.map(v => {
          const dbVehicle = this._toDbVehicle(v);
          if (options?.excludeStatus || options?.excludeMileage || options?.excludeShiftTimes || options?.excludeLastLocationUpdate) {
            // Remove specified fields from the update to preserve changes from other sources
            const { vehicle_status, updated_at, mileage, shift_start, shift_end, last_location_update, ...vehicleWithoutExcluded } = dbVehicle;
            const result: any = { ...vehicleWithoutExcluded };
            if (!options?.excludeStatus) {
              result.vehicle_status = vehicle_status;
              result.updated_at = updated_at;
            }
            if (!options?.excludeMileage) {
              result.mileage = mileage;
            }
            if (!options?.excludeShiftTimes) {
              result.shift_start = shift_start;
              result.shift_end = shift_end;
            }
            if (!options?.excludeLastLocationUpdate) {
              result.last_location_update = last_location_update;
            }
            return result;
          }
          return dbVehicle;
        });

        console.log('Updating vehicles with data:', JSON.stringify(dbRows, null, 2));

        // Try individual updates instead of bulk upsert to isolate issues
        for (const dbRow of dbRows) {
          try {
            const { error } = await supabase.from('vehicles').upsert(dbRow);
            if (error) {
              console.error('Error updating vehicle:', dbRow.id, error);
              throw error;
            }
          } catch (vehicleError) {
            console.error('Failed to update vehicle:', dbRow.id, vehicleError);
            throw vehicleError;
          }
        }
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
         async getRideLogs(options?: { dateFrom?: string; dateTo?: string }) {
           let query = supabase.from('ride_logs').select('*');
           if (options) {
             if (options.dateFrom) {
               // Convert ISO string to Unix timestamp (milliseconds)
               const dateFromTimestamp = new Date(options.dateFrom).getTime();
               query = query.gte('timestamp', dateFromTimestamp);
             }
             if (options.dateTo) {
               // Convert ISO string to Unix timestamp (milliseconds)
               const dateToTimestamp = new Date(options.dateTo).getTime();
               query = query.lte('timestamp', dateToTimestamp);
             }
           } // if no options, fetch all
           const { data, error } = await query;
           if (error) throw error;
           return (data || []).map((d: any) => this._fromDbRideLog(d));
         },
         async getRideLogsByVehicle(vehicleId: number, status?: string, limit?: number) {
           let query = supabase.from('ride_logs').select('*').eq('vehicle_id', vehicleId);
           if (status) {
             query = query.eq('status', status.toLowerCase());
           }
           if (limit) {
             query = query.limit(limit);
           }
           query = query.order('timestamp', { ascending: false });
           const { data, error } = await query;
           if (error) throw error;
           return (data || []).map((d: any) => this._fromDbRideLog(d));
         },
          async addRideLog(rideLog: any) {
            if (SUPABASE_ENABLED) {
              const { error } = await supabase.from('ride_logs').upsert(this._toDbRideLog(rideLog), { onConflict: 'id' });
              if (error) throw error;
              console.log('addRideLog: successfully saved to Supabase');
              // Note: Real-time postgres_changes subscription handles notifications automatically
            }
            upsertLocal('ride-log', rideLog);
          },
         async updateRideLogs(rideLogs: any[]) {
           await runWithFallback(
             async () => {
               const dbRows = rideLogs.map(r => this._toDbRideLog(r));
               const { error } = await supabase.from('ride_logs').upsert(dbRows, { onConflict: 'id' });
               if (error) throw error;
             },
             async () => {}, // no-op
             'updateRideLogs'
           );
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
        return runWithFallback(
          async () => {
            const { data, error } = await supabase.from('notifications').select('*');
            if (error) throw error;
            return data || [];
          },
          async () => readTable('notifications'),
          'Supabase notifications'
        );
      },
      async addNotification(notification: any) {
        return runWithFallback(
          async () => {
            // Remove messageKey if it doesn't exist in the database
            const { messageKey, ...notificationData } = notification;
            const { error } = await supabase.from('notifications').insert(notificationData);
            if (error) throw error;
          },
          async () => {
            const existing = readTable('notifications');
            existing.unshift(notification);
            writeTable('notifications', existing);
          },
          'Supabase addNotification'
        );
      },
      async updateNotifications(notifications: any[]) {
        return runWithFallback(
          async () => {
            // Remove messageKey from notifications if it doesn't exist in the database
            const filteredNotifications = notifications.map(({ messageKey, ...notification }) => notification);
            const { error } = await supabase.from('notifications').upsert(filteredNotifications, { onConflict: 'id' });
            if (error) throw error;
          },
          async () => writeTable('notifications', notifications),
          'Supabase updateNotifications'
        );
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
        return runWithFallback(
          async () => {
            // Remove average_rating if it doesn't exist in the database
            const { average_rating, ...filteredScoreData } = scoreData;
            const { error } = await supabase.from('driver_scores').upsert({
              driver_id: driverId,
              ...filteredScoreData,
              updated_at: new Date().toISOString()
            }, { onConflict: 'driver_id' });
            if (error) throw error;
          },
          async () => {
            // Local fallback - just store in localStorage
            upsertLocal('driver-scores', { driver_id: driverId, ...scoreData }, 'driver_id');
          },
          'Supabase updateDriverScore'
        );
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

       // Locations
       async getLocations() {
         const { data, error } = await supabase.from('locations').select('*').order('timestamp', { ascending: false });
         if (error) throw error;
         return data || [];
       },

       // Driver Messages
       async getDriverMessages() {
         const { data, error } = await supabase.from('driver_messages').select('*').order('timestamp', { ascending: false });
         if (error) throw error;
         return data || [];
       },
       async addDriverMessage(message: any) {
         return runWithFallback(
           async () => {
             const { error } = await supabase.from('driver_messages').insert(message);
             if (error) throw error;
           },
           async () => {
             const existing = readTable('driver-messages');
             existing.unshift(message);
             writeTable('driver-messages', existing);
           },
           'Supabase addDriverMessage'
         );
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
    }
  : {
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
        async getRideLogs(options?: { dateFrom?: string; dateTo?: string }) {
          const all = readTable('ride-log');
          let filtered = all;
          if (options) {
            if (options.dateFrom) {
              filtered = filtered.filter((r: any) => new Date(r.timestamp) >= new Date(options.dateFrom));
            }
            if (options.dateTo) {
              filtered = filtered.filter((r: any) => new Date(r.timestamp) <= new Date(options.dateTo));
            }
          } // if no options, return all
          return filtered;
        },
        async getRideLogsByVehicle(vehicleId: number, status?: string, limit?: number) {
          const all = readTable('ride-log');
          let filtered = all.filter((r: any) => r.vehicleId === vehicleId);
          if (status) {
            filtered = filtered.filter((r: any) => r.status?.toLowerCase() === status.toLowerCase());
          }
          if (limit) {
            filtered = filtered.slice(0, limit);
          }
          return filtered.sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        },
           async addRideLog(rideLog: any) {
             const dbData = this._toDbRideLog(rideLog);
             console.log('🚗 addRideLog: sending to database:', {
               id: dbData.id,
               vehicle_id: dbData.vehicle_id,
               status: dbData.status,
               customer_name: dbData.customer_name
             });
             if (SUPABASE_ENABLED) {
               // Try update first, since the record should exist
               const { data: updateData, error: updateError } = await supabase.from('ride_logs').update(dbData).eq('id', rideLog.id);
               console.log('Update result:', { data: updateData, error: updateError });
               if (updateError) {
                 console.warn('Update failed, trying upsert:', updateError);
                 const { data: upsertData, error: upsertError } = await supabase.from('ride_logs').upsert(dbData, { onConflict: 'id' });
                 console.log('Upsert result:', { data: upsertData, error: upsertError });
                 if (upsertError) {
                   console.error('❌ addRideLog upsert error:', upsertError);
                   throw upsertError;
                 } else {
                   console.log('✅ addRideLog: successfully upserted to Supabase');
                 }
               } else {
                 console.log('✅ addRideLog: successfully updated in Supabase');
               }
             } else {
               console.log('addRideLog: Supabase not enabled, using localStorage');
             }
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

       // Driver Messages
       async getDriverMessages() {
         return readTable('driver-messages');
       },
       async addDriverMessage(message: any) {
         const existing = readTable('driver-messages');
         existing.unshift(message);
         writeTable('driver-messages', existing);
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
