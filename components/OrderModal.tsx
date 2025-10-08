import React, { useState } from 'react';
import { CloseIcon, CheckCircleIcon, AlertTriangleIcon } from './icons';
import { AutocompleteInputField } from './AutocompleteInputField';
import { LoadingSpinner } from './LoadingSpinner';
import type { RideRequest } from '../types';
import { processCustomerOrder, OrderResult, type OrderError } from '../services/customerOrderService';
import { useTranslation } from '../contexts/LanguageContext';

interface OrderModalProps {
    onClose: () => void;
}

type ModalState = 'form' | 'loading' | 'success' | 'error';

export const OrderModal: React.FC<OrderModalProps> = ({ onClose }) => {
    const { t, language } = useTranslation();
    const [stops, setStops] = useState<string[]>(['', '']);
    const [customerName, setCustomerName] = useState('');
    const [customerPhone, setCustomerPhone] = useState('');
    const [phoneEdited, setPhoneEdited] = useState(false);
    const [phoneWarningVisible, setPhoneWarningVisible] = useState(false);
    const [phoneConfirmVisible, setPhoneConfirmVisible] = useState(false);
    const [passengers, setPassengers] = useState(1);
    const [pickupTime, setPickupTime] = useState('ihned');
    const [isScheduled, setIsScheduled] = useState(false);
    const [modalState, setModalState] = useState<ModalState>('form');
    const [result, setResult] = useState<OrderResult | null>(null);
    const [error, setError] = useState<string | null>(null);

    const handleStopChange = (index: number, value: string) => {
        const newStops = [...stops];
        newStops[index] = value;
        setStops(newStops);
    };

    const formatDateForPicker = (date: Date): string => {
        const year = date.getFullYear();
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const day = date.getDate().toString().padStart(2, '0');
        const hours = date.getHours().toString().padStart(2, '0');
        const minutes = date.getMinutes().toString().padStart(2, '0');
        return `${year}-${month}-${day}T${hours}:${minutes}`;
    };

    const handleScheduleToggle = (checked: boolean) => {
        setIsScheduled(checked);
        if (checked) {
            if (pickupTime === 'ihned') {
                const defaultScheduleTime = new Date(Date.now() + 60 * 60 * 1000);
                setPickupTime(formatDateForPicker(defaultScheduleTime));
            }
        } else {
            setPickupTime('ihned');
        }
    };

    const handleQuickTimeSelect = (minutes?: number) => {
        if (typeof minutes === 'undefined') {
            setIsScheduled(false);
            setPickupTime('ihned');
        } else {
            const newTime = new Date(Date.now() + minutes * 60 * 1000);
            setPickupTime(formatDateForPicker(newTime));
            if (!isScheduled) setIsScheduled(true);
        }
    };

    const validate = () => {
        if (!stops.every(s => s.trim() !== '') || !customerName.trim() || !customerPhone.trim() || passengers <= 0) {
            return false;
        }
        if (isScheduled && new Date(pickupTime).getTime() <= Date.now()) {
            setError('Plánovaný čas musí být v budoucnosti.');
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

        // If phone was not edited by the user, show an inline warning and ask for confirmation via in-app modal
        if (!phoneEdited) {
            setPhoneWarningVisible(true);
            setPhoneConfirmVisible(true);
            return; // wait for explicit in-app confirmation
        }

        // Proceed with submission
        await submitOrder();
    };

    const submitOrder = async () => {
        setError(null);
        setModalState('loading');

        const rideRequest: RideRequest = {
            stops,
            customerName,
            customerPhone,
            passengers,
            pickupTime,
        };

        try {
            const orderResult = await processCustomerOrder(rideRequest);
            if (orderResult.success) {
                setResult(orderResult);
                setModalState('success');
            } else {
                setError((orderResult as OrderError).errorMessage || t('error.unknown'));
                setModalState('error');
            }
        } catch (err: any) {
            setError(err.message || t('error.unknown'));
            setModalState('error');
        }
    };

    const renderContent = () => {
        switch (modalState) {
            case 'loading':
                return <LoadingSpinner text="Hledáme pro vás odvoz..." />;
            case 'success':
                return (
                    <div className="text-center p-8">
                        <CheckCircleIcon className="w-16 h-16 text-green-400 mx-auto mb-4" />
                        <h3 className="text-2xl font-bold text-white mb-2">Jízda je na cestě!</h3>
                        <p className="text-gray-300">
                            <strong>{result?.vehicleName}</strong> pro vás přijede přibližně za <strong>{result?.eta} minut</strong>.
                        </p>
                        <p className="text-gray-400 text-sm mt-1">Řídí: {result?.driverName || 'N/A'}</p>
                        <button onClick={onClose} className="mt-6 w-full px-6 py-3 text-sm font-bold rounded-2xl bg-gradient-to-r from-cyan-600 to-blue-600 text-white hover:from-cyan-700 hover:to-blue-700 transform hover:scale-105 transition-all duration-200 shadow-lg">
                            ✅ Zavřít
                        </button>
                    </div>
                );
             case 'error':
                return (
                    <div className="text-center p-8">
                        <AlertTriangleIcon className="w-16 h-16 text-red-400 mx-auto mb-4" />
                        <h3 className="text-2xl font-bold text-white mb-2">Bohužel se nepodařilo najít vůz</h3>
                        <p className="text-gray-300 mb-6">{error}</p>
                        <p className="text-gray-400">Zkuste to prosím znovu za chvíli, nebo nám zavolejte na číslo <a href="tel:+420728548373" className="font-bold text-cyan-400 hover:underline">728 548 373</a>.</p>
                         <button onClick={onClose} className="mt-6 w-full px-6 py-3 text-sm font-bold rounded-lg bg-slate-600 text-white hover:bg-slate-500 transform hover:scale-105 transition-all duration-200">
                            ❌ Zavřít
                        </button>
                    </div>
                );
            case 'form':
            default:
                return (
                    <form onSubmit={handleSubmit}>
                        <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
                            <AutocompleteInputField id="pickup" value={stops[0]} onChange={(val) => handleStopChange(0, val)} suggestionMode="remote" placeholder="Odkud pojedete?" isFirst />
                            <AutocompleteInputField id="destination" value={stops[1]} onChange={(val) => handleStopChange(1, val)} suggestionMode="remote" placeholder="Kam to bude?" />
                            <input type="text" value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="Vaše jméno" className="w-full bg-slate-700 border border-slate-600 rounded-md py-2 px-3 text-white" required />
                            <div>
                                <input
                                    type="tel"
                                    value={customerPhone}
                                    onChange={e => { setCustomerPhone(e.target.value); setPhoneEdited(true); setPhoneWarningVisible(false); }}
                                    placeholder="Váš telefon"
                                    className={`w-full bg-slate-700 border rounded-md py-2 px-3 text-white ${phoneWarningVisible ? 'border-amber-400 ring-2 ring-amber-300/20' : 'border-slate-600'}`}
                                    required
                                />
                                {phoneWarningVisible && (
                                    <p className="text-xs text-amber-300 mt-1 flex items-center gap-2">⚠️ {t('dispatch.phoneNotEdited')}</p>
                                )}
                            </div>
                             <div>
                                 <label htmlFor="passengers" className="block text-sm font-medium text-gray-300 mb-1">Počet cestujících</label>
                                 <input type="number" id="passengers" value={passengers} onChange={e => setPassengers(parseInt(e.target.value, 10))} min="1" max="8" className="w-full bg-slate-700 border border-slate-600 rounded-md py-2 px-3 text-white" required />
                             </div>

                             <div>
                                 <div className="flex justify-between items-center mb-1">
                                     <label className="block text-sm font-medium text-gray-300">{t('dispatch.pickupTime')}</label>
                                     <div className="flex items-center">
                                          <input type="checkbox" id="isScheduled" checked={isScheduled} onChange={(e) => handleScheduleToggle(e.target.checked)} className="h-4 w-4 rounded-lg bg-slate-700 border-slate-600 text-cyan-500 focus:ring-cyan-600 focus:ring-offset-slate-800 cursor-pointer"/>
                                         <label htmlFor="isScheduled" className="ml-2 text-sm text-gray-300 cursor-pointer">{t('dispatch.schedule')}</label>
                                     </div>
                                 </div>

                                 {isScheduled ? (
                                      <input type="datetime-local" id="pickupTime" name="pickupTime" value={pickupTime === 'ihned' ? formatDateForPicker(new Date()) : pickupTime} onChange={(e) => setPickupTime(e.target.value)} min={formatDateForPicker(new Date())} className="w-full bg-slate-700 border border-slate-600 rounded-xl shadow-sm py-2 px-3 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"/>
                                 ) : (
                                     <input type="text" value={t('dispatch.asap')} readOnly className="w-full bg-slate-600 border border-slate-500 rounded-md shadow-sm py-2 px-3 text-gray-300 cursor-default"/>
                                 )}

                                 <div className="flex items-center space-x-1 mt-1">
                                     <button type="button" onClick={() => handleQuickTimeSelect()} className="px-2 py-0.5 text-xs font-medium rounded-full bg-slate-600 hover:bg-slate-500 transition-colors">{t('dispatch.asap')}</button>
                                     <button type="button" onClick={() => handleQuickTimeSelect(10)} className="px-2 py-0.5 text-xs font-medium rounded-full bg-slate-600 hover:bg-slate-500 transition-colors">+10 min</button>
                                     <button type="button" onClick={() => handleQuickTimeSelect(20)} className="px-2 py-0.5 text-xs font-medium rounded-full bg-slate-600 hover:bg-slate-500 transition-colors">+20 min</button>
                                     <button type="button" onClick={() => handleQuickTimeSelect(30)} className="px-2 py-0.5 text-xs font-medium rounded-full bg-slate-600 hover:bg-slate-500 transition-colors">+30 min</button>
                                 </div>
                             </div>

                              {error && <p className="text-sm text-red-400">{error}</p>}
                        </div>
                        <div className="flex justify-end items-center p-6 bg-slate-900 border-t border-slate-700 rounded-b-lg space-x-3">
                            <button type="button" onClick={onClose} className="px-6 py-3 text-sm font-medium rounded-lg bg-slate-600 text-gray-200 hover:bg-slate-500 transform hover:scale-105 transition-all duration-200">
                                ❌ Zrušit
                            </button>
                            <button type="submit" className="px-6 py-3 text-sm font-bold rounded-2xl shadow-lg text-slate-900 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 transform hover:scale-105 transition-all duration-200 border-2 border-amber-400">
                                🚕 Objednat odvoz
                            </button>
                        </div>
                    </form>
                );
        }
    };

    const handleConfirmPhoneSubmit = async () => {
        setPhoneConfirmVisible(false);
        // user confirmed despite unedited phone
        await submitOrder();
    };

    const handleCancelPhoneSubmit = () => {
        setPhoneConfirmVisible(false);
        // keep modal open for user to edit phone
    };

    return (
        <div className="fixed inset-0 bg-black/70 z-50 flex justify-center items-center p-4 animate-fade-in" role="dialog" aria-modal="true">
            <div className="bg-slate-800 rounded-lg shadow-2xl w-full max-w-md relative">
                <div className="flex justify-between items-center p-6 border-b border-slate-700">
                    <h2 className="text-xl font-semibold">Online objednávka</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-white p-1 rounded-full hover:bg-slate-600 transition-colors"><CloseIcon /></button>
                </div>
                {renderContent()}

                {phoneConfirmVisible && (
                    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 p-6">
                        <div className="bg-slate-800 rounded-lg shadow-xl w-full max-w-sm p-6 border border-slate-700">
                            <h3 className="text-lg font-semibold text-white mb-3">{t('dispatch.confirmSubmitWithUneditedPhone')}</h3>
                            <p className="text-sm text-gray-300 mb-6">{t('dispatch.phoneNotEdited')}</p>
                            <div className="flex justify-end gap-3">
                                <button onClick={handleCancelPhoneSubmit} className="px-4 py-2 bg-slate-600 text-gray-200 rounded-md hover:bg-slate-500">{t('general.cancel')}</button>
                                <button onClick={handleConfirmPhoneSubmit} className="px-4 py-2 bg-cyan-400 text-slate-900 rounded-md hover:bg-cyan-500">{t('dispatch.findVehicle') || t('general.save')}</button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
