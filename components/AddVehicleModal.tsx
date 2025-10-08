import React, { useState } from 'react';
import type { Vehicle } from '../types';
import { VehicleStatus, VehicleType, FuelType } from '../types';
import { CloseIcon } from './icons';
import { useTranslation } from '../contexts/LanguageContext';

interface AddVehicleModalProps {
  onSave: (vehicle: Omit<Vehicle, 'id' | 'freeAt' | 'driverId'>) => void;
  onClose: () => void;
}

const initialVehicleState: Omit<Vehicle, 'id' | 'freeAt' | 'driverId'> = {
  name: '',
  licensePlate: '',
  type: VehicleType.Car,
  status: VehicleStatus.Available,
  location: '',
  capacity: 4,
  mileage: 0,
  serviceInterval: 30000,
  lastServiceMileage: 0,
  technicalInspectionExpiry: '',
  vignetteExpiry: '',
  vehicleNotes: '',
  fuelType: FuelType.Diesel,
  fuelConsumption: 0,
};

export const AddVehicleModal: React.FC<AddVehicleModalProps> = ({ onSave, onClose }) => {
  const { t } = useTranslation();
  const [formData, setFormData] = useState(initialVehicleState);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: ['capacity', 'mileage', 'serviceInterval', 'lastServiceMileage', 'fuelConsumption'].includes(name) ? parseFloat(value) || 0 : value,
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.name.trim() && formData.location.trim() && formData.licensePlate.trim() && formData.capacity > 0) {
      onSave(formData);
    } else {
      alert(t('vehicles.add.fillAllFields'));
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/70 z-50 flex justify-center items-center p-4 animate-fade-in"
      aria-labelledby="add-vehicle-title"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-slate-800 rounded-lg shadow-2xl w-full max-w-md relative">
        <div className="flex justify-between items-center p-6 border-b border-slate-700">
          <h2 id="add-vehicle-title" className="text-xl font-semibold">
            {t('vehicles.add.title')}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
            aria-label={t('general.closeModal')}
          >
            <CloseIcon />
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
             <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-300 mb-1">
                {t('vehicles.fields.name')}
              </label>
              <input
                type="text"
                id="name"
                name="name"
                value={formData.name}
                onChange={handleChange}
                required
                placeholder={t('vehicles.add.namePlaceholder')}
                className="w-full bg-slate-700 border border-slate-600 rounded-md shadow-sm py-2 px-3 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
              />
            </div>
            <div>
              <label htmlFor="licensePlate" className="block text-sm font-medium text-gray-300 mb-1">
                {t('vehicles.fields.licensePlate')}
              </label>
              <input
                type="text"
                id="licensePlate"
                name="licensePlate"
                value={formData.licensePlate}
                onChange={handleChange}
                required
                placeholder={t('vehicles.add.licensePlatePlaceholder')}
                className="w-full bg-slate-700 border border-slate-600 rounded-md shadow-sm py-2 px-3 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
              />
            </div>
            <div>
              <label htmlFor="location" className="block text-sm font-medium text-gray-300 mb-1">
                {t('vehicles.fields.location')}
              </label>
              <input
                type="text"
                id="location"
                name="location"
                value={formData.location}
                onChange={handleChange}
                required
                placeholder={t('vehicles.add.locationPlaceholder')}
                className="w-full bg-slate-700 border border-slate-600 rounded-md shadow-sm py-2 px-3 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="type" className="block text-sm font-medium text-gray-300 mb-1">
                  {t('vehicles.fields.type')}
                </label>
                <select
                  id="type"
                  name="type"
                  value={formData.type}
                  onChange={handleChange}
                  className="w-full bg-slate-700 border border-slate-600 rounded-md shadow-sm py-2 px-3 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
                >
                  {Object.values(VehicleType).map(type => (<option key={type} value={type}>{t(`vehicleType.${type}`)}</option>))}
                </select>
              </div>
               <div>
                <label htmlFor="capacity" className="block text-sm font-medium text-gray-300 mb-1">
                  {t('vehicles.fields.capacity')}
                </label>
                <input
                  type="number"
                  id="capacity"
                  name="capacity"
                  value={formData.capacity}
                  onChange={handleChange}
                  min="1"
                  required
                  className="w-full bg-slate-700 border border-slate-600 rounded-md shadow-sm py-2 px-3 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="fuelType" className="block text-sm font-medium text-gray-300 mb-1">{t('vehicles.fields.fuelType')}</label>
                <select id="fuelType" name="fuelType" value={formData.fuelType} onChange={handleChange} className="w-full bg-slate-700 border border-slate-600 rounded-md shadow-sm py-2 px-3 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500">
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
            <div className="border-t border-slate-700 pt-4 mt-4">
              <h3 className="text-md font-semibold text-gray-200 mb-2">{t('vehicles.add.serviceDetailsOptional')}</h3>
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
                <textarea name="vehicleNotes" id="vehicleNotes" value={formData.vehicleNotes || ''} onChange={handleChange} rows={2} className="w-full bg-slate-700 border border-slate-600 rounded-md py-2 px-3 text-white" />
              </div>
            </div>
          </div>
          <div className="flex justify-end items-center p-6 bg-slate-900 border-t border-slate-700 rounded-b-lg space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium rounded-md bg-slate-600 text-gray-200 hover:bg-slate-500 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 focus:ring-offset-slate-800"
            >
              {t('general.cancel')}
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-sm font-medium rounded-md shadow-sm text-slate-900 bg-cyan-400 hover:bg-cyan-500 transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-offset-2 focus:ring-offset-slate-800"
            >
              {t('vehicles.add.addVehicleButton')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};