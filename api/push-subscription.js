import { savePushSubscription } from './_push-utils.js';

export default async function handler(req, res) {
  // Set CORS headers
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
    const { subscription, vehicleNumber, driverId, userAgent } = req.body;

    if (!subscription || !vehicleNumber) {
      return res.status(400).json({ success: false, error: 'Missing subscription or vehicle number' });
    }

    const result = await savePushSubscription({ subscription, vehicleNumber, driverId, userAgent });

    console.log('Push subscription stored:', {
      vehicleNumber,
      endpoint: subscription.endpoint,
      userAgent,
      persisted: result.persisted
    });

    res.json({ success: true, message: 'Subscription stored', ...result });
  } catch (error) {
    console.error('Push subscription error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}
