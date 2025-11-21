import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import type { RideRequest, RideLog, AssignmentResultData, Person } from '../types';
import { useTranslation } from '../contexts/LanguageContext';
import { PlusIcon, TrashIcon } from './icons';
import { AutocompleteInputField } from './AutocompleteInputField';
import { POISearchModal } from './POISearchModal';
import { smsService, type SmsMessageRecord } from '../services/smsService';
import { sendSms } from '../services/messagingService';
import { generateCustomerSms } from '../services/dispatchService';
import { POIResult } from '../services/poiService';

const InputField: React.FC<{ label: string, id: string, value: string | number, onChange: (e: React.ChangeEvent<HTMLInputElement>) => void, type?: string, error?: string }> = ({label, id, value, onChange, type='text', error}) => (
  <div>
    <label htmlFor={id} className="block text-xs font-medium text-gray-300 mb-1">{label}</label>
    <input type={type} id={id} name={id} value={value} onChange={onChange} className={`w-full bg-slate-700 border ${error ? 'border-red-500' : 'border-slate-600'} rounded-md shadow-sm py-2 px-3 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500`} />
    {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
  </div>
);

const CustomerAutocompleteField: React.FC<{ label: string, id: string, value: string, onChange: (v: string) => void, suggestions: string[], error?: string }> = ({ label, id, value, onChange, suggestions, error }) => (
  <div>
    <label htmlFor={id} className="block text-xs font-medium text-gray-300 mb-1">{label}</label>
    <AutocompleteInputField id={id} value={value} onChange={onChange} suggestionMode="local" localSuggestions={suggestions} error={error} />
  </div>
);


interface DispatchFormProps {
   onSubmit: (rideRequest: RideRequest, optimize: boolean) => void;
   onSchedule: (rideRequest: RideRequest) => void;
   onQueue?: (rideRequest: RideRequest) => void;
   isLoading: boolean;
   rideHistory: RideLog[];
   cooldownTime: number;
   onRoutePreview: (stops: string[]) => void;
   assignmentResult?: AssignmentResultData | null;
   people: Person[];
   customerSms?: string;
}

export const DispatchFormComponent = ({ onSubmit, onSchedule, onQueue, isLoading, rideHistory, cooldownTime, onRoutePreview, assignmentResult, people, customerSms }: DispatchFormProps) => {
  const { t } = useTranslation();
  const [stops, setStops] = useState<string[]>(['Náměstí, Mikulov', 'Dukelské náměstí, Hustopeče']);
  // parallel array to keep selected placeIds for each stop (keeps UI address clean)
  const [stopPlaceIds, setStopPlaceIds] = useState<string[]>(['', '']);
  const [customerName, setCustomerName] = useState('Jan Novák');
  const [customerPhone, setCustomerPhone] = useState('777 123 456');
  const [passengers, setPassengers] = useState(1);
   const [pickupTime, setPickupTime] = useState('ihned');
   const [customPickupTime, setCustomPickupTime] = useState('');
   const [isScheduled, setIsScheduled] = useState(false);
  const [notes, setNotes] = useState('');
  const [smsMessage, setSmsMessage] = useState('');
  const [chatRecords, setChatRecords] = useState<SmsMessageRecord[]>([]);
  const [showChat, setShowChat] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof RideRequest | 'stops', string>>>({});
  const [optimizeStops, setOptimizeStops] = useState(true);
  const [showPOIModal, setShowPOIModal] = useState(false);
  const [selectedStopIndex, setSelectedStopIndex] = useState<number | null>(null);

  const uniqueCustomerNames = useMemo(() => {
      const names = new Set<string>(rideHistory.map(log => log.customerName).filter(Boolean));
      return Array.from(names);
  }, [rideHistory]);
  
    // compute combined stops (address|placeId) for geocoding/preview while keeping UI clean
    const combinedStops = stops.map((s, i) => stopPlaceIds[i] ? `${s}|${stopPlaceIds[i]}` : s);

    // Debounced route preview - only trigger when user stops typing for 2 seconds
    // and only if we have at least 2 valid stops
    useEffect(() => {
      // Only trigger route preview if we have at least 2 stops and they're not empty
      const hasValidStops = combinedStops.length >= 2 && combinedStops.every(stop => stop.trim().length > 0);

      if (!hasValidStops) {
        onRoutePreview([]);
        return;
      }

      const handler = setTimeout(() => {
        // Double-check stops are still valid before triggering
        const currentCombinedStops = stops.map((s, i) => stopPlaceIds[i] ? `${s}|${stopPlaceIds[i]}` : s);
        const stillValid = currentCombinedStops.length >= 2 && currentCombinedStops.every(stop => stop.trim().length > 0);

        if (stillValid) {
          onRoutePreview(currentCombinedStops);
        }
      }, 2000); // Increased to 2 seconds to reduce API calls

      return () => clearTimeout(handler);
    }, [combinedStops, onRoutePreview, stops, stopPlaceIds]);

     useEffect(() => {
       const loadChatRecords = async () => {
         if (customerPhone.trim()) {
           const allMessages = await smsService.getMessages();
           const customerMessages = allMessages.filter(msg =>
             msg.to === customerPhone || msg.from === customerPhone
           ).sort((a, b) => b.timestamp - a.timestamp);
           setChatRecords(customerMessages);
         } else {
           setChatRecords([]);
         }
       };
       loadChatRecords();

       // Clear SMS message when customer phone changes
       setSmsMessage('');
     }, [customerPhone]);

     // Set SMS message when customerSms prop changes (for manual assignments only)
     useEffect(() => {
       if (customerSms && customerSms.trim()) {
         setSmsMessage(customerSms);
       } else {
         // Clear SMS when no manual assignment is made
         setSmsMessage('');
       }
     }, [customerSms]);

   const handleStopChange = (index: number, value: string) => {
     const newStops = [...stops];
     newStops[index] = value;
     setStops(newStops);
     // Clear any previously selected placeId for this index when user types manually
     setStopPlaceIds(prev => {
       const p = [...prev];
       p[index] = '';
       return p;
     });
   };

   const addStop = () => {
     setStops([...stops, '']);
     setStopPlaceIds(prev => [...prev, '']);
   };

   const removeStop = (index: number) => {
     if (stops.length > 2) {
       setStops(stops.filter((_, i) => i !== index));
       setStopPlaceIds(prev => prev.filter((_, i) => i !== index));
     }
   };

   const handlePOISearch = (stopIndex: number) => {
     setSelectedStopIndex(stopIndex);
     setShowPOIModal(true);
   };

   const handlePOISelect = (poi: POIResult) => {
     if (selectedStopIndex !== null) {
       const newStops = [...stops];
       newStops[selectedStopIndex] = poi.displayName;
       setStops(newStops);
       setStopPlaceIds(prev => {
         const p = [...prev];
         p[selectedStopIndex] = poi.placeId || '';
         return p;
       });
     }
     setShowPOIModal(false);
     setSelectedStopIndex(null);
   };

   const handleSendSms = async () => {
     if (!customerPhone.trim() || !smsMessage.trim()) return;

     try {
       const cleanPhone = customerPhone.replace(/\s/g, '');
       const res = await sendSms([cleanPhone], smsMessage);
       if (res.success) {
         alert(t('smsPreview.sentSuccess'));
         // Add to chat records
         const newRecord: SmsMessageRecord = {
           id: `sms-${Date.now()}`,
           timestamp: Date.now(),
           direction: 'outgoing',
           rideLogId: null,
           to: cleanPhone,
           text: smsMessage,
           status: 'sent',
         };
         setChatRecords(prev => [newRecord, ...prev]);
         setSmsMessage('');
       } else {
         alert(t('smsPreview.sentFailed'));
       }
     } catch (err) {
       console.error('Error sending SMS:', err);
       alert(t('smsPreview.sentFailed'));
     }
   };

   const handleQueueRide = (e: React.FormEvent) => {
      e.preventDefault();

      // Validate required fields
      const newErrors: Partial<Record<keyof RideRequest | 'stops', string>> = {};
      if (!customerName.trim()) newErrors.customerName = t('dispatch.errors.customerNameRequired');
      if (!customerPhone.trim()) newErrors.customerPhone = t('dispatch.errors.customerPhoneRequired');
      if (stops.some(stop => !stop.trim())) newErrors.stops = t('dispatch.errors.stopsRequired');
      if (passengers < 1) newErrors.passengers = t('dispatch.errors.passengersRequired');

       setErrors(newErrors);
       if (Object.keys(newErrors).length > 0) return;

       // Handle custom pickup time
       let finalPickupTime = pickupTime;
       if (pickupTime === 'custom' && customPickupTime) {
         finalPickupTime = customPickupTime;
       }

       const rideRequest: RideRequest = {
          stops: combinedStops,
          customerName,
          customerPhone,
          passengers,
          pickupTime: finalPickupTime,
          notes,
       };

       if (onQueue) {
          onQueue(rideRequest);
         // Clear form after queuing
         setStops(['Náměstí, Mikulov', 'Dukelské náměstí, Hustopeče']);
         setStopPlaceIds(['', '']);
          setCustomerName('Jan Novák');
          setCustomerPhone('777 123 456');
          setPassengers(1);
          setPickupTime('ihned');
          setCustomPickupTime('');
          setNotes('');
          setSmsMessage('');
          setErrors({});
       }
    };

   const handleSubmit = (e: React.FormEvent) => {
      e.preventDefault();

      // Validate required fields
      const newErrors: Partial<Record<keyof RideRequest | 'stops', string>> = {};
      if (!customerName.trim()) newErrors.customerName = t('dispatch.errors.customerNameRequired');
      if (!customerPhone.trim()) newErrors.customerPhone = t('dispatch.errors.customerPhoneRequired');
      if (stops.some(stop => !stop.trim())) newErrors.stops = t('dispatch.errors.stopsRequired');
      if (passengers < 1) newErrors.passengers = t('dispatch.errors.passengersRequired');

       setErrors(newErrors);
       if (Object.keys(newErrors).length > 0) return;

       // Handle custom pickup time
       let finalPickupTime = pickupTime;
       if (pickupTime === 'custom' && customPickupTime) {
         finalPickupTime = customPickupTime;
       }

       const rideRequest: RideRequest = {
          stops: combinedStops,
          customerName,
          customerPhone,
          passengers,
          pickupTime: finalPickupTime,
          notes,
       };
       if (isScheduled) {
          onSchedule(rideRequest);
       } else {
          onSubmit(rideRequest, combinedStops.length > 2 && optimizeStops);
       }
      // Clear SMS message after successful submission
      setSmsMessage('');
   };

    const isOnCooldown = cooldownTime > 0;

  return (
    <div className="bg-slate-800 p-2 rounded-lg shadow-2xl flex flex-col h-full">
        <h2 className="text-md font-semibold mb-1 border-b border-slate-700 pb-1 text-white">{t('dispatch.newRide')}</h2>
        <form onSubmit={handleSubmit} className="space-y-1 flex-grow flex flex-col">
        <div className="flex-grow space-y-2 overflow-y-auto pr-2">
            <div>
              <label className="block text-xs font-medium text-gray-300 mb-1">{t('dispatch.stops.title')}</label>
              <div className="space-y-2">
                {stops.map((stop, index) => (
                  <div key={index} className="flex items-center space-x-2">
                    <span className="text-gray-400 font-mono text-sm w-5 text-center">{index + 1}.</span>
                    <div className="flex-1">
                      <AutocompleteInputField
                        id={`stop-${index}`}
                        value={stop}
                        onChange={(val) => handleStopChange(index, val)}
                        onSelectPlaceId={(pid) => setStopPlaceIds(prev => { const p=[...prev]; p[index]=pid||''; return p; })}
                        suggestionMode="remote"
                        placeholder={index === 0 ? t('dispatch.stops.startPlaceholder') : t('dispatch.stops.destinationPlaceholder')}
                        isFirst={index === 0}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => handlePOISearch(index)}
                      className="p-2 text-cyan-400 hover:text-cyan-300 hover:bg-slate-700 rounded-full transition-colors"
                      title="Vyhledat místo zájmu"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                    </button>
                    {stops.length > 2 && (
                      <button
                        type="button"
                        onClick={() => removeStop(index)}
                        className="p-2 text-red-400 hover:text-red-300 hover:bg-slate-700 rounded-full transition-colors"
                        title="Odstranit zastávku"
                      >
                        <TrashIcon size={16} />
                      </button>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addStop}
                  className="flex items-center space-x-2 px-3 py-2 bg-slate-700 hover:bg-slate-600 text-cyan-400 hover:text-cyan-300 rounded-md transition-colors text-sm"
                >
                  <PlusIcon size={16} />
                  <span>{t('dispatch.stops.addStop')}</span>
                </button>
              </div>
            </div>

            <CustomerAutocompleteField
              label={t('dispatch.customerName')}
              id="customerName"
              value={customerName}
              onChange={setCustomerName}
              suggestions={uniqueCustomerNames}
              error={errors.customerName}
            />

            <InputField
              label={t('dispatch.customerPhone')}
              id="customerPhone"
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              error={errors.customerPhone}
            />

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="passengers" className="block text-xs font-medium text-gray-300 mb-1">{t('dispatch.passengers')}</label>
                <input
                  type="number"
                  id="passengers"
                  name="passengers"
                  value={passengers}
                  onChange={(e) => setPassengers(parseInt(e.target.value) || 1)}
                  min="1"
                  max="20"
                  className="w-full bg-slate-700 border border-slate-600 rounded-md shadow-sm py-2 px-3 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
                />
                {errors.passengers && <p className="mt-1 text-xs text-red-400">{errors.passengers}</p>}
              </div>

              <div>
                <label htmlFor="pickupTime" className="block text-xs font-medium text-gray-300 mb-1">{t('dispatch.pickupTime')}</label>
                <select
                  id="pickupTime"
                  name="pickupTime"
                  value={pickupTime}
                  onChange={(e) => setPickupTime(e.target.value)}
                  className="w-full bg-slate-700 border border-slate-600 rounded-md shadow-sm py-2 px-3 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
                >
                  <option value="ihned">{t('dispatch.immediate')}</option>
                  <option value="15min">Za 15 minut</option>
                  <option value="30min">Za 30 minut</option>
                  <option value="1hod">Za 1 hodinu</option>
                  <option value="2hod">Za 2 hodiny</option>
                  <option value="custom">Vlastní čas</option>
                </select>
                {pickupTime === 'custom' && (
                  <div className="mt-2">
                    <input
                      type="time"
                      id="customPickupTime"
                      value={customPickupTime}
                      onChange={(e) => setCustomPickupTime(e.target.value)}
                      className="w-full bg-slate-700 border border-slate-600 rounded-md shadow-sm py-2 px-3 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
                      placeholder="HH:MM"
                    />
                  </div>
                )}
              </div>
            </div>

             <div>
               <label htmlFor="notes" className="block text-xs font-medium text-gray-300 mb-1">{t('dispatch.notesOptional')}</label>
               <textarea
                 id="notes"
                 name="notes"
                 value={notes}
                 onChange={(e) => setNotes(e.target.value)}
                 placeholder={t('dispatch.notesPlaceholder')}
                 rows={2}
                 className="w-full bg-slate-700 border border-slate-600 rounded-md shadow-sm py-2 px-3 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 resize-none"
               />
             </div>

             {customerPhone.trim() && (
               <div>
                 <label htmlFor="smsMessage" className="block text-xs font-medium text-gray-300 mb-1">{t('dispatch.smsMessage')}</label>
                 <textarea
                   id="smsMessage"
                   name="smsMessage"
                   value={smsMessage}
                   onChange={(e) => setSmsMessage(e.target.value)}
                   placeholder={t('dispatch.smsMessagePlaceholder')}
                   rows={3}
                   className="w-full bg-slate-700 border border-slate-600 rounded-md shadow-sm py-2 px-3 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 resize-none"
                 />
               </div>
             )}

             {customerPhone.trim() && (
              <div>
                <button
                  type="button"
                  onClick={handleSendSms}
                  disabled={!smsMessage.trim() || !customerPhone.trim()}
                  className="px-3 py-1 bg-cyan-600 hover:bg-cyan-500 disabled:bg-gray-600 text-white text-sm rounded-md transition-colors"
                >
                  {t('dispatch.sendSms')}
                </button>
              </div>
            )}

            {chatRecords.length > 0 && (
                <div>
                    <button
                        type="button"
                        onClick={() => setShowChat(!showChat)}
                        className="text-xs text-cyan-400 hover:text-cyan-300 mb-1"
                    >
                        {showChat ? t('dispatch.hideChat') : t('dispatch.showChat')} ({chatRecords.length})
                    </button>
                    {showChat && (
                        <div className="bg-slate-700 rounded-md p-2 max-h-32 overflow-y-auto space-y-1">
                            {chatRecords.map((record) => (
                                <div key={record.id} className={`text-xs ${record.direction === 'outgoing' ? 'text-right' : 'text-left'}`}>
                                    <span className={`inline-block px-2 py-1 rounded ${record.direction === 'outgoing' ? 'bg-cyan-600' : 'bg-slate-600'}`}>
                                        {record.text}
                                    </span>
                                    <div className="text-gray-400 text-xs mt-1">
                                        {new Date(record.timestamp).toLocaleString()}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>

        {stops.length > 2 && (
            <div className={`flex items-center justify-end space-x-2 mt-2 py-2 border-t border-slate-700`}>
              <label htmlFor="optimize-stops" className={`text-sm text-gray-300 cursor-pointer`}>
                {t('dispatch.optimizeStops')}
              </label>
              <input
                type="checkbox"
                id="optimize-stops"
                checked={optimizeStops}
                onChange={(e) => setOptimizeStops(e.target.checked)}
                className="h-4 w-4 rounded bg-slate-700 border-slate-600 text-cyan-500 focus:ring-cyan-600 focus:ring-offset-slate-800 cursor-pointer"
              />

            </div>
        )}

        <div className="flex space-x-2 mt-auto">
            {onQueue && (
                <button
                    type="button"
                    onClick={handleQueueRide}
                    disabled={isLoading}
                    className="flex-1 flex justify-center py-1 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 focus:ring-offset-slate-800 disabled:bg-purple-800 disabled:text-gray-300 disabled:cursor-not-allowed transition-colors"
                >
                    📋 {t('dispatch.queueRide')}
                </button>
            )}
            <button
                type="submit"
                disabled={isLoading || (isOnCooldown && !isScheduled)}
                className="flex-1 flex justify-center py-1 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-slate-900 bg-cyan-400 hover:bg-cyan-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-cyan-500 focus:ring-offset-slate-800 disabled:bg-cyan-800 disabled:text-gray-300 disabled:cursor-not-allowed transition-colors"
            >
                {isScheduled
                    ? t('dispatch.scheduleRide')
                    : isLoading
                    ? t('dispatch.findingVehicle')
                    : isOnCooldown
                    ? t('dispatch.cooldown', { cooldownTime })
                    : t('dispatch.findVehicle')}
            </button>
        </div>
        </form>
    </div>
  );
};
