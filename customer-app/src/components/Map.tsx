import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { useTranslation } from '../contexts/LanguageContext';

interface MapProps {
  vehicleLocation?: { lat: number; lng: number };
  pickupLocation?: { lat: number; lng: number };
  taxiLocations?: any[];
}

const Map: React.FC<MapProps> = ({ vehicleLocation, pickupLocation, taxiLocations = [] }) => {
  const { t } = useTranslation();

  // Calculate center based on taxi locations or default to South Moravia
  const getCenter = () => {
    if (vehicleLocation) return vehicleLocation;
    if (pickupLocation) return pickupLocation;
    if (taxiLocations.length > 0) {
      // Center on the first taxi location
      const firstLocation = taxiLocations[0];
      if (firstLocation?.lat && firstLocation?.lng) {
        return { lat: firstLocation.lat, lng: firstLocation.lng };
      }
    }
    return { lat: 49.1951, lng: 16.6084 }; // South Moravia (Brno) default
  };

  const center = getCenter();

  return (
    <div className="rounded-lg overflow-hidden border border-slate-600/50">
      <MapContainer center={center} zoom={10} style={{ height: '300px', width: '100%' }}>
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />
        {/* Display taxi locations */}
        {taxiLocations.map((location, index) => {
          if (location.lat && location.lng) {
            return (
              <Marker
                key={`${location.vehicle_id || index}-${location.timestamp}`}
                position={{ lat: location.lat, lng: location.lng }}
              >
                <Popup>
                  <div className="text-center">
                    <div className="font-semibold">{location.vehicle_name || `${t('customer.taxi')} ${location.vehicle_id || index + 1}`}</div>
                    <div className="text-sm text-gray-600">
                      {location.license_plate || `${t('customer.id')}: ${location.vehicle_id || 'Neznámé'}`}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      {t('customer.lastUpdated')}: {new Date(location.timestamp).toLocaleTimeString('cs-CZ')}
                    </div>
                    <div className="text-xs px-2 py-1 rounded-full mt-1 bg-blue-100 text-blue-800">
                      {t('customer.active')}
                    </div>
                  </div>
                </Popup>
              </Marker>
            );
          }
          return null;
        })}
        {vehicleLocation && (
          <Marker position={vehicleLocation}>
            <Popup>{t('customer.yourTaxi')}</Popup>
          </Marker>
        )}
        {pickupLocation && (
          <Marker position={pickupLocation}>
            <Popup>{t('customer.pickupLocationLabel')}</Popup>
          </Marker>
        )}
      </MapContainer>
    </div>
  );
};

export default Map;