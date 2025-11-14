import React, { useState, useEffect } from 'react';
import { supabaseService } from '../supabaseClient';
import { useTranslation } from '../contexts/LanguageContext';

const DriverSelection: React.FC = () => {
  const { t } = useTranslation();
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [selectedVehicle, setSelectedVehicle] = useState<number | null>(null);
  const [selectedDriver, setSelectedDriver] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [shiftStarted, setShiftStarted] = useState(false);
  const [driverStatus, setDriverStatus] = useState<'offline' | 'available' | 'on_ride' | 'break' | 'refueling' | 'pause'>('offline');

  useEffect(() => {
    const loadVehicles = async () => {
      try {
        const vehiclesData = await supabaseService.getVehicles();
        setVehicles(vehiclesData.filter(v => v.email)); // Only show vehicles with assigned drivers
      } catch (err: any) {
        console.error('Failed to load vehicles:', err);
        setError(err.message || 'Failed to load vehicles');
      } finally {
        setLoading(false);
      }
    };

    loadVehicles();
  }, []);

  const handleSelectDriver = () => {
    if (selectedVehicle) {
      const vehicle = vehicles.find(v => v.id === selectedVehicle);
      if (vehicle) {
        // Store selected driver info in localStorage for Dashboard to use
        localStorage.setItem('selectedDriverId', vehicle.id.toString());
        localStorage.setItem('selectedDriverName', vehicle.name || `Vehicle ${vehicle.id}`);
        localStorage.setItem('selectedDriverEmail', vehicle.email);
        localStorage.setItem('selectedVehicleId', vehicle.id.toString());
        localStorage.setItem('licensePlate', vehicle.licensePlate || '');
        
        // Initialize shift data
        localStorage.setItem('shiftStartTimestamp', Date.now().toString());
        localStorage.setItem('driverStatus', 'available');
        localStorage.setItem('isShiftActive', 'true');
        
        setShiftStarted(true);
      }
    }
  };

  const handleStartShift = () => {
    if (selectedVehicle && selectedDriver.trim()) {
      const vehicle = vehicles.find(v => v.id === selectedVehicle);
      if (vehicle) {
        // Store selected driver info in localStorage for Dashboard to use
        localStorage.setItem('selectedDriverId', vehicle.id.toString());
        localStorage.setItem('selectedDriverName', selectedDriver.trim());
        localStorage.setItem('selectedDriverEmail', vehicle.email);
        localStorage.setItem('selectedVehicleId', vehicle.id.toString());
        localStorage.setItem('licensePlate', vehicle.licensePlate || '');
        
        // Initialize shift data
        localStorage.setItem('shiftStartTimestamp', Date.now().toString());
        localStorage.setItem('driverStatus', 'available');
        localStorage.setItem('isShiftActive', 'true');
        
        setShiftStarted(true);
      }
    }
  };

  const handleLogOff = () => {
    // Clear all driver data
    localStorage.removeItem('selectedDriverId');
    localStorage.removeItem('selectedDriverName');
    localStorage.removeItem('selectedDriverEmail');
    localStorage.removeItem('selectedVehicleId');
    localStorage.removeItem('licensePlate');
    localStorage.removeItem('shiftStartTimestamp');
    localStorage.removeItem('driverStatus');
    localStorage.removeItem('isShiftActive');
    localStorage.removeItem('shiftCash');
    localStorage.removeItem('shiftStartTime');
    localStorage.removeItem('shiftEndTimestamp');
    
    // Reload to selection screen
    window.location.reload();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
          <p className="text-white">Načítání řidičů...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-900">
        <div className="text-center max-w-md">
          <div className="text-red-400 text-6xl mb-4">⚠️</div>
          <h2 className="text-xl font-bold mb-2 text-white">Chyba připojení</h2>
          <p className="text-slate-300 mb-4">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-white"
          >
            Zkusit znovu
          </button>
        </div>
      </div>
    );
  }

  // Show vehicle selection
  if (!shiftStarted) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-900">
        <div className="glass card-hover p-8 rounded-2xl shadow-frost w-full max-w-md border border-slate-700/50">
          <h1 className="text-2xl font-bold text-center mb-6 text-white">
            Výběr vozidla
          </h1>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2 text-slate-300">
                Vyberte své vozidlo:
              </label>
              <select
                value={selectedVehicle || ''}
                onChange={(e) => {
                  const vehicleId = parseInt(e.target.value);
                  setSelectedVehicle(vehicleId);
                  const vehicle = vehicles.find(v => v.id === vehicleId);
                  if (vehicle) {
                    setSelectedDriver(vehicle.name || `Řidič ${vehicleId}`);
                  }
                }}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white focus:ring-2 focus:ring-blue-400"
                required
              >
                <option value="" disabled>Vyberte vozidlo...</option>
                {vehicles.map((vehicle) => (
                  <option key={vehicle.id} value={vehicle.id}>
                    {vehicle.name || `Vehicle ${vehicle.id}`} - {vehicle.licensePlate || 'No Plate'}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2 text-slate-300">
                Vaše jméno (pokud se liší od jména vozidla):
              </label>
              <input
                type="text"
                value={selectedDriver}
                onChange={(e) => setSelectedDriver(e.target.value)}
                placeholder="Např. Jan Novák"
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white focus:ring-2 focus:ring-blue-400"
              />
            </div>

            <button
              onClick={handleStartShift}
              disabled={!selectedVehicle}
              className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed py-3 rounded-md font-medium text-white transition-colors"
            >
              🚗 Začít směnu
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Show shift control panel
  if (shiftStarted) {
    const vehicle = vehicles.find(v => v.id === selectedVehicle);
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-900">
        <div className="glass card-hover p-8 rounded-2xl shadow-frost w-full max-w-md border border-slate-700/50">
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold text-white mb-2">
              {selectedDriver || vehicle?.name || `Vehicle ${vehicle?.id}`}
            </h1>
            <p className="text-slate-300 mb-1">
              {vehicle?.licensePlate || 'No Plate'}
            </p>
            {selectedDriver && (
              <p className="text-green-400 text-sm">
                Řidič: {selectedDriver}
              </p>
            )}
          </div>

          <div className="space-y-4">
            <div className="text-center">
              <div className="inline-flex items-center space-x-2 mb-4">
                <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
                <span className="text-green-400 font-medium">Směna aktivní</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setDriverStatus('available')}
                className={`py-3 px-4 rounded-lg font-medium transition-colors ${
                  driverStatus === 'available' 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
              >
                🟢 Dostupný
              </button>
              
              <button
                onClick={() => setDriverStatus('break')}
                className={`py-3 px-4 rounded-lg font-medium transition-colors ${
                  driverStatus === 'break' 
                    ? 'bg-yellow-600 text-white' 
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
              >
                ☕ Přestávka
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setDriverStatus('refueling')}
                className={`py-3 px-4 rounded-lg font-medium transition-colors ${
                  driverStatus === 'refueling' 
                    ? 'bg-orange-600 text-white' 
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
              >
                ⛽ Tankování
              </button>
              
              <button
                onClick={() => setDriverStatus('pause')}
                className={`py-3 px-4 rounded-lg font-medium transition-colors ${
                  driverStatus === 'pause' 
                    ? 'bg-purple-600 text-white' 
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
              >
                ⏸️ Dočasně nedostupný
              </button>
            </div>

            <button
              onClick={handleLogOff}
              className="w-full bg-red-600 hover:bg-red-700 py-3 rounded-lg font-medium text-white transition-colors mt-6"
            >
              🏁 Ukončit směnu a odhlásit
            </button>
          </div>
        </div>
      </div>
    );
  }
};

export default DriverSelection;