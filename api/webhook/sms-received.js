import { smsService } from '../../services/smsService.js';

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
    const { phone, message, timestamp } = req.body;

    if (!phone || !message) {
      return res.status(400).json({ success: false, error: 'Missing phone or message' });
    }

    // Save incoming SMS
    const record = {
      id: Date.now().toString(),
      timestamp: timestamp ? new Date(timestamp).getTime() : Date.now(),
      direction: 'incoming',
      from: phone,
      text: message,
      status: 'delivered',
    };

    await smsService.saveIncoming(record);

    console.log('Incoming SMS saved:', record);

    res.json({ success: true });
  } catch (err) {
    console.error('Error processing incoming SMS:', err);
    res.status(500).json({ success: false, error: err.message });
  }
}