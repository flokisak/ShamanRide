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

    // Try Google Maps as primary routing service
    const googleMapsApiKey = process.env.VITE_GOOGLE_MAPS_API_KEY;
    if (googleMapsApiKey || google) {
      try {
        console.log('Trying Google Maps routing service...');
        // Build Google Maps Directions API URL
        const origin = `${coordPairs[0].lat},${coordPairs[0].lon}`;
        const destination = `${coordPairs[coordPairs.length - 1].lat},${coordPairs[coordPairs.length - 1].lon}`;

        let waypoints = '';
        if (coordPairs.length > 2) {
          const intermediateWaypoints = coordPairs.slice(1, -1).map(coord => `${coord.lat},${coord.lon}`);
          waypoints = `&waypoints=${intermediateWaypoints.join('|')}`;
        }

        const googleMapsUrl = `https://maps.googleapis.com/maps/api/directions/json?origin=${origin}&destination=${destination}${waypoints}&mode=driving&key=${googleMapsApiKey}`;

        const response = await fetch(googleMapsUrl);

        if (response.ok) {
          const googleData = await response.json();

          if (googleData.status === 'OK' && googleData.routes && googleData.routes.length > 0) {
            const route = googleData.routes[0];

            // Convert Google Maps polyline to coordinates
            const geometry = decodePolyline(route.overview_polyline.points);

            // Calculate total distance and duration
            const totalDistance = route.legs.reduce((sum, leg) => sum + leg.distance.value, 0);
            const totalDuration = route.legs.reduce((sum, leg) => sum + leg.duration.value, 0);

            const googleMapsLikeResponse = {
              code: 'Ok',
              routes: [{
                duration: totalDuration, // seconds
                distance: totalDistance, // meters
                geometry: {
                  type: 'LineString',
                  coordinates: geometry // [lon, lat] format for GeoJSON
                },
                legs: route.legs.map((leg) => ({
                  duration: leg.duration.value,
                  distance: leg.distance.value,
                  steps: []
                }))
              }],
              waypoints: coordPairs.map(coord => ({
                location: [coord.lon, coord.lat]
              }))
            };

            console.log('Google Maps routing successful');
            return res.json(googleMapsLikeResponse);
          }
        }
        console.warn('Google Maps routing failed');
      } catch (googleError) {
        console.warn('Google Maps routing error:', googleError.message);
      }
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