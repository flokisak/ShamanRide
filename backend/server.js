const express = require('express');
const app = express();

app.use(express.json());

app.post('/api/config', (req, res) => {
  const { server, username, password } = req.body;
  // In production, perhaps store in env or database
  res.json({ success: true });
});

app.post('/api/send', async (req, res) => {
  const { recipients, message } = req.body;
  const config = {
    server: process.env.SMS_SERVER,
    username: process.env.SMS_USERNAME,
    password: process.env.SMS_PASSWORD,
  };
  if (!config.server || !config.username || !config.password) {
    return res.status(500).json({ success: false, error: 'SMS gate not configured' });
  }
  try {
    const url = `http://${config.server}/api/send`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: config.username, password: config.password, recipients, message }),
    });
    const result = await response.json();
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

const port = process.env.PORT || 3001;
app.listen(port, () => console.log(`Server running on port ${port}`));