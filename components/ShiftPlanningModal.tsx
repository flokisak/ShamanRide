import React, { useState, useEffect } from 'react';
import { ShiftPlan, ShiftPlanStatus, RecurringPattern, Person } from '../types';
import { format, parseISO, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths, startOfWeek, endOfWeek, isWithinInterval, getDay } from 'date-fns';
import { cs } from 'date-fns/locale';
import { ShiftPlanningService } from '../services/shiftPlanningService';

interface ShiftPlanningModalProps {
  isOpen: boolean;
  onClose: () => void;
  supabase: any;
}

const ShiftPlanningModal: React.FC<ShiftPlanningModalProps> = ({
  isOpen,
  onClose,
  supabase
}) => {
  const [shiftPlans, setShiftPlans] = useState<ShiftPlan[]>([]);
  const [availableDrivers, setAvailableDrivers] = useState<Person[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [editingShift, setEditingShift] = useState<ShiftPlan | undefined>(undefined);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [shiftPlanningService, setShiftPlanningService] = useState<ShiftPlanningService | null>(null);

  // Initialize service
  useEffect(() => {
    if (supabase) {
      const service = new ShiftPlanningService(supabase);
      setShiftPlanningService(service);
    }
  }, [supabase]);

  // Load data when modal opens
  useEffect(() => {
    if (isOpen && shiftPlanningService) {
      loadData();
    }
  }, [isOpen, shiftPlanningService, currentMonth]);

  const loadData = async () => {
    setLoading(true);
    setError('');
    
    try {
      const monthStart = startOfMonth(currentMonth);
      const monthEnd = endOfMonth(currentMonth);
      
      const [plans, drivers] = await Promise.all([
        shiftPlanningService!.getAllShiftPlans(monthStart, monthEnd),
        shiftPlanningService!.getAvailableDrivers()
      ]);
      
      setShiftPlans(plans);
      setAvailableDrivers(drivers);
    } catch (err: any) {
      setError(err.message || 'Chyba při načítání dat');
    } finally {
      setLoading(false);
    }
  };

  // Get shifts for a specific date
  const getShiftsForDate = (date: Date): ShiftPlan[] => {
    return shiftPlans.filter(shift => 
      isSameDay(new Date(shift.plannedStart), date)
    );
  };

  // Get status color
  const getStatusColor = (status: ShiftPlanStatus): string => {
    switch (status) {
      case ShiftPlanStatus.Planned:
        return 'bg-blue-500';
      case ShiftPlanStatus.Active:
        return 'bg-green-500';
      case ShiftPlanStatus.Completed:
        return 'bg-gray-500';
      case ShiftPlanStatus.Cancelled:
        return 'bg-red-500';
      default:
        return 'bg-gray-400';
    }
  };

  // Navigate months
  const previousMonth = () => setCurrentMonth(subMonths(currentMonth, 1));
  const nextMonth = () => setCurrentMonth(addMonths(currentMonth, 1));

  // Handle shift click
  const handleShiftClick = (shift: ShiftPlan) => {
    setEditingShift(shift);
    setShowCreateModal(true);
  };

  // Handle create new shift
  const handleCreateShift = () => {
    setEditingShift(undefined);
    setShowCreateModal(true);
  };

  // Handle save shift
  const handleSaveShift = async (shiftPlan: Omit<ShiftPlan, 'id' | 'createdAt' | 'updatedAt'>) => {
    if (!shiftPlanningService) return;
    
    try {
      if (shiftPlan.recurringPattern && shiftPlan.recurringPattern !== RecurringPattern.None && shiftPlan.recurringEndDate) {
        // Create recurring shifts
        await shiftPlanningService.createRecurringShiftPlans(
          shiftPlan,
          shiftPlan.recurringPattern,
          shiftPlan.recurringEndDate
        );
      } else {
        // Create single shift
        await shiftPlanningService.createShiftPlan(shiftPlan);
      }
      
      setShowCreateModal(false);
      await loadData();
    } catch (error: any) {
      setError(error.message || 'Chyba při ukládání směny');
      throw error;
    }
  };

  // Handle update shift
  const handleUpdateShift = async (id: string, updates: Partial<ShiftPlan>) => {
    if (!shiftPlanningService) return;
    
    try {
      await shiftPlanningService.updateShiftPlan(id, updates);
      setShowCreateModal(false);
      setEditingShift(undefined);
      await loadData();
    } catch (error: any) {
      setError(error.message || 'Chyba při aktualizaci směny');
      throw error;
    }
  };

  // Handle delete shift
  const handleDeleteShift = async (id: string) => {
    if (!shiftPlanningService) return;
    
    if (!confirm('Opravdu chcete smazat tuto směnu?')) return;
    
    try {
      await shiftPlanningService.deleteShiftPlan(id);
      await loadData();
    } catch (error: any) {
      setError(error.message || 'Chyba při mazání směny');
    }
  };

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const monthDays = eachDayOfInterval({ start: monthStart, end: monthEnd });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-6xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold">Plánování směn řidičů</h2>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/20 rounded-lg transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 m-4 rounded-lg">
            {error}
          </div>
        )}

        {/* Controls */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={previousMonth}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              
              <h3 className="text-lg font-semibold text-gray-800">
                {format(currentMonth, 'MMMM yyyy', { locale: cs })}
              </h3>
              
              <button
                onClick={nextMonth}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>

            <button
              onClick={handleCreateShift}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Nová směna
            </button>
          </div>
        </div>

        {/* Calendar */}
        <div className="p-6 overflow-auto max-h-[60vh]">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : (
            <div className="grid grid-cols-7 gap-2">
              {/* Weekday Headers */}
              {['Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne'].map(day => (
                <div key={day} className="text-center text-sm font-medium text-gray-600 py-2">
                  {day}
                </div>
              ))}

              {/* Calendar Grid */}
              {monthDays.map((day, index) => {
                const shifts = getShiftsForDate(day);
                const isSelected = selectedDate && isSameDay(day, selectedDate);
                const isToday = isSameDay(day, new Date());

                 return (
                   <div
                     key={index}
                     onClick={() => {
                       setSelectedDate(day);
                       setViewMode('day');
                     }}
                     className={`
                       relative p-2 h-24 border rounded-lg cursor-pointer transition-all
                       ${isSelected ? 'bg-blue-50 border-blue-400' : 'border-gray-200'}
                       ${isToday ? 'ring-2 ring-blue-400' : ''}
                       ${shifts.length > 0 ? 'bg-blue-50' : ''}
                       hover:bg-gray-50
                     `}
                   >
                     <div className={`
                       text-sm font-medium mb-1
                       ${isToday ? 'text-blue-600' : 'text-gray-700'}
                       ${!isSameMonth(day, currentMonth) ? 'text-gray-400' : ''}
                     `}>
                       {format(day, 'd')}
                       {shifts.length > 0 && (
                         <div className="w-2 h-2 bg-blue-500 rounded-full mx-auto mt-1"></div>
                       )}
                     </div>

                    {/* Shift Indicators */}
                    <div className="space-y-1">
                      {shifts.slice(0, 2).map((shift, shiftIndex) => (
                        <div
                          key={shiftIndex}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleShiftClick(shift);
                          }}
                          className={`
                            ${getStatusColor(shift.status)}
                            text-xs text-white px-1 py-0.5 rounded truncate
                            hover:opacity-80 cursor-pointer
                          `}
                        >
                          {shift.driverName} ({format(new Date(shift.plannedStart), 'HH:mm')})
                        </div>
                      ))}
                      
                      {shifts.length > 2 && (
                        <div className="text-xs text-gray-500 text-center">
                          +{shifts.length - 2} více
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Legend */}
        <div className="p-4 border-t border-gray-200 bg-gray-50">
          <div className="flex flex-wrap gap-6 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-blue-500" />
              <span className="text-gray-600">Plánováno</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-green-500" />
              <span className="text-gray-600">Aktivní</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-gray-500" />
              <span className="text-gray-600">Dokončeno</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-red-500" />
              <span className="text-gray-600">Zrušeno</span>
            </div>
          </div>
        </div>
      </div>

      {/* Create/Edit Modal */}
      {showCreateModal && (
        <ShiftCreateEditModal
          isOpen={showCreateModal}
          onClose={() => {
            setShowCreateModal(false);
            setEditingShift(undefined);
          }}
          onSave={handleSaveShift}
          onUpdate={handleUpdateShift}
          onDelete={handleDeleteShift}
          editingShift={editingShift}
          availableDrivers={availableDrivers}
          isDispatcher={true}
        />
      )}
    </div>
  );
};

// Create/Edit Modal Component
interface ShiftCreateEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (shiftPlan: Omit<ShiftPlan, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  onUpdate?: (id: string, updates: Partial<ShiftPlan>) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
  editingShift?: ShiftPlan;
  availableDrivers: Person[];
  isDispatcher: boolean;
  selectedDriverId?: number;
  onDriverChange?: (driverId: number) => void;
}

const ShiftCreateEditModal: React.FC<ShiftCreateEditModalProps> = ({
  isOpen,
  onClose,
  onSave,
  onUpdate,
  onDelete,
  editingShift,
  availableDrivers,
  isDispatcher,
  selectedDriverId,
  onDriverChange
}) => {
  const [formData, setFormData] = useState({
    driverId: selectedDriverId || 0,
    plannedStart: '',
    plannedEnd: '',
    status: ShiftPlanStatus.Planned,
    notes: '',
    recurringPattern: RecurringPattern.None,
    recurringEndDate: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [viewMode, setViewMode] = useState<'month' | 'day'>('month');

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
        driverId: 0,
        plannedStart: format(tomorrow, "yyyy-MM-dd'T'09:00"),
        plannedEnd: format(tomorrow, "yyyy-MM-dd'T'17:00"),
        status: ShiftPlanStatus.Planned,
        notes: '',
        recurringPattern: RecurringPattern.None,
        recurringEndDate: ''
      });
    }
  }, [editingShift]);

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
      <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-gray-800">
            {editingShift ? 'Upravit směnu' : 'Naplánovat směnu'}
          </h2>
          
          {/* View Mode Toggle */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setViewMode('month')}
              className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                viewMode === 'month' 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              📅 Měsíc
            </button>
            <button
              type="button"
              onClick={() => setViewMode('day')}
              className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                viewMode === 'day' 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              📅 Den
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg mb-4 text-sm">
            {error}
          </div>
        )}

        {/* Month Navigation */}
        {viewMode === 'month' && (
          <div className="flex items-center justify-between mb-4">
            <button
              type="button"
              onClick={() => setCurrentMonth(subMonths(currentMonth, -1))}
              className="p-2 hover:bg-gray-100 rounded-lg"
            >
              ◀ Předchozí měsíc
            </button>
            <span className="text-lg font-semibold text-gray-800">
              {format(currentMonth, 'MMMM yyyy', { locale: cs })}
            </span>
            <button
              type="button"
              onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
              className="p-2 hover:bg-gray-100 rounded-lg"
            >
              Následující měsíc ▶
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Driver Selection */}
          {isDispatcher && (
            <div>
              <label className="block text-gray-700 text-sm font-medium mb-1">
                Řidič
              </label>
              <div className="flex gap-2">
                <select
                  name="driverId"
                  value={formData.driverId}
                  onChange={(e) => {
                    const driverId = parseInt(e.target.value);
                    setFormData(prev => ({ ...prev, driverId }));
                    if (onDriverChange) onDriverChange(driverId);
                  }}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
                  required
                >
                  <option value={0} disabled>Vyberte řidiče...</option>
                  {availableDrivers.map(driver => (
                    <option key={driver.id} value={driver.id}>
                      {driver.name}
                    </option>
                  ))}
                </select>
                {selectedDriverId && (
                  <button
                    type="button"
                    onClick={() => {
                      setFormData(prev => ({ ...prev, driverId: 0 }));
                      if (onDriverChange) onDriverChange(0);
                    }}
                    className="px-3 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm"
                  >
                    Zrušit výběr
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Date and Time Inputs */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-gray-700 text-sm font-medium mb-1">
                Začátek
              </label>
              <input
                type="datetime-local"
                name="plannedStart"
                value={formData.plannedStart}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
                required
              />
            </div>
            <div>
              <label className="block text-gray-700 text-sm font-medium mb-1">
                Konec
              </label>
              <input
                type="datetime-local"
                name="plannedEnd"
                value={formData.plannedEnd}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
                required
              />
            </div>
          </div>

          {/* Status and Recurring */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-gray-700 text-sm font-medium mb-1">
                Stav
              </label>
              <select
                name="status"
                value={formData.status}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
              >
                <option value={ShiftPlanStatus.Planned}>Plánováno</option>
                <option value={ShiftPlanStatus.Active}>Aktivní</option>
                <option value={ShiftPlanStatus.Completed}>Dokončeno</option>
                <option value={ShiftPlanStatus.Cancelled}>Zrušeno</option>
              </select>
            </div>
            <div>
              <label className="block text-gray-700 text-sm font-medium mb-1">
                Opakování
              </label>
              <select
                name="recurringPattern"
                value={formData.recurringPattern}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
              >
                <option value={RecurringPattern.None}>Bez opakování</option>
                <option value={RecurringPattern.Daily}>Denně</option>
                <option value={RecurringPattern.Weekly}>Týdně</option>
                <option value={RecurringPattern.Monthly}>Měsíčně</option>
              </select>
            </div>
          </div>

          {/* Recurring End Date */}
          {formData.recurringPattern !== RecurringPattern.None && (
            <div>
              <label className="block text-gray-700 text-sm font-medium mb-1">
                Konec opakování
              </label>
              <input
                type="date"
                name="recurringEndDate"
                value={formData.recurringEndDate}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
                required
              />
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="block text-gray-700 text-sm font-medium mb-1">
              Poznámky
            </label>
            <textarea
              name="notes"
              value={formData.notes}
              onChange={handleInputChange}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
              placeholder="Volitelné poznámky..."
            />
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 pt-4">
            {editingShift && onDelete && (
              <button
                type="button"
                onClick={() => {
                  if (confirm('Opravdu chcete smazat tuto směnu?')) {
                    onDelete(editingShift.id);
                    onClose();
                  }
                }}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
              >
                Smazat
              </button>
            )}
            <div className="flex-1 flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-lg transition-colors"
              >
                Zrušit
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-500/50 text-white rounded-lg transition-colors disabled:cursor-not-allowed"
              >
                {loading ? 'Ukládám...' : (editingShift ? 'Uložit změny' : 'Vytvořit směnu')}
              </button>
            </div>
          </div>
        </form>

        {/* Calendar View */}
        {viewMode === 'month' && (
          <div className="mt-6 border-t pt-6">
            <div className="grid grid-cols-7 gap-2 text-center">
              {['Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne'].map((day, index) => (
                <div key={index} className="text-xs font-medium text-gray-600 mb-2">
                  {day}
                </div>
              ))}
            </div>
            
            {/* Calendar Days Grid */}
            <div className="grid grid-cols-7 gap-1">
              {eachDayOfInterval({ start: startOfMonth(currentMonth), end: endOfMonth(currentMonth) }).map((day, index) => {
                const dayShifts = shiftPlans.filter(shift => 
                  isSameMonth(day, new Date(shift.plannedStart)) && 
                  isSameDay(day, new Date(shift.plannedStart))
                );
                
                return (
                  <div
                    key={index}
                    className={`
                      relative p-2 border rounded-lg cursor-pointer transition-all
                      ${dayShifts.length > 0 ? 'bg-blue-50 border-blue-200' : 'border-gray-200'}
                      ${!isSameMonth(day, currentMonth) ? 'text-gray-400' : 'hover:bg-gray-50'}
                    `}
                    onClick={() => {
                      if (dayShifts.length === 1) {
                        handleShiftClick(dayShifts[0]);
                      } else if (dayShifts.length > 1) {
                        // Show day details when multiple shifts
                      }
                    }}
                  >
                    <div className="text-center">
                      <div className={`text-sm font-medium ${
                        !isSameMonth(day, currentMonth) ? 'text-gray-500' : 'text-gray-900'
                      }`}>
                        {format(day, 'd')}
                      </div>
                      {dayShifts.length > 0 && (
                        <div className="mt-1">
                          {dayShifts.slice(0, 2).map((shift, shiftIndex) => (
                            <div
                              key={shiftIndex}
                              className={`text-xs p-1 rounded mb-1 ${
                                shift.status === ShiftPlanStatus.Active ? 'bg-green-100 text-green-800' :
                                shift.status === ShiftPlanStatus.Completed ? 'bg-gray-100 text-gray-800' :
                                shift.status === ShiftPlanStatus.Cancelled ? 'bg-red-100 text-red-800' :
                                'bg-blue-100 text-blue-800'
                              }`}
                            >
                              {format(new Date(shift.plannedStart), 'HH:mm')}
                            </div>
                          ))}
                          {dayShifts.length > 2 && (
                            <div className="text-xs text-gray-600">
                              +{dayShifts.length - 2} více
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

         {/* Day View */}
         {viewMode === 'day' && (
           <div className="mt-6 border-t pt-6">
             {!selectedDate && (
               <div className="text-center text-gray-500 mb-4">
                 Vyberte den v měsíčním pohledu pro zobrazení směn
               </div>
             )}
             {selectedDate && (
           <div className="mt-6 border-t pt-6">
             <div className="space-y-4">
               <div className="flex items-center justify-between mb-4">
                 <h3 className="text-lg font-semibold text-gray-800">
                  Směny pro {format(selectedDate, 'd. MMMM yyyy', { locale: cs })}
                 </h3>
                 <button
                   type="button"
                   onClick={() => setViewMode('month')}
                   className="px-3 py-1 bg-gray-200 hover:bg-gray-300 rounded-lg text-sm"
                 >
                   ← Zpět na měsíc
                 </button>
               </div>
               
               {shiftPlans
                 .filter(shift => isSameDay(new Date(shift.plannedStart), selectedDate))
                 .sort((a, b) => new Date(a.plannedStart).getTime() - new Date(b.plannedStart).getTime())
                 .map((shift, index) => (
                  <div key={shift.id} className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <h4 className="font-semibold text-gray-800">
                          {format(new Date(shift.plannedStart), 'd. MMMM')} - {format(new Date(shift.plannedEnd), 'HH:mm')}
                        </h4>
                        <p className="text-sm text-gray-600">
                          Řidič: {shift.driverName}
                        </p>
                      </div>
                      <div className="text-right">
                        <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${
                          shift.status === ShiftPlanStatus.Active ? 'bg-green-100 text-green-800' :
                          shift.status === ShiftPlanStatus.Completed ? 'bg-gray-100 text-gray-800' :
                          shift.status === ShiftPlanStatus.Cancelled ? 'bg-red-100 text-red-800' :
                          'bg-blue-100 text-blue-800'
                        }`}>
                          {shift.status === ShiftPlanStatus.Planned ? 'Plánováno' :
                           shift.status === ShiftPlanStatus.Active ? 'Aktivní' :
                           shift.status === ShiftPlanStatus.Completed ? 'Dokončeno' : 'Zrušeno'}
                        </span>
                      </div>
                    </div>
                    </div>
                  ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ShiftPlanningModal;