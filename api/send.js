export default async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).end();
    return;
  }

  const { recipients, message } = req.body;

  const config = {
    server: process.env.SMS_SERVER,
    username: process.env.SMS_USERNAME,
    password: process.env.SMS_PASSWORD,
  };

  if (!config.server || !config.username || !config.password) {
    res.status(500).json({ success: false, error: 'SMS gate not configured' });
    return;
  }

  try {
    const url = `http://${config.server}/api/send`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: config.username, password: config.password, recipients, message }),
    });
    const result = await response.json();
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}