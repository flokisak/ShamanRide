import express from 'express';
import cors from 'cors';
import { config } from 'dotenv';

// Load environment variables from parent directory
config({ path: '../.env' });

const app = express();
const PORT = 3004;

app.use(cors());
app.use(express.json());

app.get('/api/test', (req, res) => {
  res.json({ message: 'Server is working', timestamp: new Date().toISOString() });
});

app.get('/api/route', async (req, res) => {
  try {
    const { coordinates, google } = req.query;
    
    if (!coordinates || typeof coordinates !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid coordinates parameter' });
    }

    // Parse coordinates (format: lon1,lat1;lon2,lat2;...)
    const coordPairs = coordinates.split(';').map(pair => {
      const [lon, lat] = pair.split(',').map(Number);
      return { lat, lon };
    });

    if (coordPairs.length < 2) {
      return res.status(400).json({ error: 'At least 2 coordinate pairs required' });
    }

    // Use OSRM as the primary routing service
    try {
      console.log('Trying OSRM routing service...');
      const osrmCoords = coordPairs.map(coord => `${coord.lon},${coord.lat}`).join(';');
      const osrmUrl = `https://routing.openstreetmap.de/routed-car/route/v1/driving/${osrmCoords}?overview=full&geometries=geojson&steps=false`;
      console.log('OSRM URL:', osrmUrl);
      const osrmResponse = await fetch(osrmUrl);

      if (osrmResponse.ok) {
        const osrmData = await osrmResponse.json();
        console.log('OSRM data code:', osrmData.code);
        if (osrmData.code === 'Ok' && osrmData.routes && osrmData.routes.length > 0) {
          const route = osrmData.routes[0];
          return res.json({
            code: 'Ok',
            routes: [{
              duration: route.duration,
              distance: route.distance,
              geometry: {
                type: 'LineString',
                coordinates: route.geometry.coordinates.map(coord => [coord[1], coord[0]])
              },
              legs: []
            }],
            waypoints: coordPairs.map(coord => ({
              location: [coord.lon, coord.lat]
            }))
          });
        } else {
          console.warn('OSRM data not Ok or no routes');
        }
      } else {
        const text = await osrmResponse.text();
        console.warn('OSRM response not ok:', text);
      }
      console.warn('OSRM routing failed');
    } catch (osrmError) {
      console.warn('OSRM routing error:', osrmError.message);
    }

    // Fallback: Return a simple straight-line route
    console.log('Using fallback route calculation');
    const totalDistance = coordPairs.reduce((sum, coord, index) => {
      if (index === 0) return 0;
      const prev = coordPairs[index - 1];
      const dist = Math.sqrt(
        Math.pow(coord.lat - prev.lat, 2) + Math.pow(coord.lon - prev.lon, 2)
      );
      return sum + dist;
    }, 0);

    res.json({
      code: 'Ok',
      routes: [{
        duration: Math.round(totalDistance * 3600), // rough estimate: degrees to seconds
        distance: Math.round(totalDistance * 111000), // rough estimate: degrees to meters
        geometry: {
          type: 'LineString',
          coordinates: coordPairs.map(c => [c.lon, c.lat])
        },
        legs: []
      }],
      waypoints: coordPairs.map(coord => ({
        location: [coord.lon, coord.lat]
      }))
    });

  } catch (error) {
    console.error('Routing proxy error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Polyline decoding function for Google Maps
function decodePolyline(encoded) {
  const poly = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let b;
    let shift = 0;
    let result = 0;

    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);

    const dlat = ((result & 1) ? ~(result >> 1) : (result >> 1));
    lat += dlat;

    shift = 0;
    result = 0;

    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);

    const dlng = ((result & 1) ? ~(result >> 1) : (result >> 1));
    lng += dlng;

    poly.push([lat * 1e-5, lng * 1e-5]); // Convert to [lat, lon]
  }

  return poly;
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Express server running on http://0.0.0.0:${PORT}`);
});