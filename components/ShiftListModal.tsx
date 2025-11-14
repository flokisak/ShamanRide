import React, { useState, useEffect } from 'react';
import { ShiftPlan, ShiftPlanStatus, RecurringPattern, Person } from '../types';
import { format, parseISO, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths, startOfDay, endOfDay, isWithinInterval } from 'date-fns';
import { cs } from 'date-fns/locale';
import { ShiftPlanningService } from '../services/shiftPlanningService';

interface ShiftListModalProps {
  isOpen: boolean;
  onClose: () => void;
  supabase: any;
}

const ShiftListModal: React.FC<ShiftListModalProps> = ({
  isOpen,
  onClose,
  supabase
}) => {
  const [shifts, setShifts] = useState<ShiftPlan[]>([]);
  const [availableDrivers, setAvailableDrivers] = useState<Person[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [shiftPlanningService, setShiftPlanningService] = useState<ShiftPlanningService | null>(null);

  // Filters
  const [filterType, setFilterType] = useState<'all' | 'current' | 'past'>('all');
  const [selectedDriver, setSelectedDriver] = useState<number | 'all'>('all');
  const [dateRange, setDateRange] = useState({
    start: format(new Date(), 'yyyy-MM-dd'),
    end: format(addMonths(new Date(), 1), 'yyyy-MM-dd')
  });

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
  }, [isOpen, shiftPlanningService]);

  const loadData = async () => {
    setLoading(true);
    setError('');

    try {
      const startDate = new Date(dateRange.start);
      const endDate = new Date(dateRange.end);

      const [shiftsData, driversData] = await Promise.all([
        shiftPlanningService!.getAllShiftPlans(startDate, endDate),
        shiftPlanningService!.getAvailableDrivers()
      ]);

      setShifts(shiftsData);
      setAvailableDrivers(driversData);
    } catch (err: any) {
      setError(err.message || 'Chyba při načítání dat');
    } finally {
      setLoading(false);
    }
  };

  // Filter shifts based on criteria
  const filteredShifts = shifts.filter(shift => {
    const shiftDate = new Date(shift.plannedStart);
    const now = new Date();

    // Date range filter
    const startDate = startOfDay(new Date(dateRange.start));
    const endDate = endOfDay(new Date(dateRange.end));
    if (!isWithinInterval(shiftDate, { start: startDate, end: endDate })) {
      return false;
    }

    // Driver filter
    if (selectedDriver !== 'all' && shift.driverId !== selectedDriver) {
      return false;
    }

    // Type filter
    if (filterType === 'current') {
      return shift.status === ShiftPlanStatus.Planned || shift.status === ShiftPlanStatus.Active;
    } else if (filterType === 'past') {
      return shift.status === ShiftPlanStatus.Completed || shift.status === ShiftPlanStatus.Cancelled;
    }

    return true;
  });

  // Sort shifts by date (newest first)
  const sortedShifts = filteredShifts.sort((a, b) =>
    new Date(b.plannedStart).getTime() - new Date(a.plannedStart).getTime()
  );

  const getStatusColor = (status: ShiftPlanStatus): string => {
    switch (status) {
      case ShiftPlanStatus.Planned:
        return 'bg-blue-100 text-blue-800';
      case ShiftPlanStatus.Active:
        return 'bg-green-100 text-green-800';
      case ShiftPlanStatus.Completed:
        return 'bg-gray-100 text-gray-800';
      case ShiftPlanStatus.Cancelled:
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusText = (status: ShiftPlanStatus): string => {
    switch (status) {
      case ShiftPlanStatus.Planned:
        return 'Plánováno';
      case ShiftPlanStatus.Active:
        return 'Aktivní';
      case ShiftPlanStatus.Completed:
        return 'Dokončeno';
      case ShiftPlanStatus.Cancelled:
        return 'Zrušeno';
      default:
        return 'Neznámý';
    }
  };

  const exportToCSV = () => {
    const headers = ['Datum', 'Čas začátku', 'Čas konce', 'Řidič', 'Stav', 'Poznámky'];
    const csvData = sortedShifts.map(shift => [
      format(new Date(shift.plannedStart), 'dd.MM.yyyy', { locale: cs }),
      format(new Date(shift.plannedStart), 'HH:mm'),
      format(new Date(shift.plannedEnd), 'HH:mm'),
      shift.driverName || 'Neznámý řidič',
      getStatusText(shift.status),
      shift.notes || ''
    ]);

    const csvContent = [headers, ...csvData]
      .map(row => row.map(cell => `"${cell}"`).join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `směny_${format(new Date(), 'yyyy-MM-dd')}.csv`;
    link.click();
  };

  const exportToPDF = () => {
    // For PDF export, we'll use a simple approach with window.print
    // In a real app, you'd use a library like jsPDF or react-pdf
    const printContent = `
      <html>
        <head>
          <title>Seznam směn</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background-color: #f2f2f2; }
            h1 { color: #333; }
          </style>
        </head>
        <body>
          <h1>Seznam směn - ${format(new Date(), 'dd.MM.yyyy')}</h1>
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
              ${sortedShifts.map(shift => `
                <tr>
                  <td>${format(new Date(shift.plannedStart), 'dd.MM.yyyy', { locale: cs })}</td>
                  <td>${format(new Date(shift.plannedStart), 'HH:mm')}</td>
                  <td>${format(new Date(shift.plannedEnd), 'HH:mm')}</td>
                  <td>${shift.driverName || 'Neznámý řidič'}</td>
                  <td>${getStatusText(shift.status)}</td>
                  <td>${shift.notes || ''}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </body>
      </html>
    `;

    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(printContent);
      printWindow.document.close();
      printWindow.print();
    }
  };

  const printList = () => {
    exportToPDF(); // For now, use the same PDF approach for printing
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-7xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold">Seznam směn</h2>
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

        {/* Filters */}
        <div className="p-6 border-b border-gray-200 bg-gray-50">
          <div className="flex flex-wrap gap-4 items-end">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Typ směn
              </label>
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value as 'all' | 'current' | 'past')}
                className="px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-400"
              >
                <option value="all">Všechny směny</option>
                <option value="current">Aktuální směny</option>
                <option value="past">Minulé směny</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Řidič
              </label>
              <select
                value={selectedDriver}
                onChange={(e) => setSelectedDriver(e.target.value === 'all' ? 'all' : parseInt(e.target.value))}
                className="px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-400"
              >
                <option value="all">Všichni řidiči</option>
                {availableDrivers.map(driver => (
                  <option key={driver.id} value={driver.id}>
                    {driver.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Od data
              </label>
              <input
                type="date"
                value={dateRange.start}
                onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                className="px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-400"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Do data
              </label>
              <input
                type="date"
                value={dateRange.end}
                onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                className="px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-400"
              />
            </div>

            <button
              onClick={loadData}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors"
            >
              Načíst
            </button>
          </div>
        </div>

        {/* Export Actions */}
        <div className="p-4 border-b border-gray-200 bg-white">
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-600">
              {sortedShifts.length} směn nalezeno
            </div>
            <div className="flex gap-2">
              <button
                onClick={exportToCSV}
                className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white text-sm rounded transition-colors flex items-center gap-1"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                CSV
              </button>
              <button
                onClick={exportToPDF}
                className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white text-sm rounded transition-colors flex items-center gap-1"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                PDF
              </button>
              <button
                onClick={printList}
                className="px-3 py-1 bg-gray-600 hover:bg-gray-700 text-white text-sm rounded transition-colors flex items-center gap-1"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                </svg>
                Tisk
              </button>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="overflow-auto max-h-[50vh]">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : error ? (
            <div className="p-6 text-center text-red-600">
              {error}
            </div>
          ) : sortedShifts.length === 0 ? (
            <div className="p-12 text-center">
              <svg className="w-12 h-12 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                Žádné směny nenalezeny
              </h3>
              <p className="text-gray-500">
                Zkuste upravit filtry nebo datumový rozsah.
              </p>
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Datum
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Čas
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Řidič
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Stav
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Poznámky
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {sortedShifts.map((shift) => (
                  <tr key={shift.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {format(new Date(shift.plannedStart), 'dd.MM.yyyy', { locale: cs })}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {format(new Date(shift.plannedStart), 'HH:mm')} - {format(new Date(shift.plannedEnd), 'HH:mm')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {shift.driverName || 'Neznámý řidič'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(shift.status)}`}>
                        {getStatusText(shift.status)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 max-w-xs truncate">
                      {shift.notes || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};

export default ShiftListModal;