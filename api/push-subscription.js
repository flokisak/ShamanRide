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
    const { subscription, vehicleNumber, userAgent } = req.body;

    if (!subscription || !vehicleNumber) {
      return res.status(400).json({ success: false, error: 'Missing subscription or vehicle number' });
    }

    // Store subscription in database or in-memory store
    // For now, we'll just log it and return success
    console.log('Push subscription received:', {
      vehicleNumber,
      endpoint: subscription.endpoint,
      userAgent
    });

    // In production, you would store this in your database
    // associated with the driver/vehicle

    res.json({ success: true, message: 'Subscription stored' });
  } catch (error) {
    console.error('Push subscription error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}