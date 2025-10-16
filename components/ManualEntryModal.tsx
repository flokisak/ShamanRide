import React, { useState, useEffect } from 'react';
import { Person, ManualEntry, ManualEntryType } from '../types';
import { supabaseService } from '../services/supabaseClient';
import { CloseIcon, PlusIcon } from './icons';
import { useTranslation } from '../contexts/LanguageContext';

interface ManualEntryModalProps {
  isOpen: boolean;
  onClose: () => void;
  people: Person[];
  onEntryAdded?: () => void;
}

export const ManualEntryModal: React.FC<ManualEntryModalProps> = ({
  isOpen,
  onClose,
  people,
  onEntryAdded
}) => {
  const { t } = useTranslation();
  const [selectedDriver, setSelectedDriver] = useState<number | null>(null);
  const [entryType, setEntryType] = useState<ManualEntryType>(ManualEntryType.FIVE_STAR_REVIEW);
  const [points, setPoints] = useState<number>(10);
  const [title, setTitle] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const drivers = people.filter(person => person.role === 'Driver');

  const entryTypeOptions = [
    { value: ManualEntryType.FIVE_STAR_REVIEW, label: '5* Recenze', defaultPoints: 10, defaultTitle: '5* hodnocení od zákazníka' },
    { value: ManualEntryType.CUSTOMER_COMPLAINT, label: 'Stížnost zákazníka', defaultPoints: -5, defaultTitle: 'Stížnost zákazníka' },
    { value: ManualEntryType.DEER_COLLISION, label: 'Sražená srna', defaultPoints: 5, defaultTitle: 'Sražená srna' },
    { value: ManualEntryType.ACCIDENT, label: 'Nehoda', defaultPoints: -20, defaultTitle: 'Dopravní nehoda' },
    { value: ManualEntryType.PERFECT_SERVICE, label: 'Perfektní služba', defaultPoints: 15, defaultTitle: 'Výjimečná služba' },
    { value: ManualEntryType.CUSTOMER_FEEDBACK, label: 'Zpětná vazba', defaultPoints: 5, defaultTitle: 'Pozitivní zpětná vazba' },
    { value: ManualEntryType.BONUS_POINTS, label: 'Bonusové body', defaultPoints: 10, defaultTitle: 'Bonusové body' }
  ];

  useEffect(() => {
    const selectedOption = entryTypeOptions.find(option => option.value === entryType);
    if (selectedOption) {
      setPoints(selectedOption.defaultPoints);
      setTitle(selectedOption.defaultTitle);
    }
  }, [entryType]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDriver) return;

    setIsSubmitting(true);
    try {
      const newEntry: Omit<ManualEntry, 'id'> = {
        driver_id: selectedDriver,
        type: entryType,
        title,
        description,
        points,
        created_at: new Date().toISOString(),
        notes: notes || undefined
      };

      await supabaseService.addManualEntry({
        ...newEntry,
        id: `${selectedDriver}_${entryType}_${Date.now()}`
      });

      // Recalculate driver score
      const driver = drivers.find(d => d.id === selectedDriver);
      if (driver) {
        const { GamificationService } = await import('../services/gamificationService');
        await GamificationService.calculateDriverScore(selectedDriver, driver.name);
      }

      // Reset form
      setSelectedDriver(null);
      setEntryType(ManualEntryType.FIVE_STAR_REVIEW);
      setPoints(10);
      setTitle('');
      setDescription('');
      setNotes('');

      onEntryAdded?.();
      onClose();
    } catch (error) {
      console.error('Error adding manual entry:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex justify-center items-start pt-8 p-4 animate-fade-in overflow-y-auto">
      <div className="bg-slate-800 rounded-lg shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden animate-slide-in">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-700">
          <div className="flex items-center gap-3">
            <PlusIcon className="text-green-500 w-8 h-8" />
            <div>
              <h2 className="text-2xl font-bold text-white">Přidat manuální záznam</h2>
              <p className="text-gray-400 text-sm">Přidejte body za recenze, incidenty nebo jiné události</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
            aria-label="Zavřít"
          >
            <CloseIcon className="w-6 h-6" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6 overflow-y-auto max-h-[calc(90vh-120px)]">
          {/* Driver Selection */}
          <div>
            <label className="block text-sm font-medium text-white mb-2">
              Řidič *
            </label>
            <select
              value={selectedDriver || ''}
              onChange={(e) => setSelectedDriver(Number(e.target.value) || null)}
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            >
              <option value="">Vyberte řidiče</option>
              {drivers.map(driver => (
                <option key={driver.id} value={driver.id}>
                  {driver.name}
                </option>
              ))}
            </select>
          </div>

          {/* Entry Type */}
          <div>
            <label className="block text-sm font-medium text-white mb-2">
              Typ události *
            </label>
            <select
              value={entryType}
              onChange={(e) => setEntryType(e.target.value as ManualEntryType)}
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {entryTypeOptions.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          {/* Points */}
          <div>
            <label className="block text-sm font-medium text-white mb-2">
              Body *
            </label>
            <input
              type="number"
              value={points}
              onChange={(e) => setPoints(Number(e.target.value))}
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              min="-100"
              max="100"
              required
            />
            <p className="text-xs text-gray-400 mt-1">
              Pozitivní body za dobré události, negativní za problémy
            </p>
          </div>

          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-white mb-2">
              Název *
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Např. Výborná služba"
              required
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-white mb-2">
              Popis
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500 h-20 resize-none"
              placeholder="Detailní popis události..."
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-white mb-2">
              Poznámky
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500 h-16 resize-none"
              placeholder="Interní poznámky..."
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-slate-700 text-white rounded-md hover:bg-slate-600 transition-colors"
            >
              Zrušit
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !selectedDriver}
              className="flex-1 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isSubmitting ? 'Přidávám...' : 'Přidat záznam'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
