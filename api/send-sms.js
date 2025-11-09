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
    // Use HTTP API for Vercel deployment
    const smsServer = process.env.SMS_SERVER;
    const smsUsername = process.env.SMS_USERNAME;
    const smsPassword = process.env.SMS_PASSWORD;

    if (!smsServer || !smsUsername || !smsPassword) {
      return res.status(500).json({
        success: false,
        error: 'SMS configuration missing. Please set SMS_SERVER, SMS_USERNAME, and SMS_PASSWORD environment variables.'
      });
    }

    // Send SMS via HTTP API
    const results = [];
    for (const phone of recipients) {
      try {
        // Normalize phone to E.164 format, assuming Czech Republic +420
        const normalizedPhone = phone.startsWith('+') ? phone : `+420${phone.replace(/\s/g, '')}`;

        // This is a generic HTTP API call - adjust based on your SMS provider
        const smsResponse = await fetch(smsServer, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Basic ${Buffer.from(`${smsUsername}:${smsPassword}`).toString('base64')}`
          },
          body: JSON.stringify({
            to: normalizedPhone,
            message: message
          })
        });

        if (!smsResponse.ok) {
          const errorText = await smsResponse.text();
          results.push({ phone: normalizedPhone, success: false, error: `HTTP ${smsResponse.status}: ${errorText}` });
        } else {
          const responseData = await smsResponse.json().catch(() => ({}));
          results.push({ phone: normalizedPhone, success: true, data: responseData });
        }
      } catch (phoneErr) {
        results.push({ phone, success: false, error: phoneErr.message });
      }
    }

    // Check if all SMS were sent successfully
    const allSuccessful = results.every(r => r.success);
    if (allSuccessful) {
      res.json({ success: true, data: results });
    } else {
      res.status(500).json({
        success: false,
        error: 'Some SMS failed to send',
        details: results
      });
    }
  } catch (error) {
    console.error('SMS sending error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
}