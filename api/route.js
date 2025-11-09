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

export default async function handler(req, res) {
  // Set comprehensive CORS headers for Vercel deployment
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { coordinates } = req.query;

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
    if (googleMapsApiKey) {
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
    } else {
      console.warn('Google Maps API key not configured');
    }

    // All routing services failed, return fallback flag
    console.log('All routing services failed, using local fallback calculation');
    res.status(200).json({
      fallback: true,
      message: 'All routing services are unavailable. Using local fallback calculation.'
    });

  } catch (error) {
    console.error('Routing proxy error:', error);
    // Return successful response with fallback flag so client knows to use local calculation
    res.status(200).json({
      fallback: true,
      message: 'Routing service error. Using fallback calculation.'
    });
  }
}