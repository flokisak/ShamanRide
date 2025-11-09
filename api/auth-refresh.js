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
    const { refresh_token } = req.body;

    if (!refresh_token) {
      return res.status(400).json({ success: false, error: 'Missing refresh_token' });
    }

    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      return res.status(500).json({ success: false, error: 'Supabase configuration missing' });
    }

    // Make the refresh request server-side to avoid CORS issues
    const refreshResponse = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseAnonKey}`,
        'apikey': supabaseAnonKey
      },
      body: JSON.stringify({
        refresh_token
      })
    });

    const responseData = await refreshResponse.json();

    if (!refreshResponse.ok) {
      return res.status(refreshResponse.status).json({
        success: false,
        error: responseData.error_description || responseData.msg || 'Token refresh failed'
      });
    }

    res.json({
      success: true,
      data: responseData
    });
  } catch (error) {
    console.error('Auth refresh proxy error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
}