import React, { useState, useEffect } from 'react';
import { supabaseService } from '../supabaseClient';
import { useTranslation } from '../contexts/LanguageContext';

const DriverSelection: React.FC = () => {
  const { t } = useTranslation();
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [selectedVehicle, setSelectedVehicle] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
        
        // Reload the app to pick up the selected driver
        window.location.reload();
      }
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

  return (
    <div className="flex items-center justify-center min-h-screen bg-slate-900">
      <div className="glass card-hover p-8 rounded-2xl shadow-frost w-full max-w-md border border-slate-700/50">
        <h1 className="text-2xl font-bold text-center mb-6 text-white">
          Výběr řidiče
        </h1>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2 text-slate-300">
              Vyberte své vozidlo:
            </label>
            <select
              value={selectedVehicle || ''}
              onChange={(e) => setSelectedVehicle(parseInt(e.target.value))}
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

          <button
            onClick={handleSelectDriver}
            disabled={!selectedVehicle}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed py-3 rounded-md font-medium text-white transition-colors"
          >
            Pokračovat
          </button>
        </div>
      </div>
    </div>
  );
};

export default DriverSelection;