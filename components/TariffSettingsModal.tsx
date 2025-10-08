import React, { useState } from 'react';
import type { Tariff, FlatRateRule, TimeBasedTariff } from '../types';
import { CloseIcon, PlusIcon, UndoIcon } from './icons';
import { DEFAULT_TARIFF } from '../types';
import { useTranslation } from '../contexts/LanguageContext';

interface TariffSettingsModalProps {
  initialTariff: Tariff;
  onSave: (tariff: Tariff) => void;
  onClose: () => void;
}

const NumberInput: React.FC<{
  label: string;
  id: string;
  value: number;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}> = ({ label, id, value, onChange }) => (
  <div>
    <label htmlFor={id} className="block text-sm font-medium text-gray-300 mb-1">{label}</label>
    <div className="relative">
      <input
        type="number"
        id={id}
        name={id}
        value={value}
        onChange={onChange}
        min="0"
        className="w-full bg-slate-700 border border-slate-600 rounded-md shadow-sm py-2 pl-3 pr-10 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
      />
      <span className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400">Kč</span>
    </div>
  </div>
);

const TimeInput: React.FC<{
  label: string;
  id: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}> = ({ label, id, value, onChange }) => (
  <div>
    <label htmlFor={id} className="block text-sm font-medium text-gray-300 mb-1">{label}</label>
    <input
      type="time"
      id={id}
      name={id}
      value={value}
      onChange={onChange}
      className="w-full bg-slate-700 border border-slate-600 rounded-md shadow-sm py-2 px-3 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
    />
  </div>
);

export const TariffSettingsModal: React.FC<TariffSettingsModalProps> = ({ initialTariff, onSave, onClose }) => {
   const { t } = useTranslation();
   const ensuredTariff = { ...initialTariff, timeBasedTariffs: initialTariff.timeBasedTariffs || [] };
   const [tariff, setTariff] = useState<Tariff>(ensuredTariff);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setTariff(prev => ({ ...prev, [name]: parseInt(value, 10) || 0 }));
  };
  
   const handleFlatRateChange = (id: number, field: 'name' | 'priceCar' | 'priceVan', value: string | number) => {
     setTariff(prev => ({
         ...prev,
         flatRates: prev.flatRates.map(rate =>
             rate.id === id ? { ...rate, [field]: value } : rate
         )
     }));
   };

   const addFlatRate = () => {
     const newRate: FlatRateRule = { id: Date.now(), name: '', priceCar: 0, priceVan: 0 };
     setTariff(prev => ({ ...prev, flatRates: [...prev.flatRates, newRate] }));
   };

   const deleteFlatRate = (id: number) => {
     setTariff(prev => ({...prev, flatRates: prev.flatRates.filter(rate => rate.id !== id)}));
   };

   const handleTimeBasedChange = (id: number, field: 'name' | 'startTime' | 'endTime' | 'startingFee' | 'pricePerKmCar' | 'pricePerKmVan', value: string | number) => {
     setTariff(prev => ({
         ...prev,
         timeBasedTariffs: prev.timeBasedTariffs.map(rate =>
             rate.id === id ? { ...rate, [field]: value } : rate
         )
     }));
   };

   const addTimeBasedTariff = () => {
     const newTariff: TimeBasedTariff = { id: Date.now(), name: '', startTime: '06:00', endTime: '22:00', startingFee: 50, pricePerKmCar: 40, pricePerKmVan: 60 };
     setTariff(prev => ({ ...prev, timeBasedTariffs: [...prev.timeBasedTariffs, newTariff] }));
   };

   const deleteTimeBasedTariff = (id: number) => {
     setTariff(prev => ({...prev, timeBasedTariffs: prev.timeBasedTariffs.filter(rate => rate.id !== id)}));
   };

  const handleSave = () => {
    onSave(tariff);
    onClose();
  };
  
  const handleReset = () => {
    if (window.confirm(t('tariff.confirmReset'))) {
        setTariff(DEFAULT_TARIFF);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex justify-center items-center p-4 animate-fade-in" role="dialog" aria-modal="true">
      <div className="bg-slate-800 rounded-lg shadow-2xl w-full max-w-2xl relative">
        <div className="flex justify-between items-center p-6 border-b border-slate-700">
          <h2 className="text-xl font-semibold">{t('tariff.title')}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors" aria-label={t('general.close')}><CloseIcon /></button>
        </div>
        
        <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
            <section>
                <h3 className="text-lg font-medium text-cyan-400 mb-3">{t('tariff.rideRates')}</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <NumberInput label={t('tariff.startingFee')} id="startingFee" value={tariff.startingFee} onChange={handleChange} />
                    <NumberInput label={t('tariff.pricePerKmCar')} id="pricePerKmCar" value={tariff.pricePerKmCar} onChange={handleChange} />
                    <NumberInput label={t('tariff.pricePerKmVan')} id="pricePerKmVan" value={tariff.pricePerKmVan} onChange={handleChange} />
                </div>
            </section>
            
             <section>
                 <div className="flex justify-between items-center mb-3">
                     <h3 className="text-lg font-medium text-cyan-400">{t('tariff.flatRates')}</h3>
                     <button onClick={addFlatRate} className="flex items-center space-x-2 px-3 py-1 text-sm font-medium rounded-md bg-green-600 hover:bg-green-700 transition-colors"><PlusIcon size={16}/><span>{t('general.add')}</span></button>
                 </div>
                 <div className="space-y-3">
                     {tariff.flatRates.map(rate => (
                         <div key={rate.id} className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
                             <div className="col-span-12 sm:col-span-6">
                                 <label htmlFor={`rate-name-${rate.id}`} className="sr-only">{t('tariff.routeName')}</label>
                                 <input
                                     type="text"
                                     id={`rate-name-${rate.id}`}
                                     value={rate.name}
                                     onChange={(e) => handleFlatRateChange(rate.id, 'name', e.target.value)}
                                     placeholder={t('tariff.routeNamePlaceholder')}
                                     className="w-full bg-slate-700 border border-slate-600 rounded-md shadow-sm py-2 px-3 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
                                 />
                             </div>
                             <div className="col-span-6 sm:col-span-2">
                                  <label htmlFor={`rate-price-car-${rate.id}`} className="sr-only">{t('tariff.priceCar')}</label>
                                  <div className="relative">
                                     <input
                                         type="number"
                                         id={`rate-price-car-${rate.id}`}
                                         value={rate.priceCar}
                                         onChange={(e) => handleFlatRateChange(rate.id, 'priceCar', parseInt(e.target.value, 10) || 0)}
                                         className="w-full bg-slate-700 border border-slate-600 rounded-md shadow-sm py-2 pl-3 pr-10 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
                                     />
                                     <span className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400">Kč</span>
                                 </div>
                             </div>
                              <div className="col-span-6 sm:col-span-2">
                                  <label htmlFor={`rate-price-van-${rate.id}`} className="sr-only">{t('tariff.priceVan')}</label>
                                  <div className="relative">
                                     <input
                                         type="number"
                                         id={`rate-price-van-${rate.id}`}
                                         value={rate.priceVan}
                                         onChange={(e) => handleFlatRateChange(rate.id, 'priceVan', parseInt(e.target.value, 10) || 0)}
                                         className="w-full bg-slate-700 border border-slate-600 rounded-md shadow-sm py-2 pl-3 pr-10 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
                                     />
                                     <span className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400">Kč</span>
                                 </div>
                             </div>
                             <div className="col-span-12 sm:col-span-2 flex justify-end">
                                  <button onClick={() => deleteFlatRate(rate.id)} className="p-2 text-red-500 hover:text-red-400 rounded-full hover:bg-red-500" aria-label={t('tariff.deleteFlatRate')}><CloseIcon size={18}/></button>
                             </div>
                         </div>
                     ))}
                     {tariff.flatRates.length === 0 && (
                         <p className="text-gray-400 text-sm text-center py-2">{t('tariff.noFlatRates')}</p>
                     )}
                 </div>
             </section>

             <section>
                 <div className="flex justify-between items-center mb-3">
                     <h3 className="text-lg font-medium text-cyan-400">{t('tariff.timeBasedTariffs')}</h3>
                     <button onClick={addTimeBasedTariff} className="flex items-center space-x-2 px-3 py-1 text-sm font-medium rounded-md bg-green-600 hover:bg-green-700 transition-colors"><PlusIcon size={16}/><span>{t('general.add')}</span></button>
                 </div>
                 <div className="space-y-3">
                      {tariff.timeBasedTariffs.map(rate => (
                         <div key={rate.id} className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                             <div className="col-span-12 sm:col-span-4">
                                 <label htmlFor={`time-name-${rate.id}`} className="block text-sm font-medium text-gray-300 mb-1">{t('tariff.tariffName')}</label>
                                 <input
                                     type="text"
                                     id={`time-name-${rate.id}`}
                                     value={rate.name}
                                     onChange={(e) => handleTimeBasedChange(rate.id, 'name', e.target.value)}
                                     placeholder={t('tariff.tariffNamePlaceholder')}
                                     className="w-full bg-slate-700 border border-slate-600 rounded-md shadow-sm py-2 px-3 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
                                 />
                             </div>
                             <div className="col-span-6 sm:col-span-2">
                                 <TimeInput
                                     label={t('tariff.startTime')}
                                     id={`time-start-${rate.id}`}
                                     value={rate.startTime}
                                     onChange={(e) => handleTimeBasedChange(rate.id, 'startTime', e.target.value)}
                                 />
                             </div>
                             <div className="col-span-6 sm:col-span-2">
                                 <TimeInput
                                     label={t('tariff.endTime')}
                                     id={`time-end-${rate.id}`}
                                     value={rate.endTime}
                                     onChange={(e) => handleTimeBasedChange(rate.id, 'endTime', e.target.value)}
                                 />
                             </div>
                             <div className="col-span-6 sm:col-span-2">
                                 <NumberInput
                                     label={t('tariff.startingFee')}
                                     id={`time-starting-${rate.id}`}
                                     value={rate.startingFee}
                                     onChange={(e) => handleTimeBasedChange(rate.id, 'startingFee', parseInt(e.target.value, 10) || 0)}
                                 />
                             </div>
                             <div className="col-span-6 sm:col-span-1">
                                 <NumberInput
                                     label={t('tariff.pricePerKmCar')}
                                     id={`time-car-${rate.id}`}
                                     value={rate.pricePerKmCar}
                                     onChange={(e) => handleTimeBasedChange(rate.id, 'pricePerKmCar', parseInt(e.target.value, 10) || 0)}
                                 />
                             </div>
                             <div className="col-span-6 sm:col-span-1">
                                 <NumberInput
                                     label={t('tariff.pricePerKmVan')}
                                     id={`time-van-${rate.id}`}
                                     value={rate.pricePerKmVan}
                                     onChange={(e) => handleTimeBasedChange(rate.id, 'pricePerKmVan', parseInt(e.target.value, 10) || 0)}
                                 />
                             </div>
                             <div className="col-span-12 sm:col-span-0 flex justify-end sm:justify-center">
                                  <button onClick={() => deleteTimeBasedTariff(rate.id)} className="p-2 text-red-500 hover:text-red-400 rounded-full hover:bg-red-500" aria-label={t('tariff.deleteTimeBasedTariff')}><CloseIcon size={18}/></button>
                             </div>
                         </div>
                     ))}
                     {tariff.timeBasedTariffs.length === 0 && (
                         <p className="text-gray-400 text-sm text-center py-2">{t('tariff.noTimeBasedTariffs')}</p>
                     )}
                 </div>
             </section>
        </div>

        <div className="flex justify-between items-center p-6 bg-slate-900 border-t border-slate-700 rounded-b-lg">
            <button type="button" onClick={handleReset} className="flex items-center space-x-2 px-4 py-2 text-sm font-medium rounded-md bg-slate-600 text-gray-200 hover:bg-slate-500 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 focus:ring-offset-slate-800"><UndoIcon size={16}/><span>{t('tariff.resetToDefault')}</span></button>
            <div className="space-x-3">
                <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium rounded-md bg-slate-600 text-gray-200 hover:bg-slate-500 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 focus:ring-offset-slate-800">{t('general.cancel')}</button>
                <button type="button" onClick={handleSave} className="px-4 py-2 text-sm font-medium rounded-md shadow-sm text-slate-900 bg-cyan-400 hover:bg-cyan-500 transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-offset-2 focus:ring-offset-slate-800">{t('tariff.saveTariff')}</button>
            </div>
        </div>
      </div>
    </div>
  );
};