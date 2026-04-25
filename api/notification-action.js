import { updateRideFromNotificationAction } from './_push-utils.js';

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
    const { action, notificationData } = req.body;

    const result = await updateRideFromNotificationAction({ action, notificationData });
    console.log('Notification action received:', { action, notificationData, result });

    res.json({ success: true, message: 'Action processed', ...result });
  } catch (error) {
    console.error('Notification action error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}
