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
  onDuplicateRide?: () => void;
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
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [duplicateRide, setDuplicateRide] = useState<any>(null);

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
    if (!selectedDriver || !title.trim()) return;

    try {
      const entryData: Omit<ManualEntry, 'id' | 'createdAt' | 'updatedAt'> = {
        driverId: selectedDriver,
        type: entryType,
        title: title.trim(),
        description: description.trim(),
        notes: notes.trim(),
        points: points,
        body: '', // Only for DEER_COLLISION
        timestamp: new Date().toISOString()
      };

      const { data, error } = await supabaseService.createManualEntry(entryData);
      
      if (error) {
        console.error('Error creating manual entry:', error);
        return;
      }

      onEntryAdded?.(data);
      onClose();
      
      // Reset form
      setTitle('');
      setDescription('');
      setNotes('');
      setPoints(entryTypeOptions.find(opt => opt.value === entryType)?.defaultPoints || 10);
    } catch (err: any) {
      console.error('Error submitting manual entry:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDuplicateRide = async () => {
    if (!duplicateRide?.driverId || !duplicateRide.body?.trim()) return;

    try {
      const entryData: Omit<ManualEntry, 'id' | 'createdAt' | 'updatedAt'> = {
        driverId: duplicateRide.driverId,
        type: ManualEntryType.CUSTOMER_RIDE,
        title: `Duplikát: ${duplicateRide.title}`,
        description: duplicateRide.body || '',
        notes: `Duplikováno z jízdy: ${new Date().toLocaleString()}`,
        points: duplicateRide.points || 0,
        body: duplicateRide.body,
        timestamp: new Date().toISOString()
      };

      const { data, error } = await supabaseService.createManualEntry(entryData);
      
      if (error) {
        console.error('Error creating duplicate ride entry:', error);
        return;
      }

      onEntryAdded?.(data);
      setShowDuplicateModal(false);
      setDuplicateRide(null);
    } catch (err: any) {
      console.error('Error creating duplicate ride entry:', err);
    }
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
            disabled={isSubmitting || !selectedDriver || !title.trim()}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed py-3 rounded-md font-medium text-white transition-colors"
          >
            {isSubmitting ? 'Ukládám...' : 'Přidat položku'}
          </button>
          
          {/* Duplicate Ride Button */}
          {selectedDriver && (
            <button
              type="button"
              onClick={() => setShowDuplicateModal(true)}
              className="w-full mt-2 bg-orange-600 hover:bg-orange-700 py-2 rounded-md font-medium text-white transition-colors"
            >
              📋 Duplikovat jízdu
            </button>
          )}
        </form>
      </div>
    </div>
  </div>

    {/* Duplicate Ride Modal */}
    {showDuplicateModal && duplicateRide && (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-md">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">
            Duplikovat jízdu
          </h3>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Kopírovat jízdu pro:
              </label>
              <select
                value={duplicateRide.driverId || ''}
                onChange={(e) => setDuplicateRide({...duplicateRide, driverId: parseInt(e.target.value)})}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-400"
              >
                {people.filter(person => person.role === 'Driver').map(driver => (
                  <option key={driver.id} value={driver.id}>
                    {driver.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Body jízdy:
              </label>
              <textarea
                value={duplicateRide.body || ''}
                onChange={(e) => setDuplicateRide({...duplicateRide, body: e.target.value})}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-400"
                placeholder="Zadejte body jízdy (pokud je potřeba)..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Počet pasažérů:
              </label>
              <input
                type="number"
                value={duplicateRide.passengers || 1}
                onChange={(e) => setDuplicateRide({...duplicateRide, passengers: parseInt(e.target.value)})}
                min="1"
                max="8"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-400"
              />
            </div>
          </div>

          <div className="flex gap-3 mt-6">
            <button
              onClick={() => setShowDuplicateModal(false)}
              className="flex-1 px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg font-medium text-gray-800"
            >
              Zrušit
            </button>
            <button
              onClick={handleDuplicateRide}
              disabled={!duplicateRide.driverId || !duplicateRide.body?.trim()}
              className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg font-medium text-white"
            >
              📋 Vytvořit duplikát
            </button>
          </div>
        </div>
      </div>
    )}
</div>
        </form>
      </div>
    </div>
  );
};
