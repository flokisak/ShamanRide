import React, { useState, useEffect } from 'react';
import { ShiftPlan, ShiftPlanStatus, RecurringPattern, Person } from '../types';
import { format, parseISO, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths, startOfWeek, endOfWeek } from 'date-fns';
import { cs } from 'date-fns/locale';
import { ShiftPlanningService } from '../services/shiftPlanningService';
import { useTranslation } from '../contexts/LanguageContext';

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedDriverFilter, setSelectedDriverFilter] = useState<number | 'all'>('all');
  const [shiftPlanningService, setShiftPlanningService] = useState<ShiftPlanningService | null>(null);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [viewMode, setViewMode] = useState<'month' | 'day' | 'list'>('month');
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingShift, setEditingShift] = useState<ShiftPlan | undefined>(undefined);
  const { t } = useTranslation();

  // Initialize service
  useEffect(() => {
    if (supabase) {
      const service = new ShiftPlanningService(supabase);
      setShiftPlanningService(service);
    }
  }, [supabase]);

  // Reset view when modal opens
  useEffect(() => {
    if (isOpen) {
      setViewMode('month');
      setSelectedDate(undefined);
    }
  }, [isOpen]);

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

  const getFilteredShifts = (): ShiftPlan[] => {
    let filtered = selectedDriverFilter === 'all'
      ? shiftPlans
      : shiftPlans.filter(shift => shift.driverId === selectedDriverFilter);

    // Sort by plannedStart in descending order (latest shifts first)
    return filtered.sort((a, b) => new Date(b.plannedStart).getTime() - new Date(a.plannedStart).getTime());
  };

  const getShiftsForDate = (date: Date): ShiftPlan[] => {
    const filteredShifts = getFilteredShifts();
    return filteredShifts.filter(shift =>
      isSameDay(new Date(shift.plannedStart), date)
    );
  };

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
        return 'bg-gray-500';
    }
  };

  const exportToCSV = () => {
    const filteredShifts = getFilteredShifts();
    const headers = ['Datum', 'Čas začátku', 'Čas konce', 'Řidič', 'Stav', 'Poznámky'];
    const csvData = filteredShifts.map(shift => [
      format(new Date(shift.plannedStart), 'dd.MM.yyyy', { locale: cs }),
      format(new Date(shift.plannedStart), 'HH:mm', { locale: cs }),
      format(new Date(shift.plannedEnd), 'HH:mm', { locale: cs }),
      availableDrivers.find(d => d.id === shift.driverId)?.name || `Řidič ${shift.driverId}`,
      shift.status === ShiftPlanStatus.Planned ? 'Plánováno' :
      shift.status === ShiftPlanStatus.Active ? 'Aktivní' :
      shift.status === ShiftPlanStatus.Completed ? 'Dokončeno' : 'Zrušeno',
      shift.notes || ''
    ]);

    const csvContent = [headers, ...csvData]
      .map(row => row.map(cell => `"${cell}"`).join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `směny-${format(currentMonth, 'MM-yyyy', { locale: cs })}.csv`;
    link.click();
  };

  const exportToPDF = async () => {
    try {
      const filteredShifts = getFilteredShifts();
      // For PDF export, we'll use a simple approach with html2canvas + jsPDF
      // First, create a temporary table with the shift data
      const printWindow = window.open('', '_blank');
      if (!printWindow) return;

      const tableHtml = `
        <html>
          <head>
            <title>Plánování směn - ${format(currentMonth, 'MMMM yyyy', { locale: cs })}</title>
            <style>
              body { font-family: Arial, sans-serif; margin: 20px; }
              table { width: 100%; border-collapse: collapse; }
              th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
              th { background-color: #f2f2f2; }
              .status-planned { background-color: #dbeafe; }
              .status-active { background-color: #dcfce7; }
              .status-completed { background-color: #f3f4f6; }
              .status-cancelled { background-color: #fee2e2; }
            </style>
          </head>
          <body>
            <h1>Plánování směn - ${format(currentMonth, 'MMMM yyyy', { locale: cs })}</h1>
            <table>
              <thead>
                <tr>
                  <th>Datum</th>
                  <th>Čas začátku</th>
                  <th>Čas konce</th>
                  <th>Řidič</th>
                  <th>Stav</th>
                  <th>Poznámky</th>
                </tr>
              </thead>
              <tbody>
                ${filteredShifts.map(shift => `
                  <tr class="status-${shift.status.toLowerCase()}">
                    <td>${format(new Date(shift.plannedStart), 'dd.MM.yyyy', { locale: cs })}</td>
                    <td>${format(new Date(shift.plannedStart), 'HH:mm', { locale: cs })}</td>
                    <td>${format(new Date(shift.plannedEnd), 'HH:mm', { locale: cs })}</td>
                    <td>${availableDrivers.find(d => d.id === shift.driverId)?.name || `Řidič ${shift.driverId}`}</td>
                    <td>${shift.status === ShiftPlanStatus.Planned ? 'Plánováno' :
                          shift.status === ShiftPlanStatus.Active ? 'Aktivní' :
                          shift.status === ShiftPlanStatus.Completed ? 'Dokončeno' : 'Zrušeno'}</td>
                    <td>${shift.notes || ''}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </body>
        </html>
      `;

      printWindow.document.write(tableHtml);
      printWindow.document.close();

      // Wait for content to load, then print (which will show print dialog with save as PDF option)
      setTimeout(() => {
        printWindow.print();
        printWindow.close();
      }, 500);

    } catch (error) {
      console.error('Error exporting to PDF:', error);
      alert('Chyba při exportu do PDF');
    }
  };

  const previousMonth = () => setCurrentMonth(subMonths(currentMonth, 1));
  const nextMonth = () => setCurrentMonth(addMonths(currentMonth, 1));

  const handleShiftClick = (shift: ShiftPlan) => {
    setEditingShift(shift);
    setShowCreateModal(true);
  };

  const handleCreateShift = () => {
    setEditingShift(undefined);
    setShowCreateModal(true);
  };

  const handleSaveShift = async (shiftPlan: Omit<ShiftPlan, 'id' | 'createdAt' | 'updatedAt'>) => {
    if (!shiftPlanningService) return;

    try {
      if (shiftPlan.recurringPattern && shiftPlan.recurringPattern !== RecurringPattern.None && shiftPlan.recurringEndDate) {
        await shiftPlanningService.createRecurringShiftPlans(
          shiftPlan,
          shiftPlan.recurringPattern,
          shiftPlan.recurringEndDate
        );
      } else {
        await shiftPlanningService.createShiftPlan(shiftPlan);
      }

      setShowCreateModal(false);
      await loadData();
    } catch (error: any) {
      setError(error.message || 'Chyba při ukládání směny');
      throw error;
    }
  };

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
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1, locale: cs });
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1, locale: cs });
  const monthDays = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex justify-center items-start pt-8 p-4 animate-fade-in overflow-y-auto">
      <div className="bg-slate-800 rounded-lg shadow-2xl w-full max-w-6xl max-h-[90vh] overflow-hidden animate-slide-in">
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b border-slate-700">
          <h2 className="text-xl font-semibold text-white">Plánování směn řidičů</h2>
          <div className="flex items-center space-x-2">
            <button
              onClick={exportToCSV}
              className="flex items-center space-x-2 px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors text-sm"
              title="Exportovat do CSV"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span>CSV</span>
            </button>
            <button
              onClick={exportToPDF}
              className="flex items-center space-x-2 px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors text-sm"
              title="Exportovat do PDF"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span>PDF</span>
            </button>
            <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
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
        <div className="p-6 border-b border-slate-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              {viewMode === 'month' ? (
                <>
                  <button
                    onClick={previousMonth}
                    className="p-2 hover:bg-slate-700 rounded-lg transition-colors"
                  >
                    <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>

                  <h3 className="text-lg font-semibold text-white">
                    {format(currentMonth, 'MMMM yyyy', { locale: cs })}
                  </h3>

                  <button
                    onClick={nextMonth}
                    className="p-2 hover:bg-slate-700 rounded-lg transition-colors"
                  >
                    <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                </>
              ) : (
                <div className="flex items-center gap-4">
                  <button
                    onClick={() => setViewMode('month')}
                    className="p-2 hover:bg-slate-700 rounded-lg transition-colors"
                  >
                    <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>

                  <h3 className="text-lg font-semibold text-white">
                    {selectedDate ? format(selectedDate, 'd. MMMM yyyy', { locale: cs }) : 'Vyberte den'}
                  </h3>
                </div>
              )}
            </div>

            <div className="flex items-center gap-3">
              {/* View Mode Toggle */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setViewMode('month')}
                  className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                    viewMode === 'month'
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-600 text-gray-300 hover:bg-slate-500'
                  }`}
                >
                  📅 Měsíc
                </button>
                <button
                  onClick={() => setViewMode('day')}
                  disabled={!selectedDate}
                  className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                    viewMode === 'day'
                      ? 'bg-blue-600 text-white'
                      : selectedDate
                      ? 'bg-slate-600 text-gray-300 hover:bg-slate-500'
                      : 'bg-slate-700 text-gray-500 cursor-not-allowed'
                  }`}
                >
                  📅 Den
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                    viewMode === 'list'
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-600 text-gray-300 hover:bg-slate-500'
                  }`}
                >
                  📋 Seznam
                </button>
               </div>

              {/* Driver Filter */}
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-300">Řidič:</label>
                <select
                  value={selectedDriverFilter}
                  onChange={(e) => setSelectedDriverFilter(e.target.value === 'all' ? 'all' : parseInt(e.target.value))}
                  className="px-3 py-1 bg-slate-600 border border-slate-500 rounded-lg text-white text-sm focus:ring-2 focus:ring-blue-400"
                >
                  <option value="all">Všichni řidiči</option>
                  {availableDrivers.map(driver => (
                    <option key={driver.id} value={driver.id}>
                      {driver.name}
                    </option>
                  ))}
                </select>
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
        </div>

        {/* Content */}
        <div className="p-6 overflow-auto max-h-[60vh]">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : viewMode === 'month' ? (
            /* Month View */
            <div className="grid grid-cols-7 gap-2">
              {/* Weekday Headers */}
              {['Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne'].map(day => (
                <div key={day} className="text-center text-sm font-medium text-slate-300 py-2">
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
                      className={`relative p-2 h-24 border rounded-lg cursor-pointer transition-all ${
                        isSelected ? 'bg-slate-600 border-slate-500' : 'border-slate-600'
                      } ${isToday ? 'ring-2 ring-blue-500' : ''} ${
                        shifts.length > 0 ? 'bg-slate-700' : 'bg-slate-800'
                      } hover:bg-slate-700`}
                    >
                      <div className={`text-sm font-medium mb-1 text-white ${
                        !isSameMonth(day, currentMonth) ? 'text-slate-500' : ''
                      }`}>
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
                          className={`text-xs text-white px-1 py-0.5 rounded truncate hover:opacity-80 cursor-pointer ${getStatusColor(shift.status)}`}
                        >
                          {shift.driverName} ({format(new Date(shift.plannedStart), 'HH:mm')})
                        </div>
                      ))}

                      {shifts.length > 2 && (
                        <div className="text-xs text-slate-400 text-center">
                          +{shifts.length - 2} více
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
           ) : viewMode === 'list' ? (
             /* List View */
             <div className="space-y-4">
               <div className="flex items-center justify-between mb-6">
                 <h3 className="text-xl font-semibold text-white">
                   Všechny směny
                 </h3>
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

                {getFilteredShifts().length > 0 ? (
                 <div className="space-y-2">
                   {/* Header */}
                   <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-slate-800 rounded-lg text-xs font-medium text-slate-300 border-b border-slate-700">
                     <div className="col-span-3">Řidič</div>
                     <div className="col-span-2">Začátek</div>
                     <div className="col-span-2">Konec</div>
                     <div className="col-span-2">Stav</div>
                     <div className="col-span-3">Akce</div>
                   </div>

                   {/* Shifts */}
                    {getFilteredShifts().map((shift) => (
                     <div
                       key={shift.id}
                       className="grid grid-cols-12 gap-2 px-3 py-3 bg-slate-800/50 rounded-lg border border-slate-700 hover:bg-slate-800/70 transition-colors"
                     >
                       {/* Driver */}
                       <div className="col-span-3">
                         <div className="font-medium text-white text-sm">{shift.driverName}</div>
                         {shift.notes && <div className="text-xs text-slate-400 truncate">{shift.notes}</div>}
                       </div>

                       {/* Start Time */}
                       <div className="col-span-2">
                         <div className="text-xs text-slate-300">
                           {format(new Date(shift.plannedStart), 'd.M. HH:mm', { locale: cs })}
                         </div>
                         <div className="text-xs text-slate-400">
                           {format(new Date(shift.plannedStart), 'yyyy', { locale: cs })}
                         </div>
                       </div>

                       {/* End Time */}
                       <div className="col-span-2">
                         <div className="text-xs text-slate-300">
                           {format(new Date(shift.plannedEnd), 'd.M. HH:mm', { locale: cs })}
                         </div>
                         <div className="text-xs text-slate-400">
                           {format(new Date(shift.plannedEnd), 'yyyy', { locale: cs })}
                         </div>
                       </div>

                       {/* Status */}
                       <div className="col-span-2">
                         <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                           shift.status === ShiftPlanStatus.Planned ? 'bg-blue-900/50 text-blue-300 border border-blue-700/50' :
                           shift.status === ShiftPlanStatus.Active ? 'bg-green-900/50 text-green-300 border border-green-700/50' :
                           shift.status === ShiftPlanStatus.Completed ? 'bg-gray-900/50 text-gray-300 border border-gray-700/50' :
                           'bg-red-900/50 text-red-300 border border-red-700/50'
                         }`}>
                           {shift.status === ShiftPlanStatus.Planned ? 'Plánováno' :
                            shift.status === ShiftPlanStatus.Active ? 'Aktivní' :
                            shift.status === ShiftPlanStatus.Completed ? 'Dokončeno' :
                            'Zrušeno'}
                         </span>
                       </div>

                       {/* Actions */}
                       <div className="col-span-3 flex items-center gap-1">
                         <button
                           onClick={() => handleShiftClick(shift)}
                           className="px-2 py-1 text-gray-400 hover:text-blue-400 hover:bg-slate-600 rounded text-xs transition-colors"
                           title="Upravit směnu"
                         >
                           ✏️
                         </button>
                         <button
                           onClick={() => {
                             if (confirm('Opravdu chcete smazat tuto směnu?')) {
                               handleDeleteShift(shift.id);
                             }
                           }}
                           className="px-2 py-1 text-gray-400 hover:text-red-400 hover:bg-slate-600 rounded text-xs transition-colors"
                           title="Smazat směnu"
                         >
                           🗑️
                         </button>
                       </div>
                     </div>
                   ))}
                 </div>
               ) : (
                 <div className="text-center py-12">
                   <svg className="w-12 h-12 text-gray-500 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                     <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                   </svg>
                   <h3 className="text-lg font-medium text-white mb-2">
                     Žádné směny
                   </h3>
                   <p className="text-gray-400 mb-6">
                     Zatím nejsou naplánované žádné směny.
                   </p>
                   <button
                     onClick={handleCreateShift}
                     className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors inline-flex items-center gap-2"
                   >
                     <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                       <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                     </svg>
                     Vytvořit směnu
                   </button>
                 </div>
               )}
             </div>
           ) : (
             /* Day View */
             <div className="space-y-4">
               {selectedDate ? (
                 <div>
                   <div className="flex items-center justify-between mb-6">
                     <h3 className="text-xl font-semibold text-white">
                       Směny pro {format(selectedDate, 'd. MMMM yyyy', { locale: cs })}
                     </h3>
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

                   {getShiftsForDate(selectedDate).length > 0 ? (
                  <div className="space-y-3">
                    {getShiftsForDate(selectedDate).map((shift) => (
                      <div key={shift.id} className="bg-slate-700 rounded-lg p-4 border border-slate-600">
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              <h4 className="text-lg font-medium text-white">
                                {shift.driverName}
                              </h4>
                              <span className={`px-2 py-1 text-xs rounded-full border ${
                                shift.status === ShiftPlanStatus.Planned ? 'bg-blue-900/50 text-blue-300 border-blue-700/50' :
                                shift.status === ShiftPlanStatus.Active ? 'bg-green-900/50 text-green-300 border-green-700/50' :
                                shift.status === ShiftPlanStatus.Completed ? 'bg-gray-900/50 text-gray-300 border-gray-700/50' :
                                'bg-red-900/50 text-red-300 border-red-700/50'
                              }`}>
                                {shift.status === ShiftPlanStatus.Planned ? 'Plánováno' :
                                 shift.status === ShiftPlanStatus.Active ? 'Aktivní' :
                                 shift.status === ShiftPlanStatus.Completed ? 'Dokončeno' :
                                 'Zrušeno'}
                              </span>
                            </div>

                            <div className="text-slate-300 text-sm space-y-1">
                              <div>
                                <span className="font-medium">Začátek:</span> {format(new Date(shift.plannedStart), 'd. MMMM yyyy HH:mm', { locale: cs })}
                              </div>
                              <div>
                                <span className="font-medium">Konec:</span> {format(new Date(shift.plannedEnd), 'd. MMMM yyyy HH:mm', { locale: cs })}
                              </div>
                              {shift.notes && (
                                <div>
                                  <span className="font-medium">Poznámky:</span> {shift.notes}
                                </div>
                              )}
                            </div>
                          </div>

                             <div className="flex items-center gap-2 ml-4">
                               <button
                                 onClick={() => handleShiftClick(shift)}
                                 className="p-2 text-gray-400 hover:text-blue-400 hover:bg-slate-600 rounded-lg transition-colors"
                                 title="Upravit směnu"
                               >
                                 <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                 </svg>
                               </button>

                               <button
                                 onClick={() => {
                                   if (confirm('Opravdu chcete smazat tuto směnu?')) {
                                     handleDeleteShift(shift.id);
                                   }
                                 }}
                                 className="p-2 text-gray-400 hover:text-red-400 hover:bg-slate-600 rounded-lg transition-colors"
                                 title="Smazat směnu"
                               >
                                 <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                 </svg>
                               </button>
                             </div>
                           </div>
                         </div>
                       ))}
                     </div>
                   ) : (
                     <div className="text-center py-12">
                       <svg className="w-12 h-12 text-gray-500 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                         <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                       </svg>
                       <h3 className="text-lg font-medium text-white mb-2">
                         Žádné směny pro tento den
                       </h3>
                       <p className="text-gray-400 mb-6">
                         Pro tento den nejsou naplánované žádné směny.
                       </p>
                       <button
                         onClick={handleCreateShift}
                         className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors inline-flex items-center gap-2"
                       >
                         <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                           <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                         </svg>
                         Vytvořit směnu
                       </button>
                     </div>
                   )}
                 </div>
               ) : (
                 <div className="text-center py-12">
                   <svg className="w-12 h-12 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                     <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                   </svg>
                   <h3 className="text-lg font-medium text-white mb-2">
                     Vyberte den
                   </h3>
                   <p className="text-gray-400">
                     Klikněte na den v měsíčním pohledu pro zobrazení detailů.
                   </p>
                 </div>
               )}
             </div>
           )}
        </div>

        {/* Legend - only show in month view */}
        {viewMode === 'month' && shiftPlans.length > 0 && (
          <div className="p-4 border-t border-slate-700 bg-slate-800">
            <div className="flex flex-wrap gap-6 text-sm">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-blue-500" />
                <span className="text-gray-300">Plánováno</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-green-500" />
                <span className="text-gray-300">Aktivní</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-gray-500" />
                <span className="text-gray-300">Dokončeno</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-red-500" />
                <span className="text-gray-300">Zrušeno</span>
              </div>
            </div>
          </div>
        )}
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
}

const ShiftCreateEditModal: React.FC<ShiftCreateEditModalProps> = ({
  isOpen,
  onClose,
  onSave,
  onUpdate,
  onDelete,
  editingShift,
  availableDrivers,
  isDispatcher
}) => {
  const [formData, setFormData] = useState({
    driverId: 0,
    plannedStart: '',
    plannedEnd: '',
    status: ShiftPlanStatus.Planned,
    notes: '',
    recurringPattern: RecurringPattern.None,
    recurringEndDate: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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
      const startDate = new Date(formData.plannedStart);
      const endDate = new Date(formData.plannedEnd);

      if (startDate >= endDate) {
        setError('Konec směny musí být po začátku směny');
        return;
      }

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
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 rounded-xl shadow-2xl p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto border border-slate-700">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-white">
            {editingShift ? 'Upravit směnu' : 'Naplánovat směnu'}
          </h2>

          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-700 rounded-lg text-gray-400 hover:text-white transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {error && (
          <div className="bg-red-900/50 border border-red-700 text-red-300 px-3 py-2 rounded-lg mb-4 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {isDispatcher && (
            <div>
              <label className="block text-slate-300 text-sm font-medium mb-1">
                Řidič
              </label>
              <select
                name="driverId"
                value={formData.driverId}
                onChange={handleInputChange}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              >
                <option value={0} disabled>Vyberte řidiče...</option>
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
             <label className="block text-slate-300 text-sm font-medium mb-2">
               {t('shiftPlanning.fastOptions')}
             </label>
             <div className="flex gap-2">
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

           <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-300 text-sm font-medium mb-1">
                Začátek
              </label>
              <input
                type="datetime-local"
                name="plannedStart"
                value={formData.plannedStart}
                onChange={handleInputChange}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
            <div>
              <label className="block text-slate-300 text-sm font-medium mb-1">
                Konec
              </label>
              <input
                type="datetime-local"
                name="plannedEnd"
                value={formData.plannedEnd}
                onChange={handleInputChange}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-300 text-sm font-medium mb-1">
                Stav
              </label>
              <select
                name="status"
                value={formData.status}
                onChange={handleInputChange}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value={ShiftPlanStatus.Planned}>Plánováno</option>
                <option value={ShiftPlanStatus.Active}>Aktivní</option>
                <option value={ShiftPlanStatus.Completed}>Dokončeno</option>
                <option value={ShiftPlanStatus.Cancelled}>Zrušeno</option>
              </select>
            </div>
            <div>
              <label className="block text-slate-300 text-sm font-medium mb-1">
                Opakování
              </label>
              <select
                name="recurringPattern"
                value={formData.recurringPattern}
                onChange={handleInputChange}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value={RecurringPattern.None}>Bez opakování</option>
                <option value={RecurringPattern.Daily}>Denně</option>
                <option value={RecurringPattern.Weekly}>Týdně</option>
                <option value={RecurringPattern.Monthly}>Měsíčně</option>
              </select>
            </div>
          </div>

          {formData.recurringPattern !== RecurringPattern.None && (
            <div>
              <label className="block text-slate-300 text-sm font-medium mb-1">
                Konec opakování
              </label>
              <input
                type="date"
                name="recurringEndDate"
                value={formData.recurringEndDate}
                onChange={handleInputChange}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
          )}

          <div>
            <label className="block text-slate-300 text-sm font-medium mb-1">
              Poznámky
            </label>
            <textarea
              name="notes"
              value={formData.notes}
              onChange={handleInputChange}
              rows={3}
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              placeholder="Volitelné poznámky..."
            />
          </div>

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
                className="flex-1 px-4 py-2 bg-slate-600 hover:bg-slate-500 text-white rounded-lg transition-colors"
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
      </div>
    </div>
  );
};

export default ShiftPlanningModal;