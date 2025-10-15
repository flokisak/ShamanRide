import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import type { RideRequest, RideLog, AssignmentResultData, Person } from '../types';
import { useTranslation } from '../contexts/LanguageContext';
import { PlusIcon, TrashIcon } from './icons';
import { AutocompleteInputField } from './AutocompleteInputField';
import { smsService, type SmsMessageRecord } from '../services/smsService';
import { sendSms } from '../services/messagingService';
import { generateCustomerSms } from '../services/dispatchService';

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
   isLoading: boolean;
   rideHistory: RideLog[];
   cooldownTime: number;
   onRoutePreview: (stops: string[]) => void;
   assignmentResult?: AssignmentResultData | null;
   people: Person[];
   customerSms?: string;
}

export const DispatchFormComponent: React.FC<DispatchFormProps> = ({ onSubmit, onSchedule, isLoading, rideHistory, cooldownTime, onRoutePreview, assignmentResult, people, customerSms }) => {
  const { t } = useTranslation();
  const [stops, setStops] = useState<string[]>(['Náměstí, Mikulov', 'Dukelské náměstí, Hustopeče']);
  const [customerName, setCustomerName] = useState('Jan Novák');
  const [customerPhone, setCustomerPhone] = useState('777 123 456');
  const [passengers, setPassengers] = useState(1);
  const [pickupTime, setPickupTime] = useState('ihned');
  const [isScheduled, setIsScheduled] = useState(false);
  const [notes, setNotes] = useState('');
  const [smsMessage, setSmsMessage] = useState('');
  const [chatRecords, setChatRecords] = useState<SmsMessageRecord[]>([]);
  const [showChat, setShowChat] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof RideRequest | 'stops', string>>>({});
  const [optimizeStops, setOptimizeStops] = useState(true);

  const uniqueCustomerNames = useMemo(() => {
      const names = new Set<string>(rideHistory.map(log => log.customerName).filter(Boolean));
      return Array.from(names);
  }, [rideHistory]);
  
   useEffect(() => {
     const handler = setTimeout(() => {
         onRoutePreview(stops);
     }, 800);
     return () => clearTimeout(handler);
   }, [stops, onRoutePreview]);

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
  };
  
  const addStop = () => {
    setStops([...stops, '']);
  };
  
  const removeStop = (index: number) => {
    if (stops.length > 2) {
      setStops(stops.filter((_, i) => i !== index));
    }
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

  const handleSendSms = async () => {
    if (!smsMessage.trim() || !customerPhone.trim()) return;
    try {
      // Normalize phone number (basic)
      const normalizedPhone = customerPhone.replace(/\s/g, '');
      const result = await sendSms([normalizedPhone], smsMessage);
      if (result.success) {
        const record: SmsMessageRecord = {
          id: crypto.randomUUID(),
          timestamp: Date.now(),
          direction: 'outgoing',
          to: normalizedPhone,
          text: smsMessage,
          status: 'sent'
        };
        await smsService.saveOutgoing(record);
        setChatRecords(prev => [record, ...prev]);
        setSmsMessage('');
      } else {
        console.error('Failed to send SMS:', result.error);
      }
    } catch (error) {
      console.error('Error sending SMS:', error);
    }
  };


  const validateForm = (): boolean => {
      const newErrors: Partial<Record<keyof RideRequest | 'stops', string>> = {};
      if (stops.some(s => !s.trim())) newErrors.stops = t('dispatch.validation.allStopsRequired');
      if (stops.length < 2) newErrors.stops = t('dispatch.validation.atLeastTwoStops');
      if (!customerName.trim()) newErrors.customerName = t('dispatch.validation.nameRequired');
      if (!customerPhone.trim()) newErrors.customerPhone = t('dispatch.validation.phoneRequired');
      if (!pickupTime.trim()) newErrors.pickupTime = t('dispatch.validation.pickupTimeRequired');
      if (isScheduled && new Date(pickupTime).getTime() <= Date.now()) newErrors.pickupTime = t('dispatch.validation.futureTimeRequired');
      if (passengers <= 0) newErrors.passengers = t('dispatch.validation.positivePassengers');

      setErrors(newErrors);
      return Object.keys(newErrors).length === 0;
  }

   const handleSubmit = (e: React.FormEvent) => {
     e.preventDefault();
     if (validateForm()) {
         const rideRequest: RideRequest = {
           stops,
           customerName,
           customerPhone,
           passengers,
           pickupTime,
           notes,
         };
         if (isScheduled) {
             onSchedule(rideRequest);
         } else {
             onSubmit(rideRequest, stops.length > 2 && optimizeStops);
         }
         // Clear SMS message after successful submission
         setSmsMessage('');
     }
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
                    <AutocompleteInputField 
                      id={`stop-${index}`}
                      value={stop}
                      onChange={(val) => handleStopChange(index, val)}
                      suggestionMode="remote"
                      placeholder={index === 0 ? t('dispatch.stops.startPlaceholder') : t('dispatch.stops.destinationPlaceholder')}
                      isFirst={index === 0}
                    />
                    {stops.length > 2 && <button type="button" onClick={() => removeStop(index)} className="p-1 text-red-500 hover:text-red-400 rounded-full"><TrashIcon size={18}/></button>}
                  </div>
                ))}
              </div>
              {errors.stops && <p className="mt-1 text-xs text-red-400">{errors.stops}</p>}
              <button type="button" onClick={addStop} className="mt-2 flex items-center space-x-2 text-sm text-cyan-400 hover:text-cyan-300">
                <PlusIcon size={16}/>
                <span>{t('dispatch.stops.addStop')}</span>
              </button>
            </div>
            
            <CustomerAutocompleteField label={t('dispatch.customerName')} id="customerName" value={customerName} onChange={setCustomerName} suggestions={uniqueCustomerNames} error={errors.customerName} />
            <InputField label={t('dispatch.customerPhone')} id="customerPhone" value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} type="tel" error={errors.customerPhone} />
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <InputField label={t('dispatch.passengers')} id="passengers" value={passengers} onChange={e => setPassengers(Math.max(1, parseInt(e.target.value, 10) || 1))} type="number" error={errors.passengers} />
                <div>
                    <div className="flex justify-between items-center mb-1">
                        <label className="block text-xs font-medium text-gray-300">{t('dispatch.pickupTime')}</label>
                        <div className="flex items-center">
                            <input type="checkbox" id="isScheduled" checked={isScheduled} onChange={(e) => handleScheduleToggle(e.target.checked)} className="h-4 w-4 rounded bg-slate-700 border-slate-600 text-cyan-500 focus:ring-cyan-600 focus:ring-offset-slate-800 cursor-pointer"/>
                            <label htmlFor="isScheduled" className="ml-2 text-sm text-gray-300 cursor-pointer">{t('dispatch.schedule')}</label>
                        </div>
                    </div>

                    {isScheduled ? (
                        <input type="datetime-local" id="pickupTime" name="pickupTime" value={pickupTime === 'ihned' ? formatDateForPicker(new Date()) : pickupTime} onChange={(e) => setPickupTime(e.target.value)} min={formatDateForPicker(new Date())} className={`w-full bg-slate-700 border ${errors.pickupTime ? 'border-red-500' : 'border-slate-600'} rounded-md shadow-sm py-1 px-3 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500`}/>
                    ) : (
                        <input type="text" value={t('dispatch.asap')} readOnly className="w-full bg-slate-600 border border-slate-500 rounded-md shadow-sm py-1 px-3 text-gray-300 cursor-default"/>
                    )}
                    
                    {errors.pickupTime && <p className="mt-1 text-xs text-red-400">{errors.pickupTime}</p>}
                    
                    <div className="flex items-center space-x-1 mt-1">
                        <button type="button" onClick={() => handleQuickTimeSelect()} className="px-2 py-0.5 text-xs font-medium rounded-full bg-slate-600 hover:bg-slate-500 transition-colors">{t('dispatch.asap')}</button>
                        <button type="button" onClick={() => handleQuickTimeSelect(10)} className="px-2 py-0.5 text-xs font-medium rounded-full bg-slate-600 hover:bg-slate-500 transition-colors">+10 min</button>
                        <button type="button" onClick={() => handleQuickTimeSelect(20)} className="px-2 py-0.5 text-xs font-medium rounded-full bg-slate-600 hover:bg-slate-500 transition-colors">+20 min</button>
                        <button type="button" onClick={() => handleQuickTimeSelect(30)} className="px-2 py-0.5 text-xs font-medium rounded-full bg-slate-600 hover:bg-slate-500 transition-colors">+30 min</button>
                    </div>
                </div>
            </div>
            
            <div>
                <label htmlFor="notes" className="block text-xs font-medium text-gray-300 mb-1">{t('dispatch.notesOptional')}</label>
                <textarea id="notes" name="notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={1} className="w-full bg-slate-700 border border-slate-600 rounded-md shadow-sm py-1 px-3 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500" placeholder={t('dispatch.notesPlaceholder')}></textarea>
            </div>

            <div>
                <label htmlFor="sms" className="block text-xs font-medium text-gray-300 mb-1">{t('dispatch.sendSms')}</label>
                <div className="flex space-x-2">
                    <input
                        type="text"
                        id="sms"
                        value={smsMessage}
                        onChange={(e) => setSmsMessage(e.target.value)}
                        placeholder={t('dispatch.smsPlaceholder')}
                        className="flex-grow bg-slate-700 border border-slate-600 rounded-md shadow-sm py-1 px-3 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
                    />
                    <button
                        type="button"
                        onClick={handleSendSms}
                        disabled={!smsMessage.trim() || !customerPhone.trim()}
                        className="px-3 py-1 bg-cyan-600 hover:bg-cyan-500 disabled:bg-gray-600 text-white text-sm rounded-md transition-colors"
                    >
                        {t('dispatch.send')}
                    </button>
                </div>
            </div>

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

        <button
            type="submit"
            disabled={isLoading || (isOnCooldown && !isScheduled)}
            className="w-full flex justify-center py-1 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-slate-900 bg-cyan-400 hover:bg-cyan-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-cyan-500 focus:ring-offset-slate-800 disabled:bg-cyan-800 disabled:text-gray-300 disabled:cursor-not-allowed transition-colors mt-auto"
        >
            {isScheduled 
                ? t('dispatch.scheduleRide') 
                : isLoading
                ? t('dispatch.findingVehicle')
                : isOnCooldown 
                ? t('dispatch.cooldown', { cooldownTime })
                : t('dispatch.findVehicle')}
        </button>
        </form>
    </div>
  );
};