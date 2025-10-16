import React, { useState } from 'react';
import { CloseIcon, CheckCircleIcon, AlertTriangleIcon } from '../icons';
import { supabaseService, SUPABASE_ENABLED } from '../supabaseClient';
import { RideLog, RideStatus, RideType } from '../types';
import { useTranslation } from '../contexts/LanguageContext';

interface ManualRideModalProps {
    onClose: () => void;
    vehicleNumber: number;
    licensePlate: string;
    onRideAdded: () => void;
    onNavigateToDestination?: (stops: string[], navApp?: 'google' | 'mapy') => void;
    preferredNavApp?: 'google' | 'mapy';
}

type ModalState = 'form' | 'loading' | 'success' | 'error';

export const ManualRideModal: React.FC<ManualRideModalProps> = ({
    onClose,
    vehicleNumber,
    licensePlate,
    onRideAdded,
    onNavigateToDestination,
    preferredNavApp = 'google'
}) => {
    console.log('ManualRideModal opened with:', { vehicleNumber, licensePlate });
    console.log('SUPABASE_ENABLED:', SUPABASE_ENABLED);
    const { t } = useTranslation();
    const [stops, setStops] = useState<string[]>(['', '']);
    const [customerName, setCustomerName] = useState('');
    const [customerPhone, setCustomerPhone] = useState('');
    const [passengers, setPassengers] = useState(1);
    const [notes, setNotes] = useState('');
    const [estimatedPrice, setEstimatedPrice] = useState<number | undefined>();
    const [modalState, setModalState] = useState<ModalState>('form');
    const [error, setError] = useState<string | null>(null);

    const handleStopChange = (index: number, value: string) => {
        const newStops = [...stops];
        newStops[index] = value;
        setStops(newStops);
    };

    const validate = () => {
        if (!stops[0].trim() || !stops[1].trim()) {
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
                customerName: customerName || 'Neznámý zákazník',
                customerPhone: customerPhone || '',
                stops,
                passengers: passengers || 1,
                pickupTime: 'ihned',
                status: RideStatus.Pending, // Create as pending first so dispatcher can see it's assigned
                vehicleId: vehicleNumber,
                notes: notes || 'Přímá objednávka řidiče',
                estimatedPrice,
                estimatedPickupTimestamp: Date.now(),
                estimatedCompletionTimestamp,
                fuelCost: undefined,
                startMileage: undefined,
                endMileage: undefined,
                distance: undefined,
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
                onRideAdded();
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
                        <p className="text-gray-300">
                            Jízda pro {customerName} byla úspěšně přidána a zahájena.
                        </p>
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
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-1">Odkud</label>
                                <input
                                    type="text"
                                    value={stops[0]}
                                    onChange={(e) => handleStopChange(0, e.target.value)}
                                    placeholder="Adresa vyzvednutí"
                                    className="w-full bg-slate-700 border border-slate-600 rounded-md py-2 px-3 text-white"
                                    required
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-1">Kam</label>
                                <input
                                    type="text"
                                    value={stops[1]}
                                    onChange={(e) => handleStopChange(1, e.target.value)}
                                    placeholder="Adresa cíle"
                                    className="w-full bg-slate-700 border border-slate-600 rounded-md py-2 px-3 text-white"
                                    required
                                />
                            </div>

                            {/* Navigation Button */}
                            {stops[0] && stops[1] && onNavigateToDestination && (
                                <div className="mt-2">
                                    <button
                                        type="button"
                                        onClick={() => onNavigateToDestination(stops, preferredNavApp)}
                                        className="w-full bg-purple-600 hover:bg-purple-700 py-2 rounded-lg btn-modern text-white font-medium text-sm"
                                    >
                                        🗺️ Navigovat ({preferredNavApp === 'google' ? 'Google Maps' : 'Mapy.cz'})
                                    </button>
                                </div>
                            )}

                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-1">Jméno zákazníka (volitelné)</label>
                                <input
                                    type="text"
                                    value={customerName}
                                    onChange={(e) => setCustomerName(e.target.value)}
                                    placeholder="Jméno a příjmení"
                                    className="w-full bg-slate-700 border border-slate-600 rounded-md py-2 px-3 text-white"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-1">Telefon (volitelné)</label>
                                <input
                                    type="tel"
                                    value={customerPhone}
                                    onChange={(e) => setCustomerPhone(e.target.value)}
                                    placeholder="+420 XXX XXX XXX"
                                    className="w-full bg-slate-700 border border-slate-600 rounded-md py-2 px-3 text-white"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-1">Počet cestujících (volitelné)</label>
                                <input
                                    type="number"
                                    value={passengers}
                                    onChange={(e) => setPassengers(parseInt(e.target.value, 10) || 1)}
                                    min="1"
                                    max="8"
                                    className="w-full bg-slate-700 border border-slate-600 rounded-md py-2 px-3 text-white"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-1">Odhadovaná cena (volitelné)</label>
                                <input
                                    type="number"
                                    value={estimatedPrice || ''}
                                    onChange={(e) => setEstimatedPrice(e.target.value ? parseInt(e.target.value, 10) : undefined)}
                                    placeholder="Kč"
                                    className="w-full bg-slate-700 border border-slate-600 rounded-md py-2 px-3 text-white"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-1">Poznámky (volitelné)</label>
                                <textarea
                                    value={notes}
                                    onChange={(e) => setNotes(e.target.value)}
                                    placeholder="Další informace o jízdě..."
                                    rows={3}
                                    className="w-full bg-slate-700 border border-slate-600 rounded-md py-2 px-3 text-white"
                                />
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