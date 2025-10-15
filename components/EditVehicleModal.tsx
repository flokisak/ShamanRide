import React, { useState, useEffect } from 'react';
import type { Vehicle, Person } from '../types';
import { VehicleStatus, VehicleType, PersonRole, FuelType } from '../types';
import { CloseIcon } from './icons';
import { useTranslation } from '../contexts/LanguageContext';

interface EditVehicleModalProps {
  vehicle: Vehicle;
  people: Person[];
  onSave: (vehicle: Vehicle) => void;
  onClose: () => void;
  onDelete: (vehicleId: number) => void;
}

export const EditVehicleModal: React.FC<EditVehicleModalProps> = ({ vehicle, people, onSave, onClose, onDelete }) => {
  const { t } = useTranslation();
  const [formData, setFormData] = useState<Vehicle>(vehicle);
  const [outOfServiceMinutes, setOutOfServiceMinutes] = useState<number>(60);
  
  const drivers = people.filter(p => p.role === PersonRole.Driver);

  useEffect(() => {
    setFormData(vehicle);
  }, [vehicle]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => {
      let finalValue: any = value;
      const numericFields = ['capacity', 'mileage', 'serviceInterval', 'lastServiceMileage', 'fuelConsumption'];
      if (numericFields.includes(name)) {
        finalValue = value ? parseFloat(value) : 0;
      }
      if (name === 'driverId') {
          finalValue = value ? parseInt(value, 10) : null;
      }
      
      const newFormData = { ...prev, [name]: finalValue };

      if (name === 'status' && value !== VehicleStatus.Busy && value !== VehicleStatus.OutOfService) {
        newFormData.freeAt = undefined;
      }
      return newFormData;
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    let dataToSave = { ...formData };
    if (dataToSave.status === VehicleStatus.OutOfService) {
        dataToSave.freeAt = Date.now() + outOfServiceMinutes * 60 * 1000;
    }
    onSave(dataToSave);
  };

  const handleDelete = () => {
    if (window.confirm(t('vehicles.edit.confirmDelete', { name: vehicle.name }))) {
      onDelete(vehicle.id);
    }
  };


  return (
    <div
      className="fixed inset-0 bg-black/70 z-50 flex justify-center items-center p-4 animate-fade-in"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-slate-800 rounded-lg shadow-2xl w-full max-w-md relative">
        <div className="flex justify-between items-center p-6 border-b border-slate-700">
          <h2 className="text-xl font-semibold">
            {t('vehicles.edit.title')}: <span className="text-cyan-400">{vehicle.name}</span>
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors" aria-label={t('general.close')}><CloseIcon /></button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
             <div>
               <label htmlFor="name" className="block text-sm font-medium text-gray-300 mb-1">
                 {t('vehicles.fields.name')}
               </label>
               <input type="text" id="name" name="name" value={formData.name} onChange={handleChange} className="w-full bg-slate-700 border border-slate-600 rounded-md shadow-sm py-2 px-3 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500" required />
             </div>
             <div>
               <label htmlFor="driverId" className="block text-sm font-medium text-gray-300 mb-1">
                 {t('vehicles.fields.assignedDriver')}
               </label>
               <select
                 id="driverId"
                 name="driverId"
                 value={formData.driverId === null ? '' : formData.driverId}
                 onChange={handleChange}
                 className="w-full bg-slate-700 border border-slate-600 rounded-md shadow-sm py-2 px-3 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
               >
                   <option value="">-- {t('vehicles.fields.noDriverAssigned')} --</option>
                   {drivers.map(driver => (
                       <option key={driver.id} value={driver.id}>{driver.name}</option>
                   ))}
               </select>
             </div>
            <div>
              <label htmlFor="licensePlate" className="block text-sm font-medium text-gray-300 mb-1">{t('vehicles.fields.licensePlate')}</label>
              <input type="text" id="licensePlate" name="licensePlate" value={formData.licensePlate} onChange={handleChange} className="w-full bg-slate-700 border border-slate-600 rounded-md shadow-sm py-2 px-3 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500" />
            </div>
             <div>
               <label htmlFor="location" className="block text-sm font-medium text-gray-300 mb-1">{t('vehicles.fields.location')}</label>
               <input type="text" id="location" name="location" value={formData.location} onChange={handleChange} className="w-full bg-slate-700 border border-slate-600 rounded-md shadow-sm py-2 px-3 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500" />
             </div>
             <div>
                <label htmlFor="phone" className="block text-sm font-medium text-gray-300 mb-1">{t('vehicles.fields.phone')}</label>
                <input type="tel" id="phone" name="phone" value={formData.phone || ''} onChange={handleChange} className="w-full bg-slate-700 border border-slate-600 rounded-md shadow-sm py-2 px-3 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500" />

                <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-1">{t('vehicles.fields.email')}</label>
                <input type="email" id="email" name="email" value={formData.email || ''} onChange={handleChange} className="w-full bg-slate-700 border border-slate-600 rounded-md shadow-sm py-2 px-3 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500" />
             </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label htmlFor="type" className="block text-sm font-medium text-gray-300 mb-1">{t('vehicles.fields.type')}</label>
                <select id="type" name="type" value={formData.type} onChange={handleChange} className="w-full bg-slate-700 border border-slate-600 rounded-md shadow-sm py-2 px-3 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500">
                  {Object.values(VehicleType).map(type => {
                    const typeKey = type === VehicleType.Car ? 'CAR' : type === VehicleType.Van ? 'VAN' : type;
                    return (<option key={type} value={type}>{t(`vehicleType.${typeKey}`)}</option>);
                  })}
                </select>
              </div>
              <div>
                <label htmlFor="status" className="block text-sm font-medium text-gray-300 mb-1">{t('vehicles.fields.status')}</label>
                <select id="status" name="status" value={formData.status} onChange={handleChange} className="w-full bg-slate-700 border border-slate-600 rounded-md shadow-sm py-2 px-3 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500">
                  {Object.values(VehicleStatus).map(status => (<option key={status} value={status}>{t(`vehicleStatus.${status}`)}</option>))}
                </select>
              </div>
               <div>
                <label htmlFor="capacity" className="block text-sm font-medium text-gray-300 mb-1">{t('vehicles.fields.capacity')}</label>
                <input type="number" id="capacity" name="capacity" value={formData.capacity} onChange={handleChange} min="1" className="w-full bg-slate-700 border border-slate-600 rounded-md shadow-sm py-2 px-3 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500" />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="fuelType" className="block text-sm font-medium text-gray-300 mb-1">{t('vehicles.fields.fuelType')}</label>
                <select id="fuelType" name="fuelType" value={formData.fuelType || ''} onChange={handleChange} className="w-full bg-slate-700 border border-slate-600 rounded-md shadow-sm py-2 px-3 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500">
                  <option value="">-- {t('general.unassigned')} --</option>
                  {Object.values(FuelType).map(type => {
                    const typeKey = type === FuelType.Diesel ? 'DIESEL' : type === FuelType.Petrol ? 'PETROL' : type;
                    return (<option key={type} value={type}>{t(`fuelType.${typeKey}`)}</option>);
                  })}
                </select>
              </div>
              <div>
                <label htmlFor="fuelConsumption" className="block text-sm font-medium text-gray-300 mb-1">{t('vehicles.fields.fuelConsumption')}</label>
                <input type="number" step="0.1" id="fuelConsumption" name="fuelConsumption" value={formData.fuelConsumption || ''} onChange={handleChange} className="w-full bg-slate-700 border border-slate-600 rounded-md shadow-sm py-2 px-3 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500" />
              </div>
            </div>
             <div className="border-t border-slate-700 pt-4">
              <h3 className="text-md font-semibold text-gray-200 mb-3">{t('vehicles.edit.serviceDetailsTitle')}</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="mileage" className="block text-sm font-medium text-gray-300 mb-1">{t('vehicles.fields.mileage')}</label>
                  <input type="number" name="mileage" id="mileage" value={formData.mileage || ''} onChange={handleChange} className="w-full bg-slate-700 border border-slate-600 rounded-md py-2 px-3 text-white" />
                </div>
                <div>
                  <label htmlFor="serviceInterval" className="block text-sm font-medium text-gray-300 mb-1">{t('vehicles.fields.serviceInterval')}</label>
                  <input type="number" name="serviceInterval" id="serviceInterval" value={formData.serviceInterval || ''} onChange={handleChange} className="w-full bg-slate-700 border border-slate-600 rounded-md py-2 px-3 text-white" />
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor="lastServiceMileage" className="block text-sm font-medium text-gray-300 mb-1">{t('vehicles.fields.lastServiceMileage')}</label>
                  <input type="number" name="lastServiceMileage" id="lastServiceMileage" value={formData.lastServiceMileage || ''} onChange={handleChange} className="w-full bg-slate-700 border border-slate-600 rounded-md py-2 px-3 text-white" />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                 <div>
                  <label htmlFor="technicalInspectionExpiry" className="block text-sm font-medium text-gray-300 mb-1">{t('vehicles.fields.inspectionExpiry')}</label>
                  <input type="date" name="technicalInspectionExpiry" id="technicalInspectionExpiry" value={formData.technicalInspectionExpiry || ''} onChange={handleChange} className="w-full bg-slate-700 border border-slate-600 rounded-md py-2 px-3 text-white" />
                </div>
                <div>
                  <label htmlFor="vignetteExpiry" className="block text-sm font-medium text-gray-300 mb-1">{t('vehicles.fields.vignetteExpiry')}</label>
                  <input type="date" name="vignetteExpiry" id="vignetteExpiry" value={formData.vignetteExpiry || ''} onChange={handleChange} className="w-full bg-slate-700 border border-slate-600 rounded-md py-2 px-3 text-white" />
                </div>
              </div>
              <div className="mt-4">
                <label htmlFor="vehicleNotes" className="block text-sm font-medium text-gray-300 mb-1">{t('vehicles.fields.notes')}</label>
                <textarea name="vehicleNotes" id="vehicleNotes" value={formData.vehicleNotes || ''} onChange={handleChange} rows={3} className="w-full bg-slate-700 border border-slate-600 rounded-md py-2 px-3 text-white" />
              </div>
            </div>
            {formData.status === VehicleStatus.OutOfService && (
                <div className="pt-2">
                    <label htmlFor="outOfServiceMinutes" className="block text-sm font-medium text-gray-300 mb-1">{t('vehicles.edit.unavailableTime')}</label>
                    <input type="number" id="outOfServiceMinutes" name="outOfServiceMinutes" value={outOfServiceMinutes} onChange={(e) => setOutOfServiceMinutes(parseInt(e.target.value, 10) || 0)} min="1" required className="w-full bg-slate-700 border border-slate-600 rounded-md shadow-sm py-2 px-3 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500" />
                </div>
            )}
          </div>
          <div className="flex justify-between items-center p-6 bg-slate-900 border-t border-slate-700 rounded-b-lg">
            <button type="button" onClick={handleDelete} className="px-4 py-2 text-sm font-medium rounded-md bg-red-800 text-red-100 hover:bg-red-700 transition-colors focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 focus:ring-offset-slate-800">{t('vehicles.edit.deleteVehicle')}</button>
            <div className="space-x-3">
                <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium rounded-md bg-slate-600 text-gray-200 hover:bg-slate-500 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 focus:ring-offset-slate-800">{t('general.cancel')}</button>
                <button type="submit" className="px-4 py-2 text-sm font-medium rounded-md shadow-sm text-slate-900 bg-cyan-400 hover:bg-cyan-500 transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-offset-2 focus:ring-offset-slate-800">{t('general.saveChanges')}</button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};