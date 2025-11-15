import React, { useState, useEffect } from 'react';
import { supabaseService } from '../supabaseClient';
import { useTranslation } from '../contexts/LanguageContext';

const DriverSelection: React.FC = () => {
  const { t } = useTranslation();
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [drivers, setDrivers] = useState<any[]>([]);
  const [selectedVehicle, setSelectedVehicle] = useState<number | null>(null);
  const [selectedDriver, setSelectedDriver] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState<'selection' | 'odometer' | 'shift-started'>('selection');
  const [odometerReading, setOdometerReading] = useState<string>('');
  const [driverStatus, setDriverStatus] = useState<'offline' | 'available' | 'on_ride' | 'break' | 'refueling' | 'pause'>('offline');

  // Handle shift started transition
  useEffect(() => {
    if (currentStep === 'shift-started') {
      // Force re-render of App component by updating localStorage
      const event = new Event('storage');
      window.dispatchEvent(event);
    }
  }, [currentStep]);

  useEffect(() => {
    const loadData = async () => {
      try {
        const [vehiclesData, driversData] = await Promise.all([
          supabaseService.getVehicles(),
          supabaseService.getPeople()
        ]);
        setVehicles(vehiclesData);
        setDrivers(driversData.filter(p => p.role === 'Driver')); // Only show drivers
      } catch (err: any) {
        console.error('Failed to load data:', err);
        setError(err.message || 'Failed to load data');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);



  const handleStartShift = () => {
    if (selectedVehicle && selectedDriver) {
      setCurrentStep('odometer');
    }
  };

  const handleConfirmOdometer = () => {
    const odoValue = parseFloat(odometerReading);
    if (isNaN(odoValue) || odoValue < 0) {
      alert('Zadejte platné číslo pro stav tachometru');
      return;
    }

    const vehicle = vehicles.find(v => v.id === selectedVehicle);
    const driver = drivers.find(d => d.id === selectedDriver);

    if (vehicle && driver) {
      console.log('Storing driver info:', { driverId: driver.id, driverName: driver.name, vehicleId: vehicle.id });
      // Store selected driver and vehicle info in localStorage for Dashboard to use
      localStorage.setItem('selectedDriverId', driver.id.toString()); // Use driver ID, not vehicle ID
      localStorage.setItem('selectedDriverName', driver.name);
      localStorage.setItem('selectedDriverEmail', vehicle.email || '');
      localStorage.setItem('selectedVehicleId', vehicle.id.toString());
      localStorage.setItem('licensePlate', vehicle.licensePlate || '');
      localStorage.setItem('shiftStartOdo', odoValue.toString());

      // Initialize shift data
      localStorage.setItem('shiftStartTimestamp', Date.now().toString());
      localStorage.setItem('driverStatus', 'available');
      localStorage.setItem('isShiftActive', 'true');

      setCurrentStep('shift-started');
    }
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

  // Step 1: Vehicle and Driver Selection
  if (currentStep === 'selection') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-900">
        <div className="glass card-hover p-8 rounded-2xl shadow-frost w-full max-w-md border border-slate-700/50">
          <h1 className="text-2xl font-bold text-center mb-6 text-white">
            🚗 Zahájit směnu
          </h1>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2 text-slate-300">
                Vyberte vozidlo:
              </label>
              <select
                value={selectedVehicle || ''}
                onChange={(e) => setSelectedVehicle(parseInt(e.target.value) || null)}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white focus:ring-2 focus:ring-blue-400"
                required
              >
                <option value="" disabled>Vyberte vozidlo...</option>
                {vehicles.map((vehicle) => (
                  <option key={vehicle.id} value={vehicle.id}>
                    {vehicle.name || vehicle.licensePlate || `Vozidlo ${vehicle.id}`}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2 text-slate-300">
                Vyberte řidiče:
              </label>
              <select
                value={selectedDriver || ''}
                onChange={(e) => setSelectedDriver(parseInt(e.target.value) || null)}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white focus:ring-2 focus:ring-blue-400"
                required
              >
                <option value="" disabled>Vyberte řidiče...</option>
                {drivers.map((driver) => (
                  <option key={driver.id} value={driver.id}>
                    {driver.name}
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={handleStartShift}
              disabled={!selectedVehicle || !selectedDriver}
              className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed py-3 rounded-md font-medium text-white transition-colors"
            >
              🚀 Zahájit směnu
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Step 2: Odometer Reading
  if (currentStep === 'odometer') {
    const vehicle = vehicles.find(v => v.id === selectedVehicle);
    const driver = drivers.find(d => d.id === selectedDriver);

    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-900">
        <div className="glass card-hover p-8 rounded-2xl shadow-frost w-full max-w-md border border-slate-700/50">
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold text-white mb-2">
              Vítejte, {driver?.name}!
            </h1>
            <p className="text-slate-300">
              Vozidlo: {vehicle?.name || vehicle?.licensePlate || `Vozidlo ${vehicle?.id}`}
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2 text-slate-300">
                Aktuální stav tachometru (km):
              </label>
              <input
                type="number"
                value={odometerReading}
                onChange={(e) => setOdometerReading(e.target.value)}
                placeholder={vehicle?.mileage ? `Aktuální: ${vehicle.mileage} km` : "Např. 125430"}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white focus:ring-2 focus:ring-blue-400"
                min="0"
                step="1"
                autoFocus
              />
              {vehicle?.mileage && (
                <p className="text-xs text-slate-400 mt-1">
                  Poslední záznam: {vehicle.mileage} km
                </p>
              )}
            </div>

            <button
              onClick={handleConfirmOdometer}
              disabled={!odometerReading.trim()}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed py-3 rounded-md font-medium text-white transition-colors"
            >
              ✅ Potvrdit a pokračovat
            </button>

            <button
              onClick={() => setCurrentStep('selection')}
              className="w-full bg-slate-600 hover:bg-slate-500 py-2 rounded-md font-medium text-white transition-colors text-sm"
            >
              ← Zpět k výběru
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Step 3: Shift Started - Show main app trigger
  if (currentStep === 'shift-started') {
    return null; // App.tsx will handle showing Dashboard
  }


};

export default DriverSelection;