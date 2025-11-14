import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const SUPABASE_ENABLED = Boolean(supabaseUrl && supabaseAnonKey);
export const supabase = SUPABASE_ENABLED ? createClient(supabaseUrl, supabaseAnonKey) : null;

export const orderRide = async (orderData: any) => {
  if (!SUPABASE_ENABLED) {
    // Fallback: save to localStorage
    const rideId = `local-${Date.now()}`;
    const rideData = {
      id: rideId,
      customer_name: orderData.customerName,
      customer_phone: orderData.customerPhone,
      stops: orderData.stops,
      passengers: orderData.passengers,
      pickup_time: orderData.pickupTime,
      status: 'pending',
      timestamp: Date.now(),
    };
    const existing = JSON.parse(localStorage.getItem('customer-rides') || '[]');
    existing.push(rideData);
    localStorage.setItem('customer-rides', JSON.stringify(existing));
    return [rideData];
  }

  const { data, error } = await supabase!.from('ride_logs').insert({
    customer_name: orderData.customerName,
    customer_phone: orderData.customerPhone,
    stops: orderData.stops,
    passengers: orderData.passengers,
    pickup_time: orderData.pickupTime,
    status: 'pending',
    timestamp: Date.now(),
  }).select();

  if (error) throw error;
  return data;
};

export const getRideStatus = async (rideId: string) => {
  if (!SUPABASE_ENABLED) {
    // Fallback: read from localStorage
    const rides = JSON.parse(localStorage.getItem('customer-rides') || '[]');
    return rides.find((r: any) => r.id === rideId) || null;
  }

  const { data, error } = await supabase!
    .from('ride_logs')
    .select('*')
    .eq('id', rideId)
    .single();

  if (error) throw error;
  return data;
};

export const getVehicleLocation = async (vehicleId: number) => {
  if (!SUPABASE_ENABLED) {
    return null; // No fallback for vehicle locations in offline mode
  }

  const { data, error } = await supabase!
    .from('vehicles')
    .select('location')
    .eq('id', vehicleId)
    .single();

  if (error) throw error;
  return data?.location;
};

export const getAvailableVehicles = async () => {
  if (!SUPABASE_ENABLED) {
    return []; // No fallback for vehicles in offline mode
  }

  const { data, error } = await supabase!
    .from('vehicles')
    .select('id, name, location, vehicle_status, license_plate')
    .in('vehicle_status', ['available', 'busy']);

  if (error) throw error;
  return data || [];
};

export const getTaxiLocations = async () => {
  if (!SUPABASE_ENABLED) {
    return []; // No fallback for locations in offline mode
  }

  const { data, error } = await supabase!
    .from('locations')
    .select('*')
    .order('timestamp', { ascending: false });

  if (error) throw error;
  return data || [];
};
