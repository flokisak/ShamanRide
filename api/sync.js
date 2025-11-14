export default function handler(req, res) {
  // Set comprehensive CORS headers for Vercel deployment
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Determine sync type from query parameter or body
  const syncType = req.query.type || req.body?.type || 'general';

  // Stub endpoint for service worker background sync
  console.log(`Background sync ${syncType} request received`);

  let message = 'Synced';
  switch (syncType) {
    case 'locations':
      message = 'Locations synced';
      break;
    case 'messages':
      message = 'Messages synced';
      break;
    case 'ride-updates':
      message = 'Ride updates synced';
      break;
    default:
      message = 'General sync completed';
  }

  res.json({ success: true, message });
}