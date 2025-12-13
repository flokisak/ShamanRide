import express from 'express';
import cors from 'cors';

const app = express();
const PORT = 3004;

app.use(cors());
app.use(express.json());

app.get('/api/test', (req, res) => {
  res.json({ message: 'Server is working', timestamp: new Date().toISOString() });
});

app.get('/api/route', (req, res) => {
  const { coordinates } = req.query;
  
  console.log('Received route request:', coordinates);
  
  if (!coordinates) {
    return res.status(400).json({ error: 'Missing coordinates parameter' });
  }
  
  // Parse coordinates and return a simple route
  try {
    const coords = coordinates.split(';').map(pair => {
      const [lon, lat] = pair.split(',').map(Number);
      return [parseFloat(lon), parseFloat(lat)];
    });
    
    console.log('Parsed coordinates:', coords);
    
    res.json({
      code: 'Ok',
      routes: [{
        duration: 1800,
        distance: 15000,
        geometry: {
          type: 'LineString',
          coordinates: coords
        },
        legs: []
      }],
      waypoints: []
    });
  } catch (error) {
    console.error('Error parsing coordinates:', error);
    res.status(500).json({ error: 'Invalid coordinates format' });
  }
});

app.post('/api/stream-chat', (req, res) => {
  const { action } = req.query;
  
  if (action === 'token') {
    const { userId } = req.body;
    console.log('Generating token for userId:', userId);

    if (!userId) {
      console.log('Missing userId in request');
      return res.status(400).json({ error: 'Missing userId' });
    }

    // Mock token generation (replace with real implementation)
    const token = 'mock-token-for-' + userId;
    console.log('Token generated successfully for user:', userId);

    return res.json({ token });
  }
  
  res.status(400).json({ error: 'Invalid action' });
});

app.post('/api/stream-chat-token', (req, res) => {
  const { userId } = req.body;
  console.log('Generating token for userId:', userId);

  if (!userId) {
    console.log('Missing userId in request');
    return res.status(400).json({ error: 'Missing userId' });
  }

  // Mock token generation (replace with real implementation)
  const token = 'mock-token-for-' + userId;
  console.log('Token generated successfully for user:', userId);

  res.json({ token });
});

app.post('/api/stream-chat-user', async (req, res) => {
  try {
    const { userId, userData } = req.body;

    if (!userId || !userData) {
      return res.status(400).json({ error: 'Missing userId or userData' });
    }

    console.log('Creating Stream Chat user:', userId);
    
    // Mock user creation (replace with real implementation)
    res.json({ success: true });
  } catch (error) {
    console.error('Error creating Stream Chat user:', error);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Clean server running on http://0.0.0.0:${PORT}`);
});