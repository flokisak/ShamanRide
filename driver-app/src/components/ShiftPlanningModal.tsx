import React, { useState, useEffect } from 'react';
import { ShiftPlan, ShiftPlanStatus, RecurringPattern, Person } from '../../../types';
import { format, parseISO } from 'date-fns';
import { cs } from 'date-fns/locale';
import { useTranslation } from '../contexts/LanguageContext';

interface ShiftPlanningModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (shiftPlan: Omit<ShiftPlan, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  onUpdate?: (id: string, updates: Partial<ShiftPlan>) => Promise<void>;
  editingShift?: ShiftPlan;
  driverId?: number;
  availableDrivers?: Person[];
  isDispatcher?: boolean;
}

const ShiftPlanningModal: React.FC<ShiftPlanningModalProps> = ({
  isOpen,
  onClose,
  onSave,
  onUpdate,
  editingShift,
  driverId,
  availableDrivers = [],
  isDispatcher = false
}) => {
  const [formData, setFormData] = useState({
    driverId: driverId || 0,
    plannedStart: '',
    plannedEnd: '',
    status: ShiftPlanStatus.Planned,
    notes: '',
    recurringPattern: RecurringPattern.None,
    recurringEndDate: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [viewMode, setViewMode] = useState<'month' | 'day' | 'list'>('month');
  let t: (key: string) => string;
  try {
    ({ t } = useTranslation());
  } catch (error) {
    t = (key: string) => key; // Fallback to return the key itself
  }

  useEffect(() => {
    if (editingShift) {
      setFormData({
        driverId: editingShift.driverId,
        plannedStart: format(new Date(editingShift.plannedStart), "yyyy-MM-dd'T'HH:mm"),
        plannedEnd: format(new Date(editingShift.plannedEnd), "yyyy-MM-dd'T'HH:mm"),
        status: editingShift.status,
        notes: editingShift.notes || '',
        recurringPattern: editingShift.recurringPattern || RecurringPattern.None,
        recurringEndDate: editingShift.recurringEndDate 
          ? format(new Date(editingShift.recurringEndDate), 'yyyy-MM-dd')
          : ''
      });
    } else {
      // Reset form for new shift
      const now = new Date();
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      
      setFormData({
        driverId: driverId || 0,
        plannedStart: format(tomorrow, "yyyy-MM-dd'T'09:00"),
        plannedEnd: format(tomorrow, "yyyy-MM-dd'T'17:00"),
        status: ShiftPlanStatus.Planned,
        notes: '',
        recurringPattern: RecurringPattern.None,
        recurringEndDate: ''
      });
    }
  }, [editingShift, driverId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      // Validate dates
      const startDate = new Date(formData.plannedStart);
      const endDate = new Date(formData.plannedEnd);

      if (startDate >= endDate) {
        setError('Konec směny musí být po začátku směny');
        return;
      }

      // Validate recurring end date
      if (formData.recurringPattern !== RecurringPattern.None && formData.recurringEndDate) {
        const recurringEnd = new Date(formData.recurringEndDate);
        if (recurringEnd <= startDate) {
          setError('Datum konce opakování musí být po začátku první směny');
          return;
        }
      }

      const shiftPlanData: Omit<ShiftPlan, 'id' | 'createdAt' | 'updatedAt'> = {
        driverId: formData.driverId,
        plannedStart: startDate,
        plannedEnd: endDate,
        status: formData.status,
        notes: formData.notes || undefined,
        recurringPattern: formData.recurringPattern !== RecurringPattern.None 
          ? formData.recurringPattern 
          : undefined,
        recurringEndDate: formData.recurringEndDate 
          ? new Date(formData.recurringEndDate) 
          : undefined
      };

      if (editingShift && onUpdate) {
        await onUpdate(editingShift.id, shiftPlanData);
      } else {
        await onSave(shiftPlanData);
      }

      onClose();
    } catch (err: any) {
      setError(err.message || 'Chyba při ukládání směny');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white/10 backdrop-blur-md rounded-xl p-6 w-full max-w-md border border-white/20">
        <h2 className="text-xl font-bold text-white mb-4">
          {editingShift ? 'Upravit směnu' : 'Naplánovat směnu'}
        </h2>

        {error && (
          <div className="bg-red-500/20 border border-red-500/50 text-red-200 px-3 py-2 rounded-lg mb-4 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Driver Selection (only for dispatcher) - Disabled in driver app */}
          {false && isDispatcher && (
            <div>
              <label className="block text-white/80 text-sm font-medium mb-1">
                Řidič
              </label>
              <select
                name="driverId"
                value={formData.driverId}
                onChange={handleInputChange}
                className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                required
              >
                <option value={0} disabled>Vyberte řidiče</option>
                {availableDrivers.map(driver => (
                  <option key={driver.id} value={driver.id}>
                    {driver.name}
                  </option>
                ))}
              </select>
            </div>
           )}

           {/* Fast Options */}
           <div>
             <label className="block text-white/80 text-sm font-medium mb-2">
               {t('shiftPlanning.fastOptions')}
             </label>
              <div className="flex flex-col gap-2">
               <button
                 type="button"
                 onClick={() => {
                   const now = new Date();
                   const startDate = new Date(now);
                   startDate.setHours(6, 0, 0, 0); // 6:00 AM today
                    const endDate = new Date(now);
                    endDate.setHours(18, 0, 0, 0); // 6:00 PM today

                    setFormData(prev => ({
                      ...prev,
                      plannedStart: startDate.getFullYear() + '-' +
                                    String(startDate.getMonth() + 1).padStart(2, '0') + '-' +
                                    String(startDate.getDate()).padStart(2, '0') + 'T' +
                                    String(startDate.getHours()).padStart(2, '0') + ':' +
                                    String(startDate.getMinutes()).padStart(2, '0'),
                      plannedEnd: endDate.getFullYear() + '-' +
                                  String(endDate.getMonth() + 1).padStart(2, '0') + '-' +
                                  String(endDate.getDate()).padStart(2, '0') + 'T' +
                                  String(endDate.getHours()).padStart(2, '0') + ':' +
                                  String(endDate.getMinutes()).padStart(2, '0')
                    }));
                 }}
                 className="flex-1 px-3 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg transition-colors text-sm font-medium flex items-center justify-center gap-2"
               >
                 <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                 </svg>
                 {t('shiftPlanning.dayShift')}
               </button>
               <button
                 type="button"
                 onClick={() => {
                   const now = new Date();
                   const startDate = new Date(now);
                   startDate.setHours(18, 0, 0, 0); // 6:00 PM today
                    const endDate = new Date(now);
                    endDate.setDate(endDate.getDate() + 1); // Next day
                    endDate.setHours(6, 0, 0, 0); // 6:00 AM next day

                    setFormData(prev => ({
                      ...prev,
                      plannedStart: startDate.getFullYear() + '-' +
                                    String(startDate.getMonth() + 1).padStart(2, '0') + '-' +
                                    String(startDate.getDate()).padStart(2, '0') + 'T' +
                                    String(startDate.getHours()).padStart(2, '0') + ':' +
                                    String(startDate.getMinutes()).padStart(2, '0'),
                      plannedEnd: endDate.getFullYear() + '-' +
                                  String(endDate.getMonth() + 1).padStart(2, '0') + '-' +
                                  String(endDate.getDate()).padStart(2, '0') + 'T' +
                                  String(endDate.getHours()).padStart(2, '0') + ':' +
                                  String(endDate.getMinutes()).padStart(2, '0')
                    }));
                 }}
                 className="flex-1 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors text-sm font-medium flex items-center justify-center gap-2"
               >
                 <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                 </svg>
                 {t('shiftPlanning.nightShift')}
               </button>
             </div>
           </div>

           {/* Start Date and Time */}
          <div>
            <label className="block text-white/80 text-sm font-medium mb-1">
              Začátek směny
            </label>
            <input
              type="datetime-local"
              name="plannedStart"
              value={formData.plannedStart}
              onChange={handleInputChange}
              className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-400"
              required
            />
          </div>

          {/* End Date and Time */}
          <div>
            <label className="block text-white/80 text-sm font-medium mb-1">
              Konec směny
            </label>
            <input
              type="datetime-local"
              name="plannedEnd"
              value={formData.plannedEnd}
              onChange={handleInputChange}
              className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-400"
              required
            />
          </div>

          {/* Status (only for editing) */}
          {editingShift && (
            <div>
              <label className="block text-white/80 text-sm font-medium mb-1">
                Stav
              </label>
              <select
                name="status"
                value={formData.status}
                onChange={handleInputChange}
                className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-400"
              >
                <option value={ShiftPlanStatus.Planned}>Plánováno</option>
                <option value={ShiftPlanStatus.Active}>Aktivní</option>
                <option value={ShiftPlanStatus.Completed}>Dokončeno</option>
                <option value={ShiftPlanStatus.Cancelled}>Zrušeno</option>
              </select>
            </div>
          )}

          {/* Recurring Pattern */}
          <div>
            <label className="block text-white/80 text-sm font-medium mb-1">
              Opakování
            </label>
            <select
              name="recurringPattern"
              value={formData.recurringPattern}
              onChange={handleInputChange}
              className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-400"
            >
              <option value={RecurringPattern.None}>Bez opakování</option>
              <option value={RecurringPattern.Daily}>Denně</option>
              <option value={RecurringPattern.Weekly}>Týdně</option>
              <option value={RecurringPattern.Monthly}>Měsíčně</option>
            </select>
          </div>

          {/* Recurring End Date */}
          {formData.recurringPattern !== RecurringPattern.None && (
            <div>
              <label className="block text-white/80 text-sm font-medium mb-1">
                Konec opakování
              </label>
              <input
                type="date"
                name="recurringEndDate"
                value={formData.recurringEndDate}
                onChange={handleInputChange}
                className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                required
              />
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="block text-white/80 text-sm font-medium mb-1">
              Poznámky
            </label>
            <textarea
              name="notes"
              value={formData.notes}
              onChange={handleInputChange}
              rows={3}
              className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
              placeholder="Volitelné poznámky..."
            />
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors"
            >
              Zrušit
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-blue-500/50 text-white rounded-lg transition-colors disabled:cursor-not-allowed"
            >
              {loading ? 'Ukládám...' : (editingShift ? 'Uložit změny' : 'Vytvořit směnu')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ShiftPlanningModal;