export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const gpsApiUrl = process.env.GPS_API_URL || 'https://gps.lokatory.cz/api/vehicles';
    const gpsUsername = process.env.GPS_USERNAME;
    const gpsPassword = process.env.GPS_PASSWORD;

    if (!gpsUsername || !gpsPassword) {
      return res.status(500).json({ error: 'GPS configuration missing. Set GPS_USERNAME and GPS_PASSWORD.' });
    }

    const response = await fetch(gpsApiUrl, {
      method: 'GET',
      headers: {
        'Authorization': 'Basic ' + Buffer.from(`${gpsUsername}:${gpsPassword}`).toString('base64'),
        'Content-Type': 'application/json',
      },
      redirect: 'follow',
    });

    console.log('GPS API status:', response.status);
    console.log('GPS API headers:', Object.fromEntries(response.headers.entries()));

    const text = await response.text();
    console.log('GPS API response:', text.substring(0, 500));

    if (!response.ok) {
      return res.status(response.status).json({ error: 'GPS API error', text });
    }

    try {
      const data = JSON.parse(text);
      res.json(data);
    } catch (parseErr) {
      console.error('GPS API returned non-JSON:', parseErr);
      res.status(500).json({ error: 'GPS API returned non-JSON', text: text.substring(0, 500) });
    }
  } catch (err) {
    console.error('GPS proxy error:', err);
    res.status(500).json({ error: err.message });
  }
}
