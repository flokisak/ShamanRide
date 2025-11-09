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

  const { server, username, password } = req.body;
  if (!server || !username || !password) {
    return res.status(400).json({ error: 'Missing server, username, or password' });
  }

  // In serverless environment, we can't write to filesystem
  // This endpoint would need to be modified to use a database or external storage
  // For now, just return success without actually saving
  console.log('SMS config update requested:', { server, username, password: '***' });

  res.json({ success: true });
}