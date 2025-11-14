import React, { useState, useEffect } from 'react';
import { ShiftPlan, ShiftPlanStatus } from '../../../types';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths } from 'date-fns';
import { cs } from 'date-fns/locale';

interface ShiftCalendarProps {
  shiftPlans: ShiftPlan[];
  onDateSelect: (date: Date) => void;
  onShiftClick: (shift: ShiftPlan) => void;
  selectedDate?: Date;
}

const ShiftCalendar: React.FC<ShiftCalendarProps> = ({
  shiftPlans,
  onDateSelect,
  onShiftClick,
  selectedDate
}) => {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [hoveredDate, setHoveredDate] = useState<Date | null>(null);

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const monthDays = eachDayOfInterval({ start: monthStart, end: monthEnd });

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

  // Check if date has shifts
  const hasShifts = (date: Date): boolean => {
    return getShiftsForDate(date).length > 0;
  };

  // Get shift count for date
  const getShiftCount = (date: Date): number => {
    return getShiftsForDate(date).length;
  };

  return (
    <div className="bg-white/10 backdrop-blur-md rounded-xl p-4 border border-white/20">
      {/* Calendar Header */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={previousMonth}
          className="p-2 hover:bg-white/10 rounded-lg transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        
        <h3 className="text-lg font-semibold text-white">
          {format(currentMonth, 'MMMM yyyy', { locale: cs })}
        </h3>
        
        <button
          onClick={nextMonth}
          className="p-2 hover:bg-white/10 rounded-lg transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* Weekday Headers */}
      <div className="grid grid-cols-7 gap-1 mb-2">
        {['Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne'].map(day => (
          <div key={day} className="text-center text-xs font-medium text-white/70">
            {day}
          </div>
        ))}
      </div>

      {/* Calendar Grid */}
      <div className="grid grid-cols-7 gap-1">
        {monthDays.map((day, index) => {
          const shifts = getShiftsForDate(day);
          const isSelected = selectedDate && isSameDay(day, selectedDate);
          const isToday = isSameDay(day, new Date());
          const hasShiftsOnDay = hasShifts(day);

          return (
            <div
              key={index}
              onClick={() => onDateSelect(day)}
              onMouseEnter={() => setHoveredDate(day)}
              onMouseLeave={() => setHoveredDate(null)}
              className={`
                relative p-2 h-20 border rounded-lg cursor-pointer transition-all
                ${isSelected ? 'bg-blue-500/30 border-blue-400' : 'border-white/20'}
                ${isToday ? 'ring-2 ring-yellow-400' : ''}
                ${hasShiftsOnDay ? 'bg-white/5' : ''}
                hover:bg-white/10
              `}
            >
              <div className={`
                text-sm font-medium
                ${isToday ? 'text-yellow-400' : 'text-white'}
                ${!isSameMonth(day, currentMonth) ? 'text-white/40' : ''}
              `}>
                {format(day, 'd')}
              </div>

              {/* Shift Indicators */}
              {hasShiftsOnDay && (
                <div className="mt-1 space-y-1">
                  {shifts.slice(0, 2).map((shift, shiftIndex) => (
                    <div
                      key={shiftIndex}
                      onClick={(e) => {
                        e.stopPropagation();
                        onShiftClick(shift);
                      }}
                      className={`
                        ${getStatusColor(shift.status)}
                        text-xs text-white px-1 py-0.5 rounded truncate
                        hover:opacity-80 cursor-pointer
                      `}
                    >
                      {format(new Date(shift.plannedStart), 'HH:mm')} - {format(new Date(shift.plannedEnd), 'HH:mm')}
                    </div>
                  ))}
                  
                  {shifts.length > 2 && (
                    <div className="text-xs text-white/60 text-center">
                      +{shifts.length - 2} více
                    </div>
                  )}
                </div>
              )}

              {/* Hover Tooltip */}
              {hoveredDate && isSameDay(hoveredDate, day) && shifts.length > 0 && (
                <div className="absolute z-10 top-full left-0 mt-1 w-48 bg-gray-900 text-white p-2 rounded-lg shadow-lg border border-gray-700 text-xs">
                  <div className="font-medium mb-1">
                    {format(day, 'd. MMMM yyyy', { locale: cs })}
                  </div>
                  {shifts.map((shift, shiftIndex) => (
                    <div key={shiftIndex} className="py-1 border-t border-gray-700">
                      <div className="flex items-center justify-between">
                        <span>{format(new Date(shift.plannedStart), 'HH:mm')} - {format(new Date(shift.plannedEnd), 'HH:mm')}</span>
                        <div className={`w-2 h-2 rounded-full ${getStatusColor(shift.status)}`} />
                      </div>
                      {shift.notes && (
                        <div className="text-gray-400 mt-1 truncate">{shift.notes}</div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="mt-4 flex flex-wrap gap-4 text-xs">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-blue-500" />
          <span className="text-white/70">Plánováno</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-green-500" />
          <span className="text-white/70">Aktivní</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-gray-500" />
          <span className="text-white/70">Dokončeno</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-red-500" />
          <span className="text-white/70">Zrušeno</span>
        </div>
      </div>
    </div>
  );
};

export default ShiftCalendar;