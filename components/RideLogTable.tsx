import React, { useState, useMemo } from 'react';
import { RideLog, VehicleType, RideStatus, MessagingApp, Person, Vehicle } from '../types';
import { CarIcon, TrashIcon, EditIcon, MessageIcon, CalendarIcon, CopyIcon } from './icons';
import { useTranslation } from '../contexts/LanguageContext';

interface RideLogTableProps {
    logs: RideLog[];
    vehicles: Vehicle[];
    people: Person[];
    messagingApp: MessagingApp;
     onStatusChange: (logId: string, newStatus: RideStatus) => void;
    onDelete: (logId: string) => void;
    onEdit: (logId: string) => void;
    onDuplicate: (log: RideLog) => void;
    onSendSms: (logId: string) => void;
    onResendRide?: (logId: string) => void;
    onSendToDriver?: (logId: string) => void;
    showCompleted: boolean;
    onToggleShowCompleted: () => void;
    dateFilter: string;
    onDateFilterChange: (date: string) => void;
    timeFilter: 'all' | 'morning' | 'afternoon' | 'evening' | 'night';
    onTimeFilterChange: (time: 'all' | 'morning' | 'afternoon' | 'evening' | 'night') => void;
    hasNewRides?: boolean;
    onMarkRidesViewed?: () => void;
  }




export const RideLogTable: React.FC<RideLogTableProps> = ({ logs, vehicles, people, messagingApp, onStatusChange, onDelete, onEdit, onDuplicate, onSendSms, onResendRide, onSendToDriver, showCompleted, onToggleShowCompleted, dateFilter, onDateFilterChange, timeFilter, onTimeFilterChange, hasNewRides, onMarkRidesViewed }) => {
  const { t, language } = useTranslation();

  const [showCalendar, setShowCalendar] = useState(false);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const selectedDate = dateFilter.startsWith('custom') ? new Date(dateFilter.split('-')[1]) : null;

  // Mark rides as viewed when component mounts
  React.useEffect(() => {
    if (hasNewRides && onMarkRidesViewed) {
      onMarkRidesViewed();
    }
  }, [hasNewRides, onMarkRidesViewed]);

  // Close menu when clicking outside
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuOpen && !(event.target as Element).closest('.actions-menu')) {
        setMenuOpen(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpen]);


  const getStatusSelectClass = (status: RideStatus) => {
    const base = "w-full rounded-md border-0 py-1 pl-3 pr-8 text-xs font-medium focus:ring-2 focus:ring-inset focus:ring-cyan-500 cursor-pointer transition-colors capitalize";
    switch (status) {
      case RideStatus.Scheduled:
        return `${base} bg-sky-400 text-white ring-1 ring-inset ring-sky-400 hover:bg-sky-500`;
      case RideStatus.Pending:
        return `${base} bg-orange-400 text-white ring-1 ring-inset ring-orange-400 hover:bg-orange-500`;
      case RideStatus.Queued:
        return `${base} bg-purple-400 text-white ring-1 ring-inset ring-purple-400 hover:bg-purple-500`;
      case RideStatus.Accepted:
        return `${base} bg-blue-400 text-white ring-1 ring-inset ring-blue-400 hover:bg-blue-500`;
      case RideStatus.InProgress:
        return `${base} bg-yellow-400 text-black ring-1 ring-inset ring-yellow-400 hover:bg-yellow-500`;
      case RideStatus.Completed:
        return `${base} bg-green-500 text-white ring-1 ring-inset ring-green-500 hover:bg-green-600`;
      case RideStatus.Cancelled:
        return `${base} bg-red-400 text-white ring-1 ring-inset ring-red-400 hover:bg-red-500`;
      default:
        return `${base} bg-gray-400 text-white ring-1 ring-inset ring-gray-400 hover:bg-gray-500`;
    }
  };
  
  const renderRoute = (stops: string[], notes?: string) => {
    // Strip placeIds from addresses for display
    const cleanStops = stops?.map(stop => stop.split('|')[0]?.trim() || stop) || [];

    const routeText = (() => {
      if (!cleanStops || cleanStops.length === 0) return 'N/A';
      if (cleanStops.length === 1) return cleanStops[0];
      if (cleanStops.length === 2) return `${cleanStops[0]} -> ${cleanStops[1]}`;
      return `${cleanStops[0]} -> ${cleanStops[cleanStops.length - 1]} (+${cleanStops.length - 2} ${t('rideLog.table.stops')})`;
    })();

    const fullRouteTooltip = cleanStops && cleanStops.length > 0 ? cleanStops.map((s, i) => `${i + 1}. ${s}`).join('\n') : '';

    return (
      <div className="flex flex-col max-h-16 overflow-hidden" title={fullRouteTooltip}>
        <span className="truncate text-white">{routeText}</span>
        {notes && <span className="truncate text-gray-400 text-xs">{notes}</span>}
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
    <div className={`p-2 rounded-lg shadow-2xl flex flex-col h-full ${hasNewRides ? 'bg-slate-800 border border-blue-400/30' : 'bg-slate-800'}`}>
      <div className="flex-shrink-0 mb-1 border-b border-slate-700 pb-1">
        <div className="flex justify-between items-center mb-2">
           <h2 className="text-md font-semibold flex items-center gap-2">
             {t('rideLog.title')}
             {hasNewRides && (
               <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
             )}
           </h2>
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

        {/* Date and Time Filter Controls */}
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
                 {selectedDate
                   ? selectedDate.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'short' })
                   : 'Vybrat datum'
                 }
                 <CalendarIcon className="w-3 h-3" />
               </button>

               {showCalendar && (
                 <SimpleCalendar
                   selectedDate={selectedDate}
                   onDateSelect={(date) => {
                     onDateFilterChange(`custom-${date.toISOString().split('T')[0]}`);
                     setShowCalendar(false);
                   }}
                   onClose={() => setShowCalendar(false)}
                 />
               )}
             </div>
           </div>

           <div className="flex gap-1">
             {[
               { key: 'all' as const, label: 'Vše' },
               { key: 'morning' as const, label: 'Ráno (6-12)' },
               { key: 'afternoon' as const, label: 'Odpo (12-18)' },
               { key: 'evening' as const, label: 'Večer (18-24)' },
               { key: 'night' as const, label: 'Noc (0-6)' }
             ].map(({ key, label }) => (
               <button
                 key={key}
                 onClick={() => onTimeFilterChange(key)}
                 className={`px-3 py-1 text-xs rounded transition-colors ${
                   timeFilter === key
                     ? 'bg-cyan-600 text-white'
                     : 'bg-slate-700 text-gray-300 hover:bg-slate-600'
                 }`}
               >
                 {label}
               </button>
             ))}
           </div>

           {(dateFilter !== 'all' || timeFilter !== 'all') && (
             <button
               onClick={() => {
                 onDateFilterChange('all');
                 onTimeFilterChange('all');
               }}
               className="px-2 py-1 text-xs bg-red-600 hover:bg-red-500 text-white rounded"
             >
               Vymazat filtr
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
         <div className="flex-1 overflow-y-auto">
           <div className="p-2">
             {/* Header */}
             <div className="grid grid-cols-13 gap-2 mb-2 px-3 py-2 bg-slate-800 rounded-lg text-xs font-medium text-slate-300 border-b border-slate-700">
               <div className="col-span-2">{t('rideLog.table.customer')}</div>
               <div className="col-span-2">{t('rideLog.table.route')}</div>
               <div className="col-span-2">{t('rideLog.table.driver')}</div>
               <div className="col-span-2">{t('rideLog.table.time')}</div>
               <div className="col-span-1">{t('rideLog.table.price')}</div>
               <div className="col-span-1">{t('rideLog.table.payment')}</div>
               <div className="col-span-2">{t('rideLog.table.status')}</div>
               <div className="col-span-1">{t('rideLog.table.actions')}</div>
             </div>

             {/* Rides rows */}
             <div className="space-y-1">
               {logs.map((log) => {
                 const vehicle = vehicles.find(v => v.id === log.vehicleId);
                 const driver = vehicle ? people.find(p => p.id === vehicle.driverId) : null;

                 return (
                   <div
                     key={log.id}
                     className={`grid grid-cols-13 gap-2 px-3 py-3 bg-slate-800/50 rounded-lg border border-slate-700 hover:bg-slate-800/70 transition-colors ${log.status === RideStatus.Scheduled ? 'bg-sky-900/50' : ''}`}
                   >
                     {/* Customer */}
                     <div className="col-span-2">
                       <div className="font-medium text-white text-sm">{log.customerName}</div>
                       <div className="text-xs text-slate-400">{log.customerPhone}</div>
                       <div className="text-xs text-slate-500">{log.passengers} pax</div>
                     </div>

                     {/* Route */}
                     <div className="col-span-2">
                       {renderRoute(log.stops, log.notes)}
                     </div>

                     {/* Driver/Vehicle */}
                     <div className="col-span-2">
                       <div className="flex items-center">
                         {log.vehicleType && (
                           <div className={`${log.vehicleType === VehicleType.Car ? 'text-gray-400' : 'text-gray-200'} mr-2 flex-shrink-0`}>
                             <CarIcon />
                           </div>
                         )}
                         <div>
                           <div className="text-xs text-slate-300">{log.driverName || <span className="text-sky-400 italic">{t('rideLog.table.awaitingAssignment')}</span>}</div>
                           {log.vehicleName && <div className="text-xs text-slate-400">{log.vehicleName}</div>}
                         </div>
                       </div>
                     </div>

                     {/* Time */}
                     <div className="col-span-2">
                       <div className="text-xs text-slate-300">{new Date(log.timestamp).toLocaleString(language, { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
                       <div className="text-xs text-slate-400">
                         {log.pickupTime === 'ihned' ? t('dispatch.immediate') : log.pickupTime ? new Date(log.pickupTime).toLocaleString(language, { hour: '2-digit', minute: '2-digit' }) : '-'}
                       </div>
                     </div>

                     {/* Price */}
                     <div className="col-span-1">
                       <div className="text-sm font-medium text-green-400">
                         {log.estimatedPrice ? `${log.estimatedPrice} Kč` : '-'}
                       </div>
                     </div>

                     {/* Payment Method */}
                     <div className="col-span-1">
                       {log.payment ? (
                         <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                           log.payment === 'cash'
                             ? 'bg-green-900/50 text-green-300 border border-green-700/50'
                             : 'bg-blue-900/50 text-blue-300 border border-blue-700/50'
                         }`}>
                           {log.payment === 'cash' ? '💵 Hotovost' : '💳 Karta'}
                         </span>
                       ) : (
                         <span className="text-xs text-slate-500">-</span>
                       )}
                     </div>

                     {/* Status */}
                     <div className="col-span-2">
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
                     </div>

                         {/* Actions Menu */}
                         <div className="col-span-1 relative actions-menu">
                          <button
                            onClick={() => setMenuOpen(menuOpen === log.id ? null : log.id)}
                            className="px-2 py-1 text-white hover:text-gray-300 transition-colors rounded text-xs"
                            aria-label="Actions menu"
                            title="Actions"
                          >
                            ⋮
                          </button>
                          {menuOpen === log.id && (
                            <div className="absolute right-0 mt-1 w-48 bg-white border border-gray-300 rounded-md shadow-lg z-10">
                              <div className="py-1">
                                <button
                                  onClick={() => { onEdit(log.id); setMenuOpen(null); }}
                                  className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                                >
                                  ✏️ Upravit
                                </button>
                                <button
                                  onClick={() => { onDuplicate(log); setMenuOpen(null); }}
                                  className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                                >
                                  📋 Duplikovat
                                </button>
                                <button
                                  onClick={() => { onSendSms(log.id); setMenuOpen(null); }}
                                  className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                                >
                                  💬 Odeslat SMS
                                </button>
                                {onResendRide && log.status === RideStatus.Pending && (Date.now() - log.timestamp) > (5 * 60 * 1000) && (
                                  <button
                                    onClick={() => { onResendRide(log.id); setMenuOpen(null); }}
                                    className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                                  >
                                    ↻ Znovu odeslat
                                  </button>
                                )}
                                {onSendToDriver && log.status === RideStatus.Scheduled && log.vehicleId && (
                                  <button
                                    onClick={() => { onSendToDriver(log.id); setMenuOpen(null); }}
                                    className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                                  >
                                    📤 Odeslat řidiči
                                  </button>
                                )}
                                <button
                                  onClick={() => { onDelete(log.id); setMenuOpen(null); }}
                                  className="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-gray-100"
                                >
                                  🗑️ Smazat
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                   </div>
                 );
               })}
             </div>
           </div>
        </div>
      )}
    </div>
  );
};
