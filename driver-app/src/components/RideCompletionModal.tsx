import React, { useState } from 'react';
import { CloseIcon, CheckCircleIcon, AlertTriangleIcon } from '../icons';
import { supabase, supabaseService } from '../supabaseClient';
import { RideLog, RideStatus } from '../types';

interface RideCompletionModalProps {
    onClose: () => void;
    ride: RideLog;
    vehicleNumber: number;
    onRideCompleted: () => void;
}

type ModalState = 'form' | 'loading' | 'success' | 'error';

export const RideCompletionModal: React.FC<RideCompletionModalProps> = ({
    onClose,
    ride,
    vehicleNumber,
    onRideCompleted
}) => {
    const [finalPrice, setFinalPrice] = useState<number | undefined>(ride.estimatedPrice);
    const [modalState, setModalState] = useState<ModalState>('form');
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        await completeRide();
    };

    const completeRide = async () => {
        setError(null);
        setModalState('loading');

        try {
            // Update the ride with final price and completed status
            const updatedRide = {
                ...ride,
                status: RideStatus.Completed,
                estimatedPrice: finalPrice, // Use final price as estimated price
                completedAt: Date.now()
            };

            // Update the ride in the database
            console.log('Completing ride:', ride.id, 'with status:', updatedRide.status, 'price:', finalPrice);
            await supabaseService.addRideLog(updatedRide);
            console.log('Ride completion database update completed');

            // Notify dispatcher of ride update
            supabase.channel('ride_updates').send({
              type: 'broadcast',
              event: 'ride_updated',
              payload: { rideId: ride.id }
            });

            setModalState('success');

            // Notify parent component to refresh data
            setTimeout(() => {
                onRideCompleted();
                onClose();
            }, 2000);

        } catch (err: any) {
            console.error('Error completing ride:', err);
            setError(err.message || 'Došlo k chybě při dokončování jízdy.');
            setModalState('error');
        }
    };

    const renderContent = () => {
        switch (modalState) {
            case 'loading':
                return (
                    <div className="text-center p-8">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
                        <p className="text-gray-300">Dokončování jízdy...</p>
                    </div>
                );
            case 'success':
                return (
                    <div className="text-center p-8">
                        <CheckCircleIcon className="w-16 h-16 text-green-400 mx-auto mb-4" />
                        <h3 className="text-2xl font-bold text-white mb-2">Jízda dokončena!</h3>
                        <p className="text-gray-300">
                            Jízda byla úspěšně dokončena s cenou {finalPrice} Kč.
                        </p>
                    </div>
                );
            case 'error':
                return (
                    <div className="text-center p-8">
                        <AlertTriangleIcon className="w-16 h-16 text-red-400 mx-auto mb-4" />
                        <h3 className="text-2xl font-bold text-white mb-2">Chyba při dokončování jízdy</h3>
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
                        <div className="p-6 space-y-4">
                            <div className="text-center mb-4">
                                <h3 className="text-lg font-semibold text-white">Dokončit jízdu</h3>
                                <p className="text-sm text-gray-300">
                                    Zákazník: {ride.customerName} • {ride.stops[0]} → {ride.stops[ride.stops.length - 1]}
                                </p>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-1">Konečná cena (Kč)</label>
                                <input
                                    type="number"
                                    value={finalPrice || ''}
                                    onChange={(e) => setFinalPrice(e.target.value ? parseInt(e.target.value, 10) : undefined)}
                                    placeholder="Zadejte konečnou cenu"
                                    className="w-full bg-slate-700 border border-slate-600 rounded-md py-2 px-3 text-white"
                                    min="0"
                                    step="1"
                                    autoFocus
                                />
                            </div>

                            {error && <p className="text-sm text-red-400">{error}</p>}
                        </div>

                        <div className="flex justify-end items-center p-6 bg-slate-900 border-t border-slate-700 rounded-b-lg space-x-3">
                            <button type="button" onClick={onClose} className="px-6 py-3 text-sm font-medium rounded-lg bg-slate-600 text-gray-200 hover:bg-slate-500 transform hover:scale-105 transition-all duration-200">
                                Zrušit
                            </button>
                            <button type="submit" className="px-6 py-3 text-sm font-bold rounded-2xl shadow-lg text-slate-900 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 transform hover:scale-105 transition-all duration-200 border-2 border-green-400">
                                ✅ Dokončit jízdu
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
                    <h2 className="text-xl font-semibold">Dokončení jízdy</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-white p-1 rounded-full hover:bg-slate-600 transition-colors">
                        <CloseIcon />
                    </button>
                </div>
                {renderContent()}
            </div>
        </div>
    );
};