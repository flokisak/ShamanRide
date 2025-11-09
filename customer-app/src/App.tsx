import { useState, useEffect } from 'react';
import { orderRide, getRideStatus, getVehicleLocation, getTaxiLocations } from './supabaseClient';
import Map from './components/Map';
import { useTranslation } from './contexts/LanguageContext';

type RideStatus = 'ordering' | 'waiting' | 'assigned';

interface Ride {
  id: string;
  customerName: string;
  customerPhone: string;
  stops: any[];
  passengers: number;
  pickupTime: string;
  status: string;
  vehicleId?: number;
}

function App() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<RideStatus>('ordering');
  const [currentRide, setCurrentRide] = useState<Ride | null>(null);
  const [vehicleLocation, setVehicleLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [taxiLocations, setTaxiLocations] = useState<any[]>([]);
  const [formData, setFormData] = useState({
    customerName: '',
    customerPhone: '',
    pickup: '',
    dropoff: '',
    passengers: 1,
    pickupTime: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const stops = [
        { address: formData.pickup, type: 'pickup' },
        { address: formData.dropoff, type: 'dropoff' },
      ];
      const data = await orderRide({
        customerName: formData.customerName,
        customerPhone: formData.customerPhone,
        stops,
        passengers: formData.passengers,
        pickupTime: formData.pickupTime,
      });
      if (data && data.length > 0) {
        setCurrentRide(data[0]);
        setStatus('waiting');
      } else {
        throw new Error('No ride data returned');
      }
    } catch (error) {
      console.error('Failed to order ride:', error);
      alert('Failed to order ride. Please try again.');
    }
  };

  useEffect(() => {
    // Fetch taxi locations when component mounts
    const fetchTaxiLocations = async () => {
      try {
        const locations = await getTaxiLocations();
        setTaxiLocations(locations);
      } catch (error) {
        console.error('Failed to fetch taxi locations:', error);
      }
    };

    fetchTaxiLocations();

    // Refresh locations every 30 seconds
    const interval = setInterval(fetchTaxiLocations, 30000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (status === 'waiting' && currentRide) {
      const interval = setInterval(async () => {
        try {
          const updatedRide = await getRideStatus(currentRide.id);
          if (updatedRide.status !== 'pending') {
            setCurrentRide(updatedRide);
            setStatus('assigned');
          }
        } catch (error) {
          console.error('Failed to check ride status:', error);
        }
      }, 5000); // Check every 5 seconds

      return () => clearInterval(interval);
    }
  }, [status, currentRide]);

  useEffect(() => {
    if (status === 'assigned' && currentRide?.vehicleId) {
      const fetchLocation = async () => {
        try {
          const location = await getVehicleLocation(currentRide.vehicleId!);
          if (location) {
            setVehicleLocation(location);
          }
        } catch (error) {
          console.error('Failed to get vehicle location:', error);
        }
      };
      fetchLocation();
      // Update location every 30 seconds
      const interval = setInterval(fetchLocation, 30000);
      return () => clearInterval(interval);
    }
  }, [status, currentRide]);

  if (status === 'ordering') {
    return (
      <div className="min-h-screen bg-slate-900 text-white p-4">
        <div className="max-w-md mx-auto space-y-6">
          <h1 className="text-2xl font-bold text-center text-white">Vinné Taxi</h1>
          <div className="w-full glass card-hover p-6 rounded-2xl border border-slate-700/50">
            <h2 className="text-xl font-semibold mb-6 text-center text-white">{t('customer.orderTaxi')}</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2 text-slate-300">{t('customer.name')}</label>
                <input
                  type="text"
                  required
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  value={formData.customerName}
                  onChange={(e) => setFormData({ ...formData, customerName: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2 text-slate-300">{t('customer.phone')}</label>
                <input
                  type="tel"
                  required
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  value={formData.customerPhone}
                  onChange={(e) => setFormData({ ...formData, customerPhone: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2 text-slate-300">{t('customer.pickupLocation')}</label>
                <input
                  type="text"
                  required
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  value={formData.pickup}
                  onChange={(e) => setFormData({ ...formData, pickup: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2 text-slate-300">{t('customer.dropoffLocation')}</label>
                <input
                  type="text"
                  required
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  value={formData.dropoff}
                  onChange={(e) => setFormData({ ...formData, dropoff: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2 text-slate-300">{t('customer.passengers')}</label>
                <input
                  type="number"
                  min="1"
                  required
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  value={formData.passengers}
                  onChange={(e) => setFormData({ ...formData, passengers: parseInt(e.target.value) })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2 text-slate-300">{t('customer.pickupTime')}</label>
                <input
                  type="datetime-local"
                  required
                  className="w-full px-4 py-3 bg-slate-800 border border-slate-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-base sm:text-sm"
                  value={formData.pickupTime}
                  onChange={(e) => setFormData({ ...formData, pickupTime: e.target.value })}
                />
                <p className="text-xs text-slate-400 mt-1">{t('customer.tapToSelectTime')}</p>
              </div>
              <button
                type="submit"
                className="w-full bg-blue-600 hover:bg-blue-700 py-3 rounded-lg btn-modern text-white font-bold text-lg shadow-lg"
              >
                {t('customer.orderButton')}
              </button>
            </form>
          </div>

          {/* Available Taxis Map */}
          <div className="w-full glass card-hover p-6 rounded-2xl border border-slate-700/50">
            <h3 className="text-lg font-semibold mb-4 text-white">{t('customer.availableTaxis')}</h3>
            <p className="text-sm text-slate-300 mb-4">
              {t('customer.taxiLocationsDescription')}
            </p>
            <Map taxiLocations={taxiLocations} />
          </div>
        </div>
      </div>
    );
  }

  if (status === 'waiting') {
    return (
      <div className="min-h-screen bg-slate-900 text-white p-4">
        <div className="max-w-md mx-auto space-y-6">
          <h1 className="text-2xl font-bold text-center text-white">Vinné Taxi</h1>
          <div className="glass card-hover p-6 rounded-2xl border border-slate-700/50 shadow-lg text-center">
            <h2 className="text-xl font-semibold mb-4 text-white">{t('customer.waitingForAssignment')}</h2>
            <p className="text-slate-300 mb-4">{t('customer.waitingMessage')}</p>
            <div className="mt-4">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (status === 'assigned') {
    return (
      <div className="min-h-screen bg-slate-900 text-white p-4">
        <div className="max-w-md mx-auto space-y-6">
          <h1 className="text-2xl font-bold text-center text-white">Vinné Taxi</h1>

          <div className="w-full glass card-hover p-6 rounded-2xl border border-slate-700/50">
            <h2 className="text-xl font-semibold mb-4 text-white">{t('customer.rideAssigned')}</h2>
            <div className="space-y-2 text-slate-300">
              <p><span className="font-medium">{t('customer.driverOnWay')}</span></p>
              <p><span className="font-medium">{t('customer.vehicleId')}:</span> {currentRide?.vehicleId}</p>
              <p><span className="font-medium">{t('customer.eta')}:</span> 10 minutes</p> {/* TODO: Calculate real ETA */}
            </div>
          </div>

          <div className="w-full glass card-hover p-6 rounded-2xl border border-slate-700/50">
            <h3 className="text-lg font-semibold mb-4 text-white">🗺️ {t('customer.yourTaxi')}</h3>
            <div className="rounded-lg overflow-hidden">
              <Map vehicleLocation={vehicleLocation || undefined} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
}

export default App;