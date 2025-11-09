import { StreamChat } from 'stream-chat';

export default async function handler(req, res) {
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

  try {
    const { userId, userData } = req.body;

    if (!userId || !userData) {
      return res.status(400).json({ error: 'Missing userId or userData' });
    }

    const apiKey = process.env.VITE_STREAM_API_KEY;
    const apiSecret = process.env.VITE_STREAM_API_SECRET;

    if (!apiKey || !apiSecret) {
      return res.status(500).json({ error: 'Stream Chat API key or secret not configured' });
    }

    // Create server-side client for user management
    const serverClient = StreamChat.getInstance(apiKey, apiSecret);

    // Create or update user (remove role if it's not a valid Stream Chat role)
    const { role, ...userDataWithoutRole } = userData;
    await serverClient.upsertUser({
      id: userId,
      ...userDataWithoutRole
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Error creating Stream Chat user:', error);
    res.status(500).json({ error: 'Failed to create user' });
  }
}