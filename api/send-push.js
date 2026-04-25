import { buildRidePushPayload, sendPushToVehicle } from './_push-utils.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const { vehicleNumber, ride, eventType = 'assigned', payload } = req.body || {};
    if (!vehicleNumber) {
      return res.status(400).json({ success: false, error: 'Missing vehicleNumber' });
    }

    const pushPayload = payload || buildRidePushPayload(ride || {}, eventType);
    const result = await sendPushToVehicle(vehicleNumber, pushPayload);
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('send-push error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}
