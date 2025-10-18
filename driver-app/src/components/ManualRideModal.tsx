import React, { useState, useEffect } from 'react';
import { CloseIcon, CheckCircleIcon, AlertTriangleIcon } from '../icons';
import { supabaseService, SUPABASE_ENABLED } from '../supabaseClient';
import { RideLog, RideStatus, RideType, DEFAULT_TARIFF } from '../types';
import { useTranslation } from '../contexts/LanguageContext';

interface ManualRideModalProps {
    onClose: () => void;
    vehicleNumber: number;
    licensePlate: string;
    onRideAdded: (ride?: RideLog) => void;
    onNavigateToDestination?: (stops: string[], navApp?: 'google' | 'mapy' | 'waze') => void;
    preferredNavApp?: 'google' | 'mapy' | 'waze';
    currentLocation?: { lat: number; lng: number } | null;
}

type ModalState = 'form' | 'loading' | 'success' | 'error';

export const ManualRideModal: React.FC<ManualRideModalProps> = ({
    onClose,
    vehicleNumber,
    licensePlate,
    onRideAdded,
    onNavigateToDestination,
    preferredNavApp = 'google',
    currentLocation
}) => {
    console.log('ManualRideModal opened with:', { vehicleNumber, licensePlate });
    console.log('SUPABASE_ENABLED:', SUPABASE_ENABLED);
    const { t } = useTranslation();
    // Initialize stops with current location as start if available
    const [stops, setStops] = useState<string[]>(() => {
        const initialStops = ['']; // destination
        if (currentLocation) {
            initialStops.unshift(`${currentLocation.lat.toFixed(6)}, ${currentLocation.lng.toFixed(6)}`);
        } else {
            initialStops.unshift('Aktuální poloha'); // Fallback if no GPS
        }
        return initialStops;
    });
    const [destination, setDestination] = useState('');
    const [waypoints, setWaypoints] = useState<string[]>([]);
    const [estimatedDistance, setEstimatedDistance] = useState<number | undefined>();
    const [estimatedPrice, setEstimatedPrice] = useState<number | undefined>();
    const [modalState, setModalState] = useState<ModalState>('form');
    const [error, setError] = useState<string | null>(null);

    // Calculate price based on distance using default tariff
    const calculatePrice = (distanceKm: number): number => {
        // Use default tariff rates - assuming car for manual rides
        const { startingFee, pricePerKmCar } = DEFAULT_TARIFF;
        return Math.round(startingFee + (distanceKm * pricePerKmCar));
    };

    // Auto-calculate price when distance changes
    useEffect(() => {
        if (estimatedDistance && estimatedDistance > 0) {
            const calculatedPrice = calculatePrice(estimatedDistance);
            setEstimatedPrice(calculatedPrice);
        } else {
            setEstimatedPrice(undefined);
        }
    }, [estimatedDistance]);

    const handleDestinationChange = (value: string) => {
        setDestination(value);
        const newStops = [...stops];
        newStops[stops.length - 1] = value; // Last element is destination
        setStops(newStops);
    };

    const addWaypoint = () => {
        setWaypoints([...waypoints, '']);
        const newStops = [...stops];
        newStops.splice(newStops.length - 1, 0, ''); // Insert before destination
        setStops(newStops);
    };

    const handleWaypointChange = (index: number, value: string) => {
        const newWaypoints = [...waypoints];
        newWaypoints[index] = value;
        setWaypoints(newWaypoints);

        const newStops = [...stops];
        newStops[index + 1] = value; // Waypoints start at index 1
        setStops(newStops);
    };

    const removeWaypoint = (index: number) => {
        const newWaypoints = waypoints.filter((_, i) => i !== index);
        setWaypoints(newWaypoints);

        const newStops = [...stops];
        newStops.splice(index + 1, 1); // Remove the waypoint
        setStops(newStops);
    };

    const validate = () => {
        if (!destination.trim()) {
            return false;
        }
        return true;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!validate()) {
            setError('Vyplňte prosím všechna povinná pole.');
            return;
        }

        await submitRide();
    };

    const submitRide = async () => {
        setError(null);
        setModalState('loading');

        try {
            // Calculate estimated completion time (assume 30 minutes for now)
            const estimatedCompletionTimestamp = Date.now() + 30 * 60 * 1000;

            // Create new ride log entry - first as PENDING, then immediately accept it
            const rideId = `manual-ride-${Date.now()}`;
            const newRide: RideLog = {
                id: rideId,
                timestamp: Date.now(),
                vehicleName: licensePlate,
                vehicleLicensePlate: licensePlate,
                driverName: null, // Will be set by the system
                vehicleType: null,
                rideType: RideType.BUSINESS,
                customerName: 'Přímý zákazník',
                customerPhone: '',
                stops,
                passengers: 1,
                pickupTime: 'ihned',
                status: RideStatus.Pending, // Create as pending first so dispatcher can see it's assigned
                vehicleId: vehicleNumber,
                notes: 'Přímá objednávka řidiče',
                estimatedPrice,
                estimatedPickupTimestamp: Date.now(),
                estimatedCompletionTimestamp,
                 fuelCost: undefined,
                 startMileage: undefined,
                 endMileage: undefined,
                 distance: estimatedDistance,
                purpose: undefined,
                businessPurpose: undefined
            };

            console.log('Creating manual ride:', {
                id: rideId,
                vehicleId: vehicleNumber,
                vehicleNumber,
                licensePlate,
                status: newRide.status,
                fullRide: newRide
            });

            // Add the ride as pending first
            console.log('Adding ride to database:', newRide);
            const result1 = await supabaseService.addRideLog(newRide);
            console.log('First addRideLog result:', result1);

            // Immediately accept/start the ride
            const acceptedRide: RideLog = {
                ...newRide,
                status: RideStatus.InProgress,
                acceptedAt: Date.now(),
                startedAt: Date.now()
            };

            console.log('Updating ride to in progress:', acceptedRide);
            const result2 = await supabaseService.addRideLog(acceptedRide);
            console.log('Second addRideLog result:', result2);

            // Update vehicle status to BUSY
            const vehicles = await supabaseService.getVehicles();
            const updatedVehicles = vehicles.map(v =>
                v.id === vehicleNumber ? { ...v, status: 'BUSY', freeAt: estimatedCompletionTimestamp } : v
            );
            await supabaseService.updateVehicles(updatedVehicles);

            setModalState('success');

            // Notify parent component to refresh data
            setTimeout(() => {
                onRideAdded(acceptedRide);
                onClose();
            }, 2000);

        } catch (err: any) {
            console.error('Error creating manual ride:', err);
            setError(err.message || 'Došlo k chybě při vytváření jízdy.');
            setModalState('error');
        }
    };

    const renderContent = () => {
        switch (modalState) {
            case 'loading':
                return (
                    <div className="text-center p-8">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
                        <p className="text-gray-300">Vytváření jízdy...</p>
                    </div>
                );
            case 'success':
                return (
                    <div className="text-center p-8">
                        <CheckCircleIcon className="w-16 h-16 text-green-400 mx-auto mb-4" />
                        <h3 className="text-2xl font-bold text-white mb-2">Jízda byla přidána!</h3>
                        <p className="text-gray-300 mb-4">
                            Přímá jízda byla úspěšně přidána a zahájena.
                        </p>
                        {onNavigateToDestination && (
                            <button
                                onClick={() => onNavigateToDestination(stops, preferredNavApp)}
                                className="w-full bg-purple-600 hover:bg-purple-700 py-3 rounded-lg btn-modern text-white font-medium text-lg shadow-lg"
                            >
                                🗺️ Otevřít navigaci ({preferredNavApp === 'google' ? 'Google Maps' : preferredNavApp === 'mapy' ? 'Mapy.cz' : 'Waze'})
                            </button>
                        )}
                    </div>
                );
            case 'error':
                return (
                    <div className="text-center p-8">
                        <AlertTriangleIcon className="w-16 h-16 text-red-400 mx-auto mb-4" />
                        <h3 className="text-2xl font-bold text-white mb-2">Chyba při vytváření jízdy</h3>
                        <p className="text-gray-300 mb-6">{error}</p>
                        <button onClick={() => setModalState('form')} className="px-6 py-3 text-sm font-medium rounded-lg bg-slate-600 text-gray-200 hover:bg-slate-500 transform hover:scale-105 transition-all duration-200">
                            Zkusit znovu
                        </button>
                    </div>
                );
            case 'form':
            default:
                return (
                    <form onSubmit={handleSubmit}>
                        <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
                              {/* Starting point info */}
                              {currentLocation && (
                                  <div className="bg-slate-700/50 rounded-lg p-3">
                                      <p className="text-sm text-gray-300">
                                          <span className="font-medium">Začátek:</span> Aktuální poloha řidiče ({currentLocation.lat.toFixed(4)}, {currentLocation.lng.toFixed(4)})
                                      </p>
                                  </div>
                              )}

                              <div>
                                  <label className="block text-sm font-medium text-gray-300 mb-1">Cíl</label>
                                  <input
                                      type="text"
                                      value={destination}
                                      onChange={(e) => handleDestinationChange(e.target.value)}
                                      placeholder="Adresa cíle"
                                      className="w-full bg-slate-700 border border-slate-600 rounded-md py-2 px-3 text-white"
                                      required
                                  />
                              </div>

                              {/* Waypoints */}
                              {waypoints.map((waypoint, index) => (
                                  <div key={index}>
                                      <div className="flex items-center justify-between mb-1">
                                          <label className="block text-sm font-medium text-gray-300">Mezizastávka {index + 1}</label>
                                          <button
                                              type="button"
                                              onClick={() => removeWaypoint(index)}
                                              className="text-red-400 hover:text-red-300 text-sm"
                                          >
                                              Odebrat
                                          </button>
                                      </div>
                                      <input
                                          type="text"
                                          value={waypoint}
                                          onChange={(e) => handleWaypointChange(index, e.target.value)}
                                          placeholder="Adresa mezizastávky"
                                          className="w-full bg-slate-700 border border-slate-600 rounded-md py-2 px-3 text-white"
                                      />
                                  </div>
                              ))}

                              <button
                                  type="button"
                                  onClick={addWaypoint}
                                  className="w-full bg-slate-600 hover:bg-slate-500 py-2 rounded-lg text-white font-medium text-sm"
                              >
                                  ➕ Přidat mezizastávku
                              </button>

                              <div>
                                  <label className="block text-sm font-medium text-gray-300 mb-1">Odhadovaná vzdálenost (km) - volitelné</label>
                                  <input
                                      type="number"
                                      value={estimatedDistance || ''}
                                      onChange={(e) => setEstimatedDistance(e.target.value ? parseFloat(e.target.value) : undefined)}
                                      placeholder="Např. 15.5"
                                      min="0"
                                      step="0.1"
                                      className="w-full bg-slate-700 border border-slate-600 rounded-md py-2 px-3 text-white"
                                  />
                                   <p className="text-xs text-gray-400 mt-1">
                                       Volitelné - slouží pouze pro automatický výpočet ceny podle tarifů
                                   </p>
                              </div>

                              <div>
                                  <label className="block text-sm font-medium text-gray-300 mb-1">
                                      Odhadovaná cena {estimatedDistance ? '(vypočítáno z vzdálenosti)' : '(volitelné)'}
                                  </label>
                                  <input
                                      type="number"
                                      value={estimatedPrice || ''}
                                      onChange={(e) => setEstimatedPrice(e.target.value ? parseInt(e.target.value, 10) : undefined)}
                                      placeholder={estimatedDistance ? `${calculatePrice(estimatedDistance)} Kč` : "Zadejte částku v Kč"}
                                      className="w-full bg-slate-700 border border-slate-600 rounded-md py-2 px-3 text-white"
                                  />
                                  {estimatedDistance && estimatedPrice && (
                                      <p className="text-xs text-green-400 mt-1">
                                          Automaticky vypočítáno: {calculatePrice(estimatedDistance)} Kč
                                          {estimatedPrice !== calculatePrice(estimatedDistance) && (
                                              <span className="text-yellow-400 ml-2">(manuálně upraveno)</span>
                                          )}
                                      </p>
                                  )}
                              </div>

                             {error && <p className="text-sm text-red-400">{error}</p>}
                        </div>

                        <div className="flex justify-end items-center p-6 bg-slate-900 border-t border-slate-700 rounded-b-lg space-x-3">
                            <button type="button" onClick={onClose} className="px-6 py-3 text-sm font-medium rounded-lg bg-slate-600 text-gray-200 hover:bg-slate-500 transform hover:scale-105 transition-all duration-200">
                                Zrušit
                            </button>
                            <button type="submit" className="px-6 py-3 text-sm font-bold rounded-2xl shadow-lg text-slate-900 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 transform hover:scale-105 transition-all duration-200 border-2 border-green-400">
                                🚕 Přidat jízdu
                            </button>
                        </div>
                    </form>
                );
        }
    };

    return (
        <div className="fixed inset-0 bg-black/70 z-50 flex justify-center items-center p-4 animate-fade-in" role="dialog" aria-modal="true">
            <div className="bg-slate-800 rounded-lg shadow-2xl w-full max-w-md relative">
                <div className="flex justify-between items-center p-6 border-b border-slate-700">
                    <h2 className="text-xl font-semibold">Přidat přímou jízdu</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-white p-1 rounded-full hover:bg-slate-600 transition-colors">
                        <CloseIcon />
                    </button>
                </div>
                {renderContent()}
            </div>
        </div>
    );
};