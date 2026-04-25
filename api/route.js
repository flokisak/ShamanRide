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

    // Try OSRM as the primary routing service
    try {
      console.log('Trying OSRM routing service...');
      const osrmCoords = coordPairs.map(coord => `${coord.lon},${coord.lat}`).join(';');
      const osrmUrl = `https://routing.openstreetmap.de/routed-car/route/v1/driving/${osrmCoords}?overview=full&geometries=geojson&steps=false`;
      console.log('OSRM URL:', osrmUrl);
      const osrmResponse = await fetch(osrmUrl);
      console.log('OSRM response status:', osrmResponse.status);

      if (osrmResponse.ok) {
        const osrmData = await osrmResponse.json();
        console.log('OSRM data code:', osrmData.code);
        if (osrmData.code === 'Ok' && osrmData.routes && osrmData.routes.length > 0) {
          const route = osrmData.routes[0];
          const osrmLikeResponse = {
            code: 'Ok',
            routes: [{
              duration: route.duration,
              distance: route.distance,
              geometry: {
                type: 'LineString',
                coordinates: route.geometry.coordinates.map(coord => [coord[1], coord[0]])
              },
              legs: [{
                duration: route.duration,
                distance: route.distance,
                steps: []
              }]
            }],
            waypoints: coordPairs.map(coord => ({
              location: [coord.lon, coord.lat]
            }))
          };
          console.log('OSRM routing successful');
          return res.json(osrmLikeResponse);
        }
        console.warn('OSRM data not Ok or no routes');
      } else {
        const text = await osrmResponse.text();
        console.warn('OSRM response not ok:', text);
      }
      console.warn('OSRM routing failed');
    } catch (osrmError) {
      console.warn('OSRM routing error:', osrmError.message);
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