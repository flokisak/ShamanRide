import React, { useState, useMemo } from 'react';
import { RideLog, VehicleType, RideStatus, MessagingApp, Person, Vehicle } from '../types';
import { CarIcon, ArrowUpIcon, ArrowDownIcon, TrashIcon, EditIcon, MessageIcon, CalendarIcon } from './icons';
import { useTranslation } from '../contexts/LanguageContext';

interface RideLogTableProps {
    logs: RideLog[];
    vehicles: Vehicle[];
    people: Person[];
    messagingApp: MessagingApp;
    onSort: (key: 'timestamp' | 'customerName' | 'startMileage' | 'endMileage' | 'distance' | 'rideType') => void;
    sortConfig: {
      key: 'timestamp' | 'customerName' | 'startMileage' | 'endMileage' | 'distance' | 'rideType';
      direction: 'asc' | 'desc';
    };
     onToggleSmsSent: (logId: string) => void;
     onStatusChange: (logId: string, newStatus: RideStatus) => void;
    onDelete: (logId: string) => void;
    onEdit: (logId: string) => void;
    onSendSms: (logId: string) => void;
    showCompleted: boolean;
    onToggleShowCompleted: () => void;
    dateFilter: string;
    onDateFilterChange: (date: string) => void;
  }

const SortableHeader: React.FC<{
   label: string;
   sortKey: 'timestamp' | 'customerName' | 'startMileage' | 'endMileage' | 'distance' | 'rideType';
   onSort: (key: 'timestamp' | 'customerName' | 'startMileage' | 'endMileage' | 'distance' | 'rideType') => void;
   sortConfig: RideLogTableProps['sortConfig'];
   className?: string;
 }> = ({ label, sortKey, onSort, sortConfig, className }) => {
  const { t } = useTranslation();
  const isSorted = sortConfig.key === sortKey;
  const direction = isSorted ? sortConfig.direction : null;

  return (
     <th scope="col" className={`py-1 text-left text-sm font-semibold text-gray-300 ${className}`}>
        <button
          onClick={() => onSort(sortKey)}
          className="flex items-center space-x-1 group"
          aria-label={t('rideLog.table.sortBy', { label })}
        >
          <span>{label}</span>
          <span className="opacity-50 group-hover:opacity-100 transition-opacity">
            {direction === 'asc' && <ArrowUpIcon size={14} />}
            {direction === 'desc' && <ArrowDownIcon size={14} />}
          </span>
        </button>
      </th>
  );
};


export const RideLogTable: React.FC<RideLogTableProps> = ({ logs, vehicles, people, messagingApp, onSort, sortConfig, onToggleSmsSent, onStatusChange, onDelete, onEdit, onSendSms, showCompleted, onToggleShowCompleted, dateFilter, onDateFilterChange }) => {
  const { t, language } = useTranslation();

  const [showCalendar, setShowCalendar] = useState(false);


  const getStatusSelectClass = (status: RideStatus) => {
    const base = "w-full rounded-md border-0 py-1 pl-3 pr-8 text-xs font-medium focus:ring-2 focus:ring-inset focus:ring-cyan-500 cursor-pointer transition-colors capitalize";
    switch (status) {
      case RideStatus.Scheduled:
        return `${base} bg-sky-400 text-white ring-1 ring-inset ring-sky-400 hover:bg-sky-500`;
      case RideStatus.OnTheWay:
        return `${base} bg-yellow-400 text-black ring-1 ring-inset ring-yellow-400 hover:bg-yellow-500`;
      case RideStatus.Completed:
        return `${base} bg-green-500 text-white ring-1 ring-inset ring-green-500 hover:bg-green-600`;
      case RideStatus.Cancelled:
        return `${base} bg-red-400 text-white ring-1 ring-inset ring-red-400 hover:bg-red-500`;
      default:
        return `${base} bg-gray-400 text-white ring-1 ring-inset ring-gray-400 hover:bg-gray-500`;
    }
  };
  
  const renderRoute = (stops: string[]) => {
    if (!stops || stops.length === 0) return 'N/A';
    if (stops.length === 1) return stops[0];
    if (stops.length === 2) {
      return (
        <div className="flex flex-col max-h-16 overflow-hidden" title={`${stops[0]} -> ${stops[1]}`}>
          <span className="truncate"><strong>{t('rideLog.table.from')}:</strong> {stops[0]}</span>
          <span className="truncate"><strong>{t('rideLog.table.to')}:</strong> {stops[1]}</span>
        </div>
      );
    }
    const fullRouteTooltip = stops.map((s, i) => `${i + 1}. ${s}`).join('\n');
    return (
      <div className="flex flex-col max-h-16 overflow-hidden" title={fullRouteTooltip}>
        <span className="truncate"><strong>{t('rideLog.table.from')}:</strong> {stops[0]}</span>
        <span className="truncate"><strong>{t('rideLog.table.to')}:</strong> {stops[stops.length - 1]} (+{stops.length - 2} {t('rideLog.table.stops')})</span>
      </div>
    );
  };

  // Simple calendar component
  const SimpleCalendar: React.FC<{
    selectedDate: Date | null;
    onDateSelect: (date: Date) => void;
    onClose: () => void;
  }> = ({ selectedDate, onDateSelect, onClose }) => {
    const [currentMonth, setCurrentMonth] = useState(() => {
      const now = new Date();
      return new Date(now.getFullYear(), now.getMonth(), 1);
    });

    const monthNames = [
      'Leden', 'Únor', 'Březen', 'Duben', 'Květen', 'Červen',
      'Červenec', 'Srpen', 'Září', 'Říjen', 'Listopad', 'Prosinec'
    ];

    const getDaysInMonth = (date: Date) => {
      return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    };

    const getFirstDayOfMonth = (date: Date) => {
      return new Date(date.getFullYear(), date.getMonth(), 1).getDay();
    };

    const renderCalendarDays = () => {
      const daysInMonth = getDaysInMonth(currentMonth);
      const firstDay = getFirstDayOfMonth(currentMonth);
      const days = [];

      // Empty cells for days before the first day of the month
      for (let i = 0; i < (firstDay === 0 ? 6 : firstDay - 1); i++) {
        days.push(<div key={`empty-${i}`} className="h-8 w-8"></div>);
      }

      // Days of the month
      for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
        const isSelected = selectedDate &&
          selectedDate.getDate() === day &&
          selectedDate.getMonth() === currentMonth.getMonth() &&
          selectedDate.getFullYear() === currentMonth.getFullYear();
        const isToday = new Date().toDateString() === date.toDateString();

        days.push(
          <button
            key={day}
            onClick={() => {
              onDateSelect(date);
              onClose();
            }}
            className={`h-8 w-8 text-sm rounded-full transition-colors ${
              isSelected
                ? 'bg-cyan-600 text-white'
                : isToday
                ? 'bg-cyan-500 text-white'
                : 'hover:bg-slate-600 text-gray-300'
            }`}
          >
            {day}
          </button>
        );
      }

      return days;
    };

    return (
      <div className="absolute top-full mt-2 bg-slate-800 border border-slate-600 rounded-lg p-4 z-50 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))}
            className="text-cyan-400 hover:text-cyan-300"
          >
            ‹
          </button>
          <h3 className="text-white font-medium">
            {monthNames[currentMonth.getMonth()]} {currentMonth.getFullYear()}
          </h3>
          <button
            onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))}
            className="text-cyan-400 hover:text-cyan-300"
          >
            ›
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1 mb-2">
          {['Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne'].map(day => (
            <div key={day} className="h-8 w-8 text-xs text-gray-400 flex items-center justify-center">
              {day}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {renderCalendarDays()}
        </div>

        <div className="flex justify-between mt-4">
           <button
             onClick={() => {
               onDateFilterChange('all');
               onClose();
             }}
             className="px-3 py-1 text-sm bg-slate-600 hover:bg-slate-500 text-white rounded"
           >
             Vymazat
           </button>
          <button
            onClick={onClose}
            className="px-3 py-1 text-sm bg-cyan-600 hover:bg-cyan-500 text-white rounded"
          >
            Zavřít
          </button>
        </div>
      </div>
    );
  };



  return (
    <div className="bg-slate-800 p-2 rounded-lg shadow-2xl flex flex-col h-full">
      <div className="flex-shrink-0 mb-1 border-b border-slate-700 pb-1">
        <div className="flex justify-between items-center mb-2">
          <h2 className="text-md font-semibold">{t('rideLog.title')}</h2>
          <div className="flex items-center space-x-3">
              <label htmlFor="show-inactive" className="text-sm font-medium text-gray-300 cursor-pointer">
              {t('rideLog.showInactive')}
              </label>
              <button
                  onClick={onToggleShowCompleted}
                  type="button"
                  className={`${
                  showCompleted ? 'bg-cyan-600' : 'bg-slate-600'
                  } relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-offset-2 focus:ring-offset-slate-900`}
                  role="switch"
                  aria-checked={showCompleted}
                  id="show-inactive"
              >
                  <span
                  aria-hidden="true"
                  className={`${
                      showCompleted ? 'translate-x-5' : 'translate-x-0'
                  } pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out`}
                  />
              </button>
          </div>
        </div>

        {/* Date Filter Controls */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1">
            <CalendarIcon className="text-cyan-400 w-4 h-4" />
            <span className="text-sm text-gray-300">Filtr:</span>
          </div>

          <div className="flex gap-1">
            {[
              { key: 'all', label: 'Vše' },
              { key: 'today', label: 'Dnes' },
              { key: 'week', label: 'Týden' },
              { key: 'month', label: 'Měsíc' }
             ].map(({ key, label }) => (
               <button
                 key={key}
                 onClick={() => onDateFilterChange(key)}
                 className={`px-3 py-1 text-xs rounded transition-colors ${
                   dateFilter === key
                     ? 'bg-cyan-600 text-white'
                     : 'bg-slate-700 text-gray-300 hover:bg-slate-600'
                 }`}
               >
                 {label}
               </button>
             ))}

             <div className="relative">
               <button
                 onClick={() => setShowCalendar(!showCalendar)}
                 className={`px-3 py-1 text-xs rounded transition-colors flex items-center gap-1 ${
                   dateFilter.startsWith('custom')
                     ? 'bg-cyan-600 text-white'
                     : 'bg-slate-700 text-gray-300 hover:bg-slate-600'
                 }`}
               >
                 {dateFilter.startsWith('custom')
                   ? new Date(dateFilter.split('-')[1]).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'short' })
                   : 'Vybrat datum'
                 }
                 <CalendarIcon className="w-3 h-3" />
               </button>

               {showCalendar && (
                 <SimpleCalendar
                   selectedDate={dateFilter.startsWith('custom') ? new Date(dateFilter.split('-')[1]) : null}
                   onDateSelect={(date) => {
                     onDateFilterChange(`custom-${date.toISOString().split('T')[0]}`);
                     setShowCalendar(false);
                   }}
                   onClose={() => setShowCalendar(false)}
                 />
               )}
             </div>
          </div>

          {(dateFilter !== 'all' || selectedDate) && (
            <button
              onClick={() => {
                setDateFilter('all');
                setSelectedDate(null);
              }}
              className="px-2 py-1 text-xs bg-red-600 hover:bg-red-500 text-white rounded"
              title="Vymazat filtr"
            >
              ✕
            </button>
          )}
        </div>
      </div>
      {logs.length === 0 ? (
         <p className="text-gray-400 text-center py-4">
             {dateFilter === 'all'
               ? (showCompleted ? t('rideLog.noRidesYet') : t('rideLog.noActiveRides'))
               : `Žádné jízdy pro vybraný ${dateFilter === 'custom' ? 'datum' : 'filtr'}`
             }
         </p>
      ) : (
        <div className="flex-grow overflow-y-auto -mr-2 -ml-2 pr-2 pl-2">
           <table className="min-w-full">
            <thead className="bg-slate-800 sticky top-0 z-10">
                <tr>
                 <SortableHeader label={t('rideLog.table.time')} sortKey="timestamp" onSort={onSort} sortConfig={sortConfig} className="pl-4 pr-3 sm:pl-0" />
                 <th scope="col" className="px-3 py-1 text-left text-sm font-semibold text-gray-300">{t('rideLog.table.driver')}</th>
                  <SortableHeader label={t('rideLog.table.customer')} sortKey="customerName" onSort={onSort} sortConfig={sortConfig} className="px-3" />
                  <th scope="col" className="px-3 py-1 text-left text-sm font-semibold text-gray-300">{t('rideLog.table.passengers')}</th>
                  <th scope="col" className="px-3 py-1 text-left text-sm font-semibold text-gray-300">{t('rideLog.table.route')}</th>
                 <th scope="col" className="px-3 py-1 text-left text-sm font-semibold text-gray-300">{t('rideLog.table.status')}</th>
                 <th scope="col" className="px-3 py-1 text-left text-sm font-semibold text-gray-300">{t('rideLog.table.sms')}</th>
                 <th scope="col" className="relative py-1 pl-3 pr-4 sm:pr-0 text-right text-sm font-semibold text-gray-300">{t('rideLog.table.actions')}</th>
               </tr>
            </thead>
             <tbody>
                {logs.map((log) => {
                const vehicle = vehicles.find(v => v.id === log.vehicleId);
                const driver = vehicle ? people.find(p => p.id === vehicle.driverId) : null;
                
                return (
                <tr key={log.id} className={`${log.status === RideStatus.Scheduled ? 'bg-sky-900' : ''} hover:bg-slate-700`}>
                  <td className="whitespace-nowrap py-2 pl-4 pr-3 text-sm text-gray-400 sm:pl-0">
                    {new Date(log.timestamp).toLocaleString(language, { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-sm">
                    <div className="flex items-center">
                      {log.vehicleType && (
                        <div className={`${log.vehicleType === VehicleType.Car ? 'text-gray-400' : 'text-gray-200'} mr-3 flex-shrink-0`}>
                          <CarIcon />
                        </div>
                      )}
                      <div>
                        <div className="font-medium text-white">{log.driverName || <span className="text-sky-400 italic">{t('rideLog.table.awaitingAssignment')}</span>}</div>
                        {log.vehicleName && <div className="text-gray-400 text-xs">{log.vehicleName} ({log.vehicleLicensePlate})</div>}
                      </div>
                    </div>
                  </td>
                   <td className="whitespace-nowrap px-3 py-2 text-sm text-gray-400">
                     <div className="font-medium text-white">{log.customerName}</div>
                     <div className="text-gray-400 text-xs">{log.customerPhone}</div>
                   </td>
                   <td className="whitespace-nowrap px-3 py-2 text-sm text-gray-200">{log.passengers}</td>
                   <td className="px-3 py-2 text-sm text-gray-400 max-w-xs">
                    {renderRoute(log.stops)}
                    <span className="truncate text-teal-400 text-xs"><strong>{t('rideLog.table.pickup')}:</strong> {log.pickupTime}</span>
                    {log.notes && (
                      <span className="truncate text-yellow-300 text-xs" title={log.notes}>
                        <strong>{t('rideLog.table.note')}:</strong> {log.notes}
                      </span>
                    )}
                  </td>
                   <td className="whitespace-nowrap px-3 py-2 text-sm text-gray-400">
                     <select
                        value={log.status}
                        onChange={(e) => onStatusChange(log.id, e.target.value as RideStatus)}
                        className={getStatusSelectClass(log.status)}
                        aria-label={t('rideLog.table.changeStatusFor', { customerName: log.customerName })}
                    >
                        {Object.values(RideStatus).map(status => (
                            <option key={status} value={status} className="bg-slate-800 text-white">
                                {t(`rideStatus.${status}`)}
                            </option>
                        ))}
                    </select>
                  </td>
                   <td className="whitespace-nowrap px-3 py-2 text-sm">
                     <input
                       type="checkbox"
                       checked={log.smsSent}
                       onChange={() => onToggleSmsSent(log.id)}
                       className="h-5 w-5 rounded bg-slate-700 border-slate-600 text-cyan-500 focus:ring-cyan-600 focus:ring-offset-slate-800 cursor-pointer"
                       aria-label={t('rideLog.table.markSmsSentFor', { customerName: log.customerName })}
                     />
                   </td>
                    <td className="relative whitespace-nowrap py-2 pl-3 pr-4 text-right text-sm font-medium sm:pr-0">
                      <div className="flex items-center justify-end space-x-1">
                        <button
                          onClick={() => onEdit(log.id)}
                          className="text-gray-500 hover:text-blue-500 transition-colors p-2 -m-2 rounded-full"
                          aria-label={t('rideLog.table.editRideFor', { customerName: log.customerName })}
                        >
                          <EditIcon size={18} />
                        </button>
                        <button
                          onClick={() => onSendSms(log.id)}
                          className="text-gray-500 hover:text-green-500 transition-colors p-2 -m-2 rounded-full"
                          aria-label={t('rideLog.table.sendSmsFor', { customerName: log.customerName })}
                        >
                          <MessageIcon size={18} />
                        </button>
                        <button
                          onClick={() => onDelete(log.id)}
                          className="text-gray-500 hover:text-red-500 transition-colors p-2 -m-2 rounded-full"
                          aria-label={t('rideLog.table.deleteRideFor', { customerName: log.customerName })}
                        >
                          <TrashIcon size={18} />
                        </button>
                      </div>
                    </td>
                </tr>
              )})}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};