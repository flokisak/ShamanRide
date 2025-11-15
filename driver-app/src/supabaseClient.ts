import { createClient } from '@supabase/supabase-js';
import { DEFAULT_FUEL_PRICES } from './types';
import { splitAddressAndPlaceId } from './utils/addressUtils';

const isBrowser = typeof window !== 'undefined';
// Use main app's environment variables for consistency
const supabaseUrl = isBrowser ? import.meta.env.VITE_SUPABASE_URL : process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = isBrowser ? import.meta.env.VITE_SUPABASE_ANON_KEY : process.env.VITE_SUPABASE_ANON_KEY;
const supabaseServiceKey = isBrowser ? import.meta.env.VITE_SUPABASE_SERVICE_KEY : process.env.VITE_SUPABASE_SERVICE_KEY;

console.log('Driver app environment variables:', {
  supabaseUrl: supabaseUrl ? 'SET' : 'NOT SET',
  supabaseAnonKey: supabaseAnonKey ? 'SET (length: ' + supabaseAnonKey.length + ')' : 'NOT SET',
  supabaseServiceKey: supabaseServiceKey ? 'SET' : 'NOT SET'
});

export const SUPABASE_ENABLED = Boolean(supabaseUrl && (supabaseAnonKey || supabaseServiceKey));

let supabase: any = null;
if (SUPABASE_ENABLED) {
  // Create our own Supabase client for the driver app
  // Use anon key for client-side authentication, rely on RLS policies
  const key = supabaseAnonKey || supabaseServiceKey;
  console.log('Creating Supabase client with key type:', supabaseServiceKey ? 'SERVICE' : 'ANON');
  if (isBrowser) {
    const GLOBAL_KEY = '__shamanride_supabase_client_driver__';
    (window as any)[GLOBAL_KEY] = (window as any)[GLOBAL_KEY] || createClient(supabaseUrl, key, {
      auth: {
        storageKey: 'shamanride-driver-auth-token',
        storage: window.localStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false
      }
    });
    supabase = (window as any)[GLOBAL_KEY];
    console.log('Using Supabase client for driver app with separate auth storage');
  } else {
    supabase = createClient(supabaseUrl, key);
    console.log('Using Supabase key for driver app (server)');
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

// Auth keep-alive: periodically refresh the Supabase session to avoid
// short-lived access token expiry (helps prevent unexpected auto-logout
// when the browser is idle). Default interval is 2 minutes for more frequent refresh.
let _authKeepAliveId: number | null = null;
let _lastRefreshTime: number = 0;
let _refreshAttempts: number = 0;
const MAX_REFRESH_ATTEMPTS = 3;

export function startAuthKeepAlive(intervalMs: number = 10 * 60 * 1000) {
  if (!SUPABASE_ENABLED || typeof window === 'undefined') return;
  try {
    // Use a window-global guard so multiple bundles or hot-reloads don't start
    // more than one keep-alive interval. Store state on
    // window.__shamanride_auth_keep_alive__ = { id, lastRefreshTime, attempts }
    const globalKey = '__shamanride_auth_keep_alive__';
    const win: any = window as any;
    if (!win[globalKey]) {
      win[globalKey] = { id: null, lastRefreshTime: 0, attempts: 0 };
    }
    if (win[globalKey].id) return; // already started
    console.log('Starting auth keep-alive (idempotent), interval ms:', intervalMs);
    win[globalKey].id = window.setInterval(async () => {
      try {
        const now = Date.now();
        // Skip if we refreshed recently (within last minute)
        if (now - win[globalKey].lastRefreshTime < 60000) return;

        // Only attempt a defensive refresh if we have a cached token
        const cached = getCachedAccessToken();
        if (!cached) {
          console.log('Auth keep-alive: No cached token, skipping refresh');
          return;
        }

        // Use the canonical safeRefreshSession helper which rate-limits/locks refreshes
        const res = await safeRefreshSession({ minIntervalMs: 60 * 1000 });
        if (res && res.data && res.data.session) {
          console.log('Auth keep-alive: Session refreshed successfully');
          win[globalKey].lastRefreshTime = now;
          win[globalKey].attempts = 0; // Reset on success
        } else {
          console.warn('Auth keep-alive: refresh did not return a new session');
          win[globalKey].attempts++;
          if (win[globalKey].attempts >= MAX_REFRESH_ATTEMPTS) {
            console.error('Auth keep-alive: Too many refresh failures, stopping keep-alive');
            stopAuthKeepAlive();
            return;
          }
        }
      } catch (err) {
        console.warn('Auth keep-alive error:', err);
        win[globalKey].attempts++;
        if (win[globalKey].attempts >= MAX_REFRESH_ATTEMPTS) {
          console.error('Auth keep-alive: Too many errors, stopping keep-alive');
          stopAuthKeepAlive();
        }
      }
    }, intervalMs) as unknown as number;
  } catch (err) {
    console.warn('Failed to start auth keep-alive:', err);
  }
}

export function stopAuthKeepAlive() {
  try {
    const win: any = window as any;
    const globalKey = '__shamanride_auth_keep_alive__';
    if (win && win[globalKey] && win[globalKey].id) {
      clearInterval(win[globalKey].id as number);
      win[globalKey].id = null;
      win[globalKey].lastRefreshTime = 0;
      win[globalKey].attempts = 0;
      console.log('Auth keep-alive stopped');
    }
  } catch (err) {
    console.warn('Failed to stop auth keep-alive:', err);
  }
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
        console.log('Auth service signUp called with:', { email, supabaseUrl, keyLength: supabaseAnonKey?.length });
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        return data;
      },
      async signIn(email: string, password: string) {
        console.log('Auth service signIn called with:', { email, supabaseUrl, keyLength: supabaseAnonKey?.length });
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          console.error('Supabase signIn error:', error);
          throw error;
        }
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
const supabaseService: any = SUPABASE_ENABLED ? {
  // Vehicles
  async getVehicles() {
    // Add cache-busting parameter to ensure fresh data
    const { data, error } = await supabase
      .from('vehicles')
      .select('*');
    if (error) throw error;
    console.log('getVehicles: fetched', data?.length, 'vehicles from database');
    if (data && data.length > 0) {
      console.log('getVehicles: first vehicle raw data:', data[0]);
      console.log('getVehicles: available columns:', Object.keys(data[0]));
    }
    return (data || []).map((d: any) => this._fromDbVehicle(d));
  },
    async updateVehicles(vehicles: any[]) {
      console.log('updateVehicles: updating', vehicles.length, 'vehicles');

      for (const vehicle of vehicles) {
        const dbRow = this._toDbVehicle(vehicle);
        console.log('updateVehicles: updating vehicle', vehicle.id, 'with data:', {
          mileage: dbRow.mileage,
          shift_start: dbRow.shift_start,
          shift_end: dbRow.shift_end
        });

        const { error } = await supabase
          .from('vehicles')
          .update({
            mileage: dbRow.mileage,
            shift_start: dbRow.shift_start,
            shift_end: dbRow.shift_end,
            vehicle_status: dbRow.vehicle_status
          })
          .eq('id', vehicle.id);

        if (error) {
          console.error('updateVehicles: failed to update vehicle', vehicle.id, error);
          throw error;
        }

        console.log('updateVehicles: successfully updated vehicle', vehicle.id);
      }

      console.log('updateVehicles: completed updating all vehicles');
    },

  // People
  async getPeople() {
    const { data, error } = await supabase.from('people').select('*');
    if (error) throw error;
    return data || [];
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
      query = query.eq('status', status.toLowerCase());
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
       if (error) throw error;
       console.log('addRideLog: successfully saved to Supabase');
       // Note: Real-time postgres_changes subscription handles notifications automatically
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

  // Locations
  async getLocations() {
    const { data, error } = await supabase.from('locations').select('*').order('timestamp', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  // Driver Messages
  async getDriverMessages() {
    return runWithFallback(
      async () => {
        const { data, error } = await supabase.from('driver_messages').select('*').order('timestamp', { ascending: false });
        if (error) throw error;
        return data || [];
      },
      async () => readTable('driver-messages'),
      'Supabase driver_messages'
    );
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
    // Always save to local
    const existing = readTable('driver-messages');
    existing.unshift(message);
    writeTable('driver-messages', existing);
  },

  // Gamification methods
  async getDriverScore(driverId: number) {
    return runWithFallback(
      async () => {
        const { data, error } = await supabase.from('driver_scores').select('*').eq('driver_id', driverId).single();
        if (error && error.code !== 'PGRST116') throw error; // PGRST116 = not found
        return data || null;
      },
      async () => {
        const scores = readTable('driver-scores');
        return scores.find((s: any) => s.driver_id === driverId) || null;
      },
      'Supabase getDriverScore'
    );
  },
  async getDriverAchievements(driverId: number) {
    return runWithFallback(
      async () => {
        const { data, error } = await supabase.from('achievements').select('*').eq('driver_id', driverId);
        if (error) throw error;
        return data || [];
      },
      async () => {
        const achievements = readTable('achievements');
        return achievements.filter((a: any) => a.driver_id === driverId);
      },
      'Supabase getDriverAchievements'
    );
  },
  async getLeaderboard() {
    return runWithFallback(
      async () => {
        const { data, error } = await supabase.from('driver_scores').select('*').order('total_score', { ascending: false });
        if (error) throw error;
        return (data || []).map((score: any, index: number) => ({ ...score, rank: index + 1 }));
      },
      async () => {
        const scores = readTable('driver-scores');
        return scores.sort((a: any, b: any) => b.total_score - a.total_score).map((score: any, index: number) => ({ ...score, rank: index + 1 }));
      },
      'Supabase getLeaderboard'
    );
  },
  async getManualEntries(driverId?: number) {
    return runWithFallback(
      async () => {
        let query = supabase.from('manual_entries').select('*').order('created_at', { ascending: false });
        if (driverId) {
          query = query.eq('driver_id', driverId);
        }
        const { data, error } = await query;
        if (error) throw error;
        return data || [];
      },
      async () => {
        const entries = readTable('manual-entries');
        if (driverId) {
          return entries.filter((e: any) => e.driver_id === driverId);
        }
        return entries;
      },
      'Supabase getManualEntries'
    );
  },

  // Mapping helpers
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
      fuel_type: v.fuelType ? v.fuelType.charAt(0).toUpperCase() + v.fuelType.slice(1).toLowerCase() : null,
      fuel_consumption: v.fuelConsumption ?? null,
      phone: v.phone ?? null,
      email: v.email ?? null,
      shift_start: v.shift_start ?? null,
      shift_end: v.shift_end ?? null,
      updated_at: new Date().toISOString(),
    };
  },
  _fromDbVehicle(db: any) {
    return {
      id: db.id,
      name: db.name,
      driverId: db.driver_id ?? null,
      licensePlate: db.license_plate ?? null,
      type: db.type,
      status: db.vehicle_status,
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
      shift_start: db.shift_start ?? null,
      shift_end: db.shift_end ?? null,
    };
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
      acceptedAt: db.accepted_at ? new Date(db.accepted_at).getTime() : null,
      startedAt: db.started_at ? new Date(db.started_at).getTime() : null,
      completedAt: db.completed_at ? new Date(db.completed_at).getTime() : null,
    };
  },
} : {
  // LocalStorage fallback implementations
  async getVehicles() {
    return readTable('vehicles');
  },
  async updateVehicles(vehicles: any[]) {
    writeTable('vehicles', vehicles);
  },
  async getPeople() {
    return readTable('people');
  },
  async getRideLogs() {
    return readTable('ride-log');
  },
  async getRideLogsByVehicle(vehicleId: number, status?: string, limit?: number) {
    const rides = readTable('ride-log').filter((r: any) => r.vehicleId === vehicleId);
    let filtered = rides;
    if (status) {
      filtered = filtered.filter((r: any) => r.status?.toLowerCase() === status.toLowerCase());
    }
    filtered.sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    if (limit) {
      filtered = filtered.slice(0, limit);
    }
    return filtered;
  },
  async addRideLog(rideLog: any) {
    upsertLocal('ride-log', rideLog);
  },
  async updateRideLogs(rideLogs: any[]) {
    writeTable('ride-log', rideLogs);
  },
  async getLocations() {
    return readTable('locations');
  },
  async getDriverMessages() {
    return readTable('driver-messages');
  },
  async addDriverMessage(message: any) {
    const existing = readTable('driver-messages');
    existing.unshift(message);
    writeTable('driver-messages', existing);
  },
};

export { supabaseService };

// Geocoding constants and cache
const geocodeCache = new Map<string, { lat: number; lon: number }>();
const CZECH_AUSTRIA_BOUNDS = { lonMin: 9.0, latMin: 46.0, lonMax: 18.0, latMax: 50.0 };

// Geocoding functions

const fetchPhotonCoords = async (addrToTry: string): Promise<{ lat: number; lon: number } | null> => {
  const { text: addr } = splitAddressAndPlaceId(addrToTry);
  const photonUrl = `https://photon.komoot.io/api/?q=${encodeURIComponent(addr)}&limit=10&bbox=12.0,48.5,18.9,51.1`;
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

function isInSouthMoravia(lat: number, lon: number): boolean {
  // Keep South Moravia as highest priority within the expanded bounds
  return lon >= 16.3 && lon <= 17.2 && lat >= 48.7 && lat <= 49.3;
}

function isInCzechAustriaRegion(lat: number, lon: number): boolean {
  // Approximate bounds for Czech Republic and Austria
  return lon >= 9.0 && lon <= 18.9 && lat >= 46.0 && lat <= 51.1;
}

const geocodeWithNominatim = async (address: string): Promise<{ lat: number; lon: number }> => {
  const tryGeocode = async (query: string): Promise<{ lat: number; lon: number } | null> => {
    const proxyUrl = 'https://corsproxy.io/?';
    const nominatimUrl = `${proxyUrl}https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=10&countrycodes=CZ,AT`;

    try {
      const response = await fetch(nominatimUrl);
      if (!response.ok) {
        console.warn(`Nominatim API error: ${response.status} for query: ${query}`);
        return null;
      }
      const data = await response.json();

      if (data && Array.isArray(data) && data.length > 0) {
        console.log(`Nominatim found ${data.length} results for "${query}"`);
        // First priority: results within Czech-Austria bounds
        for (const result of data) {
          const lat = parseFloat(result.lat);
          const lon = parseFloat(result.lon);
          if (isInCzechAustriaRegion(lat, lon)) {
            console.log(`Using Czech-Austria region result: ${lat}, ${lon}`);
            return { lat, lon };
          }
        }
        // Second priority: results within Czech Republic and Austria
        for (const result of data) {
          const lat = parseFloat(result.lat);
          const lon = parseFloat(result.lon);
          if (isInCzechAustriaRegion(lat, lon)) {
            console.log(`Using Czech/Austria region result: ${lat}, ${lon}`);
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
      const geocodingUrl = `${proxyUrl}https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(cleanAddress)}&key=${googleMapsApiKey}&language=${language}&region=cz&bounds=${CZECH_AUSTRIA_BOUNDS.latMin},${CZECH_AUSTRIA_BOUNDS.lonMin}|${CZECH_AUSTRIA_BOUNDS.latMax},${CZECH_AUSTRIA_BOUNDS.lonMax}`;

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

export { geocodeAddress };
