const express = require('express');
const app = express();

app.use(express.json());

// Enable CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

app.post('/api/config', (req, res) => {
  const { server, username, password } = req.body;
  // In production, perhaps store in env or database
  res.json({ success: true });
});

app.post('/api/send-sms', async (req, res) => {
  const { recipients, message } = req.body;
  const config = {
    server: process.env.SMS_SERVER,
    username: process.env.SMS_USERNAME,
    password: process.env.SMS_PASSWORD,
  };
  console.log('SMS config:', config);
  if (!config.server || !config.username || !config.password) {
    return res.status(500).json({ success: false, error: 'SMS gate not configured' });
  }
  try {
    const url = `https://${config.server}/mobile/v1`;
    console.log('Sending SMS to:', url, { recipients, message });
    const body = {
      deviceId: process.env.DEVICE_ID || config.username,
      phoneNumbers: recipients.map(phone => phone.startsWith('+') ? phone.slice(1) : `420${phone.replace(/\s/g, '')}`),
      textMessage: {
        text: message
      }
    };
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Basic ' + Buffer.from(config.username + ':' + config.password).toString('base64')
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
});

module.exports = app;