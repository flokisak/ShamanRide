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

  const { recipients, message } = req.body;

  if (!recipients || !Array.isArray(recipients) || recipients.length === 0 || !message) {
    return res.status(400).json({ success: false, error: 'Invalid recipients or message' });
  }

  try {
    const config = {
      server: process.env.SMS_SERVER,
      username: process.env.SMS_USERNAME,
      password: process.env.SMS_PASSWORD,
      deviceId: process.env.DEVICE_ID,
    };

    console.log('SMS config:', config);

    if (!config.server || !config.username || !config.password) {
      return res.status(500).json({ success: false, error: 'SMS gate not configured' });
    }

    const url = `https://${config.server}/3rdparty/v1/messages`;
    console.log('Sending SMS to:', url, { recipients, message });

    const body = {
      phoneNumbers: recipients.map(phone => phone.startsWith('+') ? phone : `+420${phone.replace(/\s/g, '')}`),
      textMessage: {
        text: message
      }
    };

    if (config.deviceId) {
      body.deviceId = config.deviceId;
    }

    const auth = Buffer.from(`${config.username}:${config.password}`).toString('base64');
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${auth}`
      },
      body: JSON.stringify(body),
    });

    const result = await response.text();
    console.log('SMS response:', response.status, result);

    res.json({ success: response.ok, data: result });
  } catch (error) {
    console.error('SMS error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}