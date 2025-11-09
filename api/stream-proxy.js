export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Stream-Client');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    const streamApiKey = process.env.VITE_STREAM_API_KEY;
    const streamApiSecret = process.env.VITE_STREAM_API_SECRET;

    if (!streamApiKey || !streamApiSecret) {
      return res.status(500).json({ success: false, error: 'Stream Chat configuration missing' });
    }

    // Extract the path from the URL
    const url = new URL(req.url, `https://${req.headers.host}`);
    const path = url.pathname.replace('/api/stream-proxy', '');
    const queryString = url.search;

    // Build the target URL
    const targetUrl = `https://chat.stream-io-api.com${path}${queryString}`;

    // Get authorization header from request
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({ success: false, error: 'Missing authorization header' });
    }

    // Forward the request to Stream Chat
    const response = await fetch(targetUrl, {
      method: req.method,
      headers: {
        'Content-Type': req.headers['content-type'] || 'application/json',
        'Authorization': authHeader,
        'X-Stream-Client': req.headers['x-stream-client'] || 'stream-chat-js-v9.25.0-browser',
        'api_key': streamApiKey
      },
      body: req.method !== 'GET' && req.method !== 'HEAD' ? JSON.stringify(req.body) : undefined
    });

    // Get response data
    const responseText = await response.text();
    let responseData;

    try {
      responseData = JSON.parse(responseText);
    } catch (e) {
      responseData = responseText;
    }

    // Forward the response
    res.status(response.status);
    res.setHeader('Content-Type', response.headers.get('content-type') || 'application/json');

    // Copy other relevant headers
    const headersToCopy = ['x-stream-client', 'x-ratelimit-limit', 'x-ratelimit-remaining', 'x-ratelimit-reset'];
    headersToCopy.forEach(header => {
      const value = response.headers.get(header);
      if (value) {
        res.setHeader(header, value);
      }
    });

    res.json(responseData);
  } catch (error) {
    console.error('Stream proxy error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
}