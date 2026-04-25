const fs = require('fs');
const path = require('path');
const webpush = require('web-push');
const { createClient } = require('@supabase/supabase-js');

const localStorePath = path.join(process.cwd(), '..', '.push-subscriptions.local.json');
let supabaseAdmin = null;

function getSupabaseAdmin() {
  if (supabaseAdmin) return supabaseAdmin;
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  supabaseAdmin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  return supabaseAdmin;
}

function configureWebPush() {
  const publicKey = process.env.VAPID_PUBLIC_KEY || process.env.VITE_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || 'mailto:admin@shamanride.local';
  if (!publicKey || !privateKey) return false;
  webpush.setVapidDetails(subject, publicKey, privateKey);
  return true;
}

function readLocalSubscriptions() {
  try {
    if (!fs.existsSync(localStorePath)) return [];
    return JSON.parse(fs.readFileSync(localStorePath, 'utf8'));
  } catch (error) {
    console.warn('Failed to read local push subscription store:', error);
    return [];
  }
}

async function getPushSubscriptionsForVehicle(vehicleNumber) {
  const vehicleId = Number(vehicleNumber);
  const supabase = getSupabaseAdmin();
  if (supabase) {
    const { data, error } = await supabase
      .from('push_subscriptions')
      .select('*')
      .eq('vehicle_id', vehicleId)
      .eq('active', true);
    if (error) throw error;
    return data || [];
  }
  return readLocalSubscriptions().filter(row => row.vehicle_id === vehicleId && row.active !== false);
}

async function deactivatePushSubscription(endpoint) {
  const supabase = getSupabaseAdmin();
  if (supabase) {
    await supabase
      .from('push_subscriptions')
      .update({ active: false, updated_at: new Date().toISOString() })
      .eq('endpoint', endpoint);
    return;
  }
  const rows = readLocalSubscriptions().map(row =>
    row.endpoint === endpoint ? { ...row, active: false, updated_at: new Date().toISOString() } : row
  );
  fs.writeFileSync(localStorePath, JSON.stringify(rows, null, 2));
}

function buildRidePushPayload(ride, eventType = 'assigned') {
  const stops = Array.isArray(ride.stops) ? ride.stops : [];
  const clean = value => String(value || '').split('|')[0].trim();
  const from = clean(stops[0]);
  const to = clean(stops[stops.length - 1]);
  const price = ride.estimatedPrice || ride.estimated_price;
  const route = [from, to].filter(Boolean).join(' → ');
  const isCancelled = eventType === 'cancelled' || String(ride.status || '').toLowerCase() === 'cancelled';

  return {
    title: isCancelled ? 'Jízda byla zrušena' : 'Nová jízda',
    body: `${ride.customerName || ride.customer_name || 'Zákazník'}${route ? `: ${route}` : ''}${price ? ` • ${price} Kč` : ''}`,
    type: 'ride',
    tag: `ride-${ride.id}`,
    url: '/',
    vibrate: isCancelled ? [500, 200, 250] : [400, 200, 400, 200, 400],
    data: {
      rideId: ride.id,
      vehicleId: ride.vehicleId || ride.vehicle_id,
      status: ride.status,
      eventType
    }
  };
}

async function sendPushToVehicle(vehicleNumber, payload) {
  if (!configureWebPush()) {
    console.warn('Web Push skipped: VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY are not configured.');
    return { sent: 0, failed: 0, skipped: true };
  }

  const subscriptions = await getPushSubscriptionsForVehicle(vehicleNumber);
  let sent = 0;
  let failed = 0;

  await Promise.all(subscriptions.map(async row => {
    try {
      await webpush.sendNotification(row.subscription, JSON.stringify(payload));
      sent += 1;
    } catch (error) {
      failed += 1;
      const statusCode = error && error.statusCode;
      if (statusCode === 404 || statusCode === 410) {
        await deactivatePushSubscription(row.endpoint);
      }
      console.warn('Failed to send Web Push:', statusCode || error.message || error);
    }
  }));

  return { sent, failed, skipped: false };
}

module.exports = {
  buildRidePushPayload,
  sendPushToVehicle
};
