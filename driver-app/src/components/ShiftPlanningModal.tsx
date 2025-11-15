import React, { useState, useEffect } from 'react';
import { ShiftPlan, ShiftPlanStatus, RecurringPattern, Person } from '../../../types';
import { format, parseISO } from 'date-fns';
import { cs } from 'date-fns/locale';

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