import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { supabase, authService, geocodeAddress, SUPABASE_ENABLED } from '../supabaseClient';
import { supabaseService, startAuthKeepAlive, stopAuthKeepAlive } from '../supabaseClient';
import { SUPABASE_ENABLED as SUPABASE_ENABLED_SERVICES } from '../supabaseClient';
import { persistRide } from '../utils/syncService';
import { RideLog, RideStatus, VehicleStatus } from '../types';
import { useTranslation } from '../contexts/LanguageContext';
import { format } from 'date-fns';
import { cs } from 'date-fns/locale';
import { initDriverSocket } from '../services/socketClient';

import { notifyUser, initializeNotifications, requestNotificationPermission, requestWakeLock, releaseWakeLock, isWakeLockSupported } from '../utils/notifications';
import { queueLocationData, queueMessage, queueRideUpdate, requestBackgroundSync, initializeBackgroundSync, backgroundSyncManager } from '../utils/backgroundSync';
import { ManualRideModal } from './ManualRideModal';
import { RideCompletionModal } from './RideCompletionModal';
import { ShiftModal } from './ShiftModal';
import { GamificationModal } from './GamificationModal';
import { NotificationSettingsModal } from './NotificationSettingsModal';
import { StreamChatDriver } from './StreamChatDriver';
import { testNotifications } from '../utils/testNotifications';
import ShiftPlanningModal from './ShiftPlanningModal';
import ShiftCalendar from './ShiftCalendar';
import { ShiftPlanningService } from '../services/shiftPlanningService';
import { ShiftPlan, ShiftPlanStatus, RecurringPattern } from '../../../types';

import io from 'socket.io-client';
import { safeGetAccessToken, getCachedAccessToken } from '../supabaseClient';

const Dashboard: React.FC = () => {
  const { t } = useTranslation();

  const watchIdRef = useRef<number | null>(null);
  const locationIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const [driverStatus, setDriverStatus] = useState<'offline' | 'available' | 'on_ride' | 'break' | 'refueling' | 'pause'>(() => {
    const saved = localStorage.getItem('driverStatus');
    return (saved as any) || 'offline';
  });
  const [breakEndTime, setBreakEndTime] = useState<number | null>(null);
  const [currentRide, setCurrentRide] = useState<RideLog | null>(null);
  const [pendingRides, setPendingRides] = useState<RideLog[]>([]);
   const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
   const [lastLocationUpdate, setLastLocationUpdate] = useState<number | null>(null);
  const [rideHistory, setRideHistory] = useState<RideLog[]>([]);
  const [shiftCash, setShiftCash] = useState<number>(0);
  const [shiftStartTime, setShiftStartTime] = useState<number | null>(null);
  const [customShiftStart, setCustomShiftStart] = useState<string>('');
  const [customShiftEnd, setCustomShiftEnd] = useState<string>('');
  const [customShiftDate, setCustomShiftDate] = useState<string>('');
  const [useCustomShift, setUseCustomShift] = useState<boolean>(false);
  const [socket, setSocket] = useState<any>(null);
  const [socketConnected, setSocketConnected] = useState(false);
   const [vehicleNumber, setVehicleNumber] = useState<number | null>(null);
  const [preferredNavApp, setPreferredNavApp] = useState<'google' | 'mapy' | 'waze'>(() => {
    // Load saved preference from localStorage, default to 'google'
    const saved = localStorage.getItem('preferredNavApp');
    return (saved === 'google' || saved === 'mapy' || saved === 'waze') ? saved : 'google';
  });
  const [navigationActive, setNavigationActive] = useState(false);
  const [navigationStartTime, setNavigationStartTime] = useState<number | null>(null);
    const [showManualRideModal, setShowManualRideModal] = useState(false);
    const [showCompletionModal, setShowCompletionModal] = useState(false);
    const [rideToComplete, setRideToComplete] = useState<RideLog | null>(null);
    const [showCancelConfirmation, setShowCancelConfirmation] = useState(false);
    const [showRideHistory, setShowRideHistory] = useState(false);
     const [showShiftModal, setShowShiftModal] = useState(false);
     const [showGamificationModal, setShowGamificationModal] = useState(false);
  const [showNotificationSettingsModal, setShowNotificationSettingsModal] = useState(false);
  const [shiftPlanningService, setShiftPlanningService] = useState<ShiftPlanningService | null>(() => {
    // Initialize immediately if supabase is available
    if (supabase) {
      return new ShiftPlanningService(supabase);
    }
    return null;
  });
   const [driverInfo, setDriverInfo] = useState<any>(null);
   const [selectedDriver, setSelectedDriver] = useState<any>(null);
   const [vehicles, setVehicles] = useState<any[]>([]);
   const [shiftPlans, setShiftPlans] = useState<any[]>([]);
   const [queuedDataCount, setQueuedDataCount] = useState<number>(0);
   const [activeCard, setActiveCard] = useState<string>('operations');
   const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'success' | 'error'>('idle');

   const [showShiftPlanningModal, setShowShiftPlanningModal] = useState<boolean>(false);
   const [editingShift, setEditingShift] = useState<any>(null);
   const [selectedDate, setSelectedDate] = useState<Date>(new Date());
   const [chatCardActivated, setChatCardActivated] = useState<number | null>(null);
   const [shiftViewMode, setShiftViewMode] = useState<'calendar' | 'list'>('calendar');
   const [flashingRides, setFlashingRides] = useState<Set<number>>(new Set());
  // Initialize shift state from localStorage synchronously
    const getInitialShiftValue = (key: string, defaultValue: any = null) => {
      const value = localStorage.getItem(key);
      if (value === null) return defaultValue;
      // For timestamp keys, always try to parse as number
      if (key.includes('Time') || key.includes('Odo') || key.includes('Revenue') || key.includes('Cash') || key.includes('Distance')) {
        const parsed = parseFloat(value);
        return isNaN(parsed) ? defaultValue : parsed;
      }
      return value;
    };

   const [shiftStartOdo, setShiftStartOdo] = useState<number | null>(
     getInitialShiftValue('shiftStartOdo')
   );
   const [shiftEndOdo, setShiftEndOdo] = useState<number | null>(
     getInitialShiftValue('shiftEndOdo')
   );
   const [shiftStartTimestamp, setShiftStartTimestamp] = useState<number | null>(
     getInitialShiftValue('shiftStartTime')
   );
    const [shiftEndTimestamp, setShiftEndTimestamp] = useState<number | null>(
      getInitialShiftValue('shiftEndTime')
    );
    const [isShiftActive, setIsShiftActive] = useState<boolean>(
      localStorage.getItem('isShiftActive') === 'true'
    );
   const [historyFilter, setHistoryFilter] = useState<'2days' | 'week' | 'month' | 'all'>('all');
  const [licensePlate, setLicensePlate] = useState<string>('');
     const [otherDrivers, setOtherDrivers] = useState<any[]>([]);
     const [availableDrivers, setAvailableDrivers] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [wakeLockActive, setWakeLockActive] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>('default');
   const [isOnline, setIsOnline] = useState(navigator.onLine);
   const [realtimeConnectionStatus, setRealtimeConnectionStatus] = useState<'connected' | 'connecting' | 'disconnected'>('disconnected');
   const [lastAcceptedRideId, setLastAcceptedRideId] = useState<string | null>(null);
  const [lastAcceptTime, setLastAcceptTime] = useState<number>(0);

  // Filter ride history based on selected filter
  const filteredRideHistory = useMemo(() => {
    const now = Date.now();
    return rideHistory.filter(ride => {
      switch (historyFilter) {
        case '2days':
          return now - ride.timestamp < 2 * 24 * 60 * 60 * 1000; // 2 days
        case 'week':
          return now - ride.timestamp < 7 * 24 * 60 * 60 * 1000; // 1 week
        case 'month':
          return now - ride.timestamp < 30 * 24 * 60 * 60 * 1000; // 30 days
        case 'all':
        default:
          return true;
      }
    });
  }, [rideHistory, historyFilter]);

  // Initialize shift data from localStorage
  useEffect(() => {
    const savedShiftStart = localStorage.getItem('shiftStartTime');
    const savedShiftEnd = localStorage.getItem('shiftEndTime');
    const savedDriverStatus = localStorage.getItem('driverStatus');
    const savedShiftCash = localStorage.getItem('shiftCash');

    if (savedShiftStart) setShiftStartTime(parseInt(savedShiftStart));
    if (savedShiftEnd) setShiftEndTimestamp(parseInt(savedShiftEnd));
    if (savedDriverStatus) setDriverStatus(savedDriverStatus as any);
    if (savedShiftCash) setShiftCash(parseFloat(savedShiftCash));
  }, []);

  // Check for old shifts after vehicles are loaded
  useEffect(() => {
    if (vehicles.length === 0) return;

    const savedIsShiftActive = localStorage.getItem('isShiftActive');
    const savedShiftStart = localStorage.getItem('shiftStartTime');

    if (savedIsShiftActive === 'true' && savedShiftStart) {
      const shiftStartTime = parseInt(savedShiftStart);
      const hoursSinceShiftStart = (Date.now() - shiftStartTime) / (1000 * 60 * 60);

      if (hoursSinceShiftStart > 24) {
        console.log('⚠️ Old shift detected (', hoursSinceShiftStart.toFixed(1), 'hours ago), resetting shift state');

        // Reset localStorage
        localStorage.removeItem('shiftStartTime');
        localStorage.removeItem('shiftEndTime');
        localStorage.setItem('isShiftActive', 'false');
        localStorage.setItem('driverStatus', 'offline');

        // Reset state
        setIsShiftActive(false);
        setDriverStatus('offline');
        setShiftStartTime(null);
        setShiftEndTimestamp(null);

        // Also reset vehicle status in database
        if (vehicleNumber) {
          const currentVehicle = vehicles.find(v => v.id === vehicleNumber);
          if (currentVehicle) {
             const updatedVehicle = {
               ...currentVehicle,
               status: VehicleStatus.OutOfService,
               shift_start: null,
               shift_end: null,
               shiftStartOdo: null,
               shiftEndOdo: null
             };
            supabaseService.updateVehicles([updatedVehicle]).then(() => {
              // Update local state
              setVehicles(prev => prev.map(v => v.id === vehicleNumber ? updatedVehicle : v));
            }).catch(err => {
              console.error('Failed to reset vehicle status:', err);
            });
          }
        }
      }
    }
  }, [vehicles, vehicleNumber]);

  const handleStartShift = async (startOdo: number) => {
    console.log('🚀 handleStartShift called with odometer:', startOdo);
    const startTime = Date.now();
    console.log('🚀 Setting shift start time:', new Date(startTime).toLocaleString());

    setShiftStartTime(startTime);
    setShiftEndTimestamp(null);
    setDriverStatus('available');
      setIsShiftActive(true);
      localStorage.setItem('shiftStartTime', startTime.toString());
      localStorage.removeItem('shiftEndTime');
      localStorage.setItem('driverStatus', 'available');
      localStorage.setItem('isShiftActive', 'true');
      localStorage.removeItem('shiftStartOdo'); // Clear stored odometer after use

    // Save start odometer to vehicle data
    setShiftStartOdo(startOdo);
    localStorage.setItem('shiftStartOdo', startOdo.toString());
    console.log('🚀 Saved start odometer to localStorage:', startOdo);

    // Update vehicle with start odometer
    if (vehicleNumber) {
      try {
        const currentVehicle = vehicles.find(v => v.id === vehicleNumber);
        console.log('🚀 Current vehicle before update:', currentVehicle);
        if (!currentVehicle) {
          console.error('❌ Vehicle not found in local state for update');
          return;
        }
        const updatedVehicle = {
          ...currentVehicle,
          shift_start: new Date(startTime),
          mileage: startOdo,  // Update current mileage to start odometer
          status: VehicleStatus.Available
        };
        console.log('🚀 Updated vehicle object:', updatedVehicle);
        await supabaseService.updateVehicles([updatedVehicle]);
        console.log('✅ Vehicle start odometer and mileage updated in database:', startOdo);

        // Update local vehicles state
        setVehicles(prev => prev.map(v => v.id === vehicleNumber ? updatedVehicle : v));
        console.log('✅ Local vehicles state updated');

        // Force refresh vehicle data from database to ensure consistency
        try {
          const freshVehicles = await supabaseService.getVehicles();
          setVehicles(freshVehicles);
          console.log('✅ Vehicle data refreshed from database');
        } catch (refreshError) {
          console.error('❌ Failed to refresh vehicle data:', refreshError);
        }
      } catch (error) {
        console.error('❌ Failed to update vehicle start odometer and mileage:', error);
      }
    } else {
      console.log('❌ No vehicle number available for update');
    }

    // Update shift planning status to Active
    if (shiftPlanningService && selectedDriver?.id) {
      try {
        const now = new Date();
        // Look for planned shifts within a 24-hour window around current time
        const searchStart = new Date(now.getTime() - 12 * 60 * 60 * 1000); // 12 hours ago
        const searchEnd = new Date(now.getTime() + 12 * 60 * 60 * 1000); // 12 hours from now

        console.log('🔍 Looking for planned shifts for driver', selectedDriver.id, 'between', searchStart.toISOString(), 'and', searchEnd.toISOString());

        const driverShifts = await shiftPlanningService.getDriverShiftPlans(selectedDriver.id, searchStart, searchEnd);
        console.log('📋 Found', driverShifts.length, 'shifts for driver');

        const currentShift = driverShifts.find(shift => {
          const plannedStart = new Date(shift.plannedStart);
          const plannedEnd = new Date(shift.plannedEnd);
          const isPlanned = shift.status === ShiftPlanStatus.Planned;
          const timeMatches = plannedStart <= now && plannedEnd >= now;

          console.log('Checking shift:', shift.id, 'status:', shift.status, 'plannedStart:', plannedStart.toISOString(), 'plannedEnd:', plannedEnd.toISOString(), 'timeMatches:', timeMatches);

          return isPlanned && timeMatches;
        });

        if (currentShift) {
          console.log('✅ Found matching planned shift:', currentShift.id, 'updating to Active');
          await shiftPlanningService.updateShiftPlan(currentShift.id, {
            status: ShiftPlanStatus.Active,
            actualStart: new Date()
          });
          console.log('✅ Shift status updated to Active:', currentShift.id);
        } else {
          console.log('⚠️ No matching planned shift found for driver', selectedDriver.id);
        }
      } catch (error) {
        console.error('❌ Failed to update shift status to Active:', error);
      }
    }
  };

  const handleEndShift = async (endOdo: number): Promise<boolean> => {
    const endTime = Date.now();

     // Validate shift duration - prevent ending shifts too early
     if (shiftStartTimestamp) {
       const shiftDurationHours = (endTime - shiftStartTimestamp) / (1000 * 60 * 60);

       // Minimum shift duration: 1 minute for testing
       if (shiftDurationHours < 1/60) {
         alert(`Směna je příliš krátká (${(shiftDurationHours*60).toFixed(1)} minut). Minimální délka směny je 1 minuta.`);
         return false;
       }

      // Check against planned shift end time if available
      if (shiftPlanningService && selectedDriver?.id) {
        try {
          const today = new Date();
          const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
          const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59);

          const driverShifts = await shiftPlanningService.getDriverShiftPlans(selectedDriver.id, startOfDay, endOfDay);
          const currentShift = driverShifts.find(shift => shift.status === ShiftPlanStatus.Active);

           if (currentShift && currentShift.plannedEnd) {
             const plannedEndTime = new Date(currentShift.plannedEnd).getTime();
             const timeBeforePlannedEnd = (plannedEndTime - endTime) / (1000 * 60 * 60); // hours

             // Allow early ending with confirmation
             if (timeBeforePlannedEnd > 0) { // Ending before planned time
               const confirmEarly = confirm(`Směna končí ${timeBeforePlannedEnd.toFixed(1)} hodin před plánovaným koncem (${new Date(currentShift.plannedEnd).toLocaleTimeString('cs-CZ')}). Skutečný čas konce bude zaznamenán. Opravdu chcete směnu ukončit?`);
               if (!confirmEarly) return false;
             }
           }
        } catch (error) {
          console.error('Failed to validate against planned shift:', error);
          // Continue with shift end even if validation fails
        }
      }
    }

      // Proceed with shift end
       setShiftEndTimestamp(endTime);
       setDriverStatus('offline');
       setIsShiftActive(false);
       localStorage.setItem('shiftEndTime', endTime.toString());
       localStorage.setItem('driverStatus', 'offline');
       localStorage.setItem('isShiftActive', 'false');

       // Update stored odometer for next shift start
       localStorage.setItem('shiftStartOdo', endOdo.toString());

       // Clear selection to return to driver selection screen
       localStorage.removeItem('selectedDriverId');
       localStorage.removeItem('selectedDriverName');
       localStorage.removeItem('selectedDriverEmail');
       localStorage.removeItem('selectedVehicleId');
       localStorage.removeItem('licensePlate');

     // Set custom shift times to the actual shift times for display
     if (shiftStartTimestamp) {
       const startDate = new Date(shiftStartTimestamp);
       const endDate = new Date(endTime);
       setCustomShiftDate(startDate.toISOString().split('T')[0]);
       setCustomShiftStart(startDate.toTimeString().slice(0, 5));
       setCustomShiftEnd(endDate.toTimeString().slice(0, 5));
       setUseCustomShift(true);
       localStorage.setItem('customShiftDate', startDate.toISOString().split('T')[0]);
       localStorage.setItem('customShiftStart', startDate.toTimeString().slice(0, 5));
       localStorage.setItem('customShiftEnd', endDate.toTimeString().slice(0, 5));
       localStorage.setItem('useCustomShift', 'true');
     }

    // Save end odometer to vehicle data
    setShiftEndOdo(endOdo);
    localStorage.setItem('shiftEndOdo', endOdo.toString());

    // Update vehicle with end odometer and current mileage
    if (vehicleNumber) {
      try {
        const currentVehicle = vehicles.find(v => v.id === vehicleNumber);
          const updatedVehicle = {
            ...currentVehicle,
            shift_end: new Date(endTime),
            mileage: endOdo,  // Update current mileage to end odometer
            status: VehicleStatus.OutOfService
          };
        if (updatedVehicle) {
          await supabaseService.updateVehicles([updatedVehicle]);
          console.log('Vehicle end odometer and mileage updated:', endOdo);

          // Update local vehicles state
          setVehicles(prev => prev.map(v => v.id === vehicleNumber ? updatedVehicle : v));
        }
      } catch (error) {
        console.error('Failed to update vehicle end odometer and mileage:', error);
      }
    }

    // Update shift planning status to Completed
    if (shiftPlanningService && selectedDriver?.id) {
      try {
        console.log('🔍 Looking for active shifts for driver', selectedDriver.id, 'to mark as completed');

        // Find any active shift for this driver (not limited to today)
        const driverShifts = await shiftPlanningService.getDriverShiftPlans(selectedDriver.id);
        console.log('📋 Found', driverShifts.length, 'total shifts for driver');

        const activeShift = driverShifts.find(shift => shift.status === ShiftPlanStatus.Active);

        if (activeShift) {
          console.log('✅ Found active shift:', activeShift.id, 'updating to Completed');
          await shiftPlanningService.updateShiftPlan(activeShift.id, {
            status: ShiftPlanStatus.Completed,
            actualEnd: new Date()
          });
          console.log('✅ Shift status updated to Completed:', activeShift.id);
        } else {
          console.log('⚠️ No active shift found for driver', selectedDriver.id);
        }
      } catch (error) {
        console.error('❌ Failed to update shift status to Completed:', error);
      }
    }

    return true;
  };

  // Initialize vehicle number when driver is selected
  useEffect(() => {
    const initializeVehicle = async () => {
      // Get selected driver and vehicle info from localStorage
      const selectedDriverId = localStorage.getItem('selectedDriverId');
      const selectedDriverEmail = localStorage.getItem('selectedDriverEmail');
      const selectedDriverName = localStorage.getItem('selectedDriverName');
      const selectedVehicleId = localStorage.getItem('selectedVehicleId');

      console.log('Loading from localStorage:', { selectedDriverId, selectedDriverName, selectedVehicleId });

      if (!selectedDriverId || !selectedDriverEmail || !selectedVehicleId) {
        setVehicleNumber(null);
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);

        // Get vehicles and people data
        const [vehiclesData, peopleData] = await Promise.all([
          supabaseService.getVehicles(),
          supabaseService.getPeople()
        ]);
        setVehicles(vehiclesData);
        setAvailableDrivers(peopleData.filter(p => p.role === 'Driver'));

        console.log('Looking for vehicle with ID:', selectedVehicleId);
        console.log('Available vehicles:', vehiclesData.map(v => ({
          id: v.id,
          name: v.name,
          licensePlate: v.licensePlate,
          mileage: v.mileage,
          shift_start: v.shift_start,
          shift_end: v.shift_end,
          status: v.status
        })));

        // Find the vehicle by vehicle ID
        let assignedVehicle = vehiclesData.find(v => v.id === parseInt(selectedVehicleId));

        // Find the driver by driver ID
        const assignedDriver = peopleData.find(p => p.id === parseInt(selectedDriverId));
        console.log('Looking for driver with ID:', selectedDriverId);
        console.log('Found driver:', assignedDriver);
        console.log('All people:', peopleData.map(p => ({ id: p.id, name: p.name, role: p.role })));

      if (assignedVehicle) {
        console.log('Assigned vehicle found:', assignedVehicle.id, 'mileage:', assignedVehicle.mileage);
        setVehicleNumber(assignedVehicle.id);
        setLicensePlate(assignedVehicle.licensePlate || '');

        // Update queued data counts (locations/messages/ride updates)
        try {
          const cachedLocations = localStorage.getItem('cached-locations');
          const locationsCount = cachedLocations ? JSON.parse(cachedLocations).length : 0;
          const pendingMessages = localStorage.getItem('pending-messages');
          const pendingUpdates = localStorage.getItem('pending-ride-updates');

          const messagesCount = pendingMessages ? JSON.parse(pendingMessages).length : 0;
          const updatesCount = pendingUpdates ? JSON.parse(pendingUpdates).length : 0;

          const totalQueued = locationsCount + messagesCount + updatesCount;
          setQueuedDataCount(totalQueued);

          if (totalQueued === 0 && syncStatus !== 'syncing') {
            setSyncStatus('idle');
          }
        } catch (e) {
          console.warn('Failed to compute queued data counts:', e);
        }

        // Set driver info from database
        if (assignedDriver) {
          setDriverInfo(assignedDriver);
          setSelectedDriver(assignedDriver);
          console.log('Driver info from database:', assignedDriver);
        } else {
          console.warn('Driver not found in database! selectedDriverId:', selectedDriverId, 'available drivers:', peopleData.map(p => ({ id: p.id, name: p.name })));
          // Fallback to localStorage data if driver not found in database
          setDriverInfo({ id: parseInt(selectedDriverId), name: selectedDriverName || `Driver ${selectedDriverId}` });
          setSelectedDriver({ id: parseInt(selectedDriverId), name: selectedDriverName || `Driver ${selectedDriverId}` });
          console.log('Driver info from localStorage (fallback):', selectedDriverId, selectedDriverName);
        }

        // Load shift start from database
        if (assignedVehicle.shift_start) {
          const shiftStartDate = new Date(assignedVehicle.shift_start);
          if (!isNaN(shiftStartDate.getTime())) {
            const shiftStartTimeVal = shiftStartDate.getTime();
            const hoursSinceShiftStart = (Date.now() - shiftStartTimeVal) / (1000 * 60 * 60);
            if (hoursSinceShiftStart > 24) {
              console.log('⚠️ Old shift start detected in database (', hoursSinceShiftStart.toFixed(1), 'hours ago), resetting vehicle status');
              // Reset the vehicle in database
              const updatedVehicle = {
                ...assignedVehicle,
                status: VehicleStatus.OutOfService,
                shift_start: null,
                shift_end: null,
                shiftStartOdo: null,
                shiftEndOdo: null
              };
              try {
                await supabaseService.updateVehicles([updatedVehicle]);
                // Update local
                assignedVehicle = updatedVehicle;
                setVehicles(prev => prev.map(v => v.id === parseInt(selectedVehicleId) ? updatedVehicle : v));
                // Reset localStorage
                localStorage.removeItem('shiftStartTime');
                localStorage.removeItem('shiftEndTime');
                localStorage.setItem('isShiftActive', 'false');
                localStorage.setItem('driverStatus', 'offline');
                setShiftStartTime(null);
                setShiftEndTimestamp(null);
                setIsShiftActive(false);
                setDriverStatus('offline');
              } catch (err) {
                console.error('Failed to reset old shift in database:', err);
              }
            } else {
              setShiftStartTime(shiftStartTimeVal);
              localStorage.setItem('shiftStartTime', shiftStartTimeVal.toString());
              console.log('Loaded shift start from database:', new Date(shiftStartTimeVal).toLocaleString());
            }
          } else {
            console.warn('Invalid shift start date from database:', assignedVehicle.shift_start);
          }
        }

        if (assignedVehicle.shift_end) {
          const shiftEndDate = new Date(assignedVehicle.shift_end);
          if (!isNaN(shiftEndDate.getTime())) {
            const shiftEndTimeVal = shiftEndDate.getTime();
            setShiftEndTimestamp(shiftEndTimeVal);
            localStorage.setItem('shiftEndTime', shiftEndTimeVal.toString());
            console.log('Loaded shift end from database:', new Date(shiftEndTimeVal).toLocaleString());
          } else {
            console.warn('Invalid shift end date from database:', assignedVehicle.shift_end);
          }
        }

        // Load vehicle mileage from database
        console.log('Vehicle data from database:', {
          id: assignedVehicle.id,
          mileage: assignedVehicle.mileage,
          shift_start: assignedVehicle.shift_start,
          shift_end: assignedVehicle.shift_end
        });

        // Load current driver status from vehicle status - preserve manual settings
        const vehicleStatus = assignedVehicle.status;
        if (vehicleStatus === 'AVAILABLE') {
          setDriverStatus('available');
        } else if (vehicleStatus === 'BUSY') {
          setDriverStatus('on_ride');
        } else if (vehicleStatus === 'BREAK') {
          setDriverStatus('break');
        } else if (vehicleStatus === 'OUT_OF_SERVICE') {
          setDriverStatus('offline');
        } else {
          setDriverStatus('offline'); // Default to offline for unknown statuses
        }

         console.log('Assigned vehicle:', assignedVehicle.id, 'License plate:', assignedVehicle.licensePlate, 'Loaded status:', vehicleStatus);

         // Sync isShiftActive with vehicle status, but fix inconsistent states
         let shiftActive = vehicleStatus === 'AVAILABLE';
         if (assignedVehicle.shift_end && !assignedVehicle.shift_start && vehicleStatus === 'AVAILABLE') {
           // Inconsistent state: shift ended but no start recorded, fix locally
           shiftActive = false;
           setDriverStatus('offline');
           console.log('Fixed inconsistent shift state: shift ended but no start recorded');
         }
         setIsShiftActive(shiftActive);
         localStorage.setItem('isShiftActive', shiftActive ? 'true' : 'false');
       } else {
          console.warn('No vehicle found with ID:', selectedDriverId);
          console.warn('Available vehicle IDs:', vehicles.map(v => v.id));
          setError('Vehicle not found. Please select again.');
          setVehicleNumber(null);
          // Clear selection and reload to show selection screen
          localStorage.removeItem('selectedDriverId');
          localStorage.removeItem('selectedDriverEmail');
          localStorage.removeItem('selectedDriverName');
          setTimeout(() => window.location.reload(), 2000);
        }
      } catch (error) {
        console.error('Error initializing vehicle:', error);
        setError('Failed to load vehicle data');
        setVehicleNumber(null);
      } finally {
        setIsLoading(false);
      }
    };

    initializeVehicle();
  }, []);

  // Load rides when vehicle is ready
  useEffect(() => {
    if (vehicleNumber) {
      loadRides();
    }
  }, [vehicleNumber]);

  // Helper function to clean addresses (remove place IDs)
  const cleanAddress = (address: string): string => {
    if (!address) return address;
    // Split on | and take the first part (the human-readable address)
    return address.split('|')[0]?.trim() || address;
  };

  // Function to update vehicle status in database
  const updateVehicleStatus = async (newStatus: string) => {
    if (!vehicleNumber) return;

    try {
      const currentVehicle = vehicles.find(v => v.id === vehicleNumber);
      if (!currentVehicle) return;

      const statusMap: { [key: string]: VehicleStatus } = {
        'available': VehicleStatus.Available,
        'on_ride': VehicleStatus.Busy,
        'break': VehicleStatus.Break,
        'refueling': VehicleStatus.Break, // Map refueling to break
        'pause': VehicleStatus.Break, // Map pause to break
        'offline': VehicleStatus.OutOfService
      };

      const dbStatus = statusMap[newStatus];
      if (!dbStatus) {
        console.warn('Unknown status:', newStatus);
        return;
      }

      const updatedVehicle = {
        ...currentVehicle,
        status: dbStatus
      };

      await supabaseService.updateVehicles([updatedVehicle]);
      setVehicles(prev => prev.map(v => v.id === vehicleNumber ? updatedVehicle : v));

      console.log('Updated vehicle status in database:', dbStatus);
    } catch (error) {
      console.error('Failed to update vehicle status:', error);
    }
  };

  // Ride action functions
  const acceptRideSpecific = async (ride: RideLog) => {
    // Socket disabled - using direct database updates instead
    // if (!socket || !socketConnected) {
    //   alert('No socket connection. Please check your internet connection.');
    //   return;
    // }

    try {
      console.log('🎯 Accepting specific ride:', ride.id);

      // Update ride status to accepted
      const updatedRide = { ...ride, status: RideStatus.Accepted };
      await supabaseService.updateRideLog(ride.id, updatedRide);

      // Emit to socket for real-time updates - DISABLED
      /*
      socket.emit('ride_update', {
        rideId: ride.id,
        status: RideStatus.Accepted,
        vehicleId: vehicleNumber
      });
      */

      // Refresh rides
      loadRides();

      // Set as current ride
      setCurrentRide(updatedRide);

      // Add to flashing rides for visual feedback
      setFlashingRides(prev => new Set([...prev, ride.id]));

      // Remove flashing after animation
      setTimeout(() => {
        setFlashingRides(prev => {
          const newSet = new Set(prev);
          newSet.delete(ride.id);
          return newSet;
        });
      }, 3000);

    } catch (error) {
      console.error('❌ Failed to accept ride:', error);
      alert('Failed to accept ride. Please try again.');
    }
  };

  const acceptRide = async () => {
    if (!currentRide) return;

    try {
      console.log('🎯 Accepting current ride:', currentRide.id);

      const updatedRide = { ...currentRide, status: RideStatus.Accepted };
      await supabaseService.updateRideLog(currentRide.id, updatedRide);

      // Socket disabled
      // if (socket && socketConnected) {
      //   socket.emit('ride_update', {
      //     rideId: currentRide.id,
      //     status: RideStatus.Accepted,
      //     vehicleId: vehicleNumber
      //   });
      // }

      setCurrentRide(updatedRide);
      loadRides();

    } catch (error) {
      console.error('❌ Failed to accept ride:', error);
      alert('Failed to accept ride. Please try again.');
    }
  };

  const startRide = async () => {
    if (!currentRide) return;

    try {
      console.log('🚀 Starting ride:', currentRide.id);

      const updatedRide = { ...currentRide, status: RideStatus.InProgress };
      await supabaseService.updateRideLog(currentRide.id, updatedRide);

      // Socket disabled
      // if (socket && socketConnected) {
      //   socket.emit('ride_update', {
      //     rideId: currentRide.id,
      //     status: RideStatus.InProgress,
      //     vehicleId: vehicleNumber
      //   });
      // }

       setCurrentRide(updatedRide);
       loadRides();

       // Update vehicle status to busy
       await updateVehicleStatus('on_ride');

     } catch (error) {
       console.error('❌ Failed to start ride:', error);
       alert('Failed to start ride. Please try again.');
     }
  };

  const endRide = () => {
    if (currentRide) {
      setRideToComplete(currentRide);
      setShowCompletionModal(true);
    }
  };

  const handleRideCompleted = async () => {
    // Close the completion modal
    setShowCompletionModal(false);
    setRideToComplete(null);

    // Reload rides to get updated status
    loadRides();

    // Clear current ride since it's completed
    setCurrentRide(null);

    // Update vehicle status back to available
    await updateVehicleStatus('available');
  };

  const handleManualRideAdded = async (ride?: RideLog) => {
    // Close the manual ride modal
    setShowManualRideModal(false);

    // Reload rides to get the new ride
    loadRides();

    // If a ride was provided and we don't have a current ride, set it as current
    if (ride && !currentRide) {
      setCurrentRide(ride);
      // Update vehicle status to busy
      await updateVehicleStatus('busy');
    }
  };

  const formatPickupTime = (pickupTime: string) => {
    if (!pickupTime || pickupTime === 'ihned') {
      return 'ihned';
    }

    // Try to parse as date/time
    try {
      const date = new Date(pickupTime);
      if (!isNaN(date.getTime())) {
        return date.toLocaleString('cs-CZ', {
          hour: '2-digit',
          minute: '2-digit',
          day: '2-digit',
          month: '2-digit'
        });
      }
    } catch (e) {
      // If parsing fails, return as-is
    }

    return pickupTime;
  };

  const navigateToDestination = async (ride?: RideLog) => {
    const targetRide = ride || currentRide;
    if (!targetRide || targetRide.stops.length === 0) return;

    try {
      console.log('🗺️ Navigating for ride:', targetRide.id, 'stops:', targetRide.stops);

      // Clean all addresses
      const cleanStops = targetRide.stops.map(stop => cleanAddress(stop));
      console.log('Clean stops:', cleanStops);

      // Use the preferred navigation app
      const navApp = preferredNavApp || 'google';

      let navUrl: string;

      if (navApp === 'google') {
        try {
          // Geocode all stops
          const geocodedStops = await Promise.all(
            cleanStops.map(async (stop, index) => {
              try {
                const coords = await geocodeAddress(stop, 'cs');
                console.log(`Geocoded stop ${index} (${stop}):`, coords);
                return { address: stop, coords };
              } catch (error) {
                console.warn(`Failed to geocode stop ${index} (${stop}):`, error);
                return { address: stop, coords: null };
              }
            })
          );

          // Build Google Maps URL with origin (current location if available), waypoints, and destination
          const params = new URLSearchParams();
          params.append('api', '1');
          params.append('travelmode', 'driving');

          // If we have current location, use it as origin
          if (location) {
            params.append('origin', `${location.latitude},${location.longitude}`);
          }

          // Filter out stops without coordinates
          const validStops = geocodedStops.filter(stop => stop.coords !== null);

          if (validStops.length > 0) {
            // Last valid stop is destination
            const destination = validStops[validStops.length - 1];
            params.append('destination', `${destination.coords!.lat},${destination.coords!.lon}`);

            // All stops except last are waypoints
            if (validStops.length > 1) {
              const waypoints = validStops.slice(0, -1)
                .map(stop => `${stop.coords!.lat},${stop.coords!.lon}`)
                .join('|');
              params.append('waypoints', waypoints);
            }

            navUrl = `https://www.google.com/maps/dir/?${params.toString()}`;
            console.log('Generated Google Maps URL:', navUrl);
          } else {
            // Fallback to search for first stop
            navUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(cleanStops[0])}`;
          }

        } catch (error) {
          console.error('Google Maps geocoding failed:', error);
          // Fallback to search for first stop
          navUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(cleanStops[0])}`;
        }
      } else {
        // Mapy.cz - just navigate to first stop
        navUrl = `https://mapy.cz/zakladni?q=${encodeURIComponent(cleanStops[0])}`;
      }

      console.log('Opening navigation URL:', navUrl);
      // Open navigation in new window/tab
      window.open(navUrl, '_blank');

    } catch (error) {
      console.error('❌ Failed to navigate:', error);
      alert('Failed to open navigation. Please try again.');
    }
  };



  // Load available drivers for shift planning
  useEffect(() => {
    const loadAvailableDrivers = async () => {
      try {
        if (shiftPlanningService) {
          const drivers = await shiftPlanningService.getAvailableDrivers();
          setAvailableDrivers(drivers);
        }
      } catch (error) {
        console.error('Error loading available drivers:', error);
        // Show user-friendly error message for network issues
        if (error.message?.includes('NetworkError') || error.message?.includes('fetch')) {
          alert('Network connection issue. Shift planning features may not be available. Please check your internet connection and try again.');
        }
      }
    };

    loadAvailableDrivers();
  }, [shiftPlanningService]);

  // Load rides for current vehicle
  const loadRides = async () => {
    if (!vehicleNumber) return;

    try {
      console.log('📦 Loading rides for vehicle:', vehicleNumber);

      // Load current ride (in progress)
      const currentRideData = await supabaseService.getRideLogsByVehicle(vehicleNumber, 'in_progress', 1);
      if (currentRideData && currentRideData.length > 0) {
        setCurrentRide(currentRideData[0]);
      } else {
        setCurrentRide(null);
      }

      // Load pending rides (assigned but not started)
      const pendingRidesData = await supabaseService.getRideLogsByVehicle(vehicleNumber, 'pending', 10);
      setPendingRides(pendingRidesData || []);

       // Load recent ride history (completed/cancelled) - load last 30 days to be safe
       const today = new Date();
       const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
       const historyData = await supabaseService.getRideLogs({
         dateFrom: monthAgo.toISOString(),
         dateTo: today.toISOString()
       });

       // Filter for this vehicle and completed/cancelled status
       const vehicleHistory = historyData.filter(ride =>
         ride.vehicleId === vehicleNumber &&
         (ride.status === RideStatus.Completed || ride.status === RideStatus.Cancelled)
       );

       setRideHistory(vehicleHistory);

       console.log('✅ Rides loaded:', {
         current: currentRideData?.[0]?.id || null,
         pending: pendingRidesData?.length || 0,
         history: vehicleHistory.length
       });

    } catch (error) {
      console.error('❌ Failed to load rides:', error);
    }
  };

  // Initialize socket connection for real-time updates - DISABLED due to auth issues
  // The driver app uses direct database polling instead of real-time socket updates
  // Force redeploy 2
  /*
  useEffect(() => {
    const initializeSocket = async () => {
      try {
        console.log('🚗 Initializing driver socket connection...');
        const socketInstance = await initDriverSocket();
        setSocket(socketInstance);
        setSocketConnected(true);

        // Listen for ride updates
        socketInstance.on('ride_update', (data) => {
          console.log('📨 Received ride update:', data);
          // Refresh ride data
          loadRides();
        });

        // Listen for ride updates (includes assignments)
        socketInstance.on('ride_updated', (data) => {
          console.log('📨 Ride updated:', data);

          // Check if this is a new ride assignment to this driver
          if (data.vehicleId === vehicleNumber && data.status === 'ACCEPTED' && !currentRide) {
            console.log('🎯 New ride assigned to this driver:', data);

            // Format pickup time for notification
            const pickupTimeText = data.pickupTime && data.pickupTime !== 'ihned'
              ? ` v ${new Date(data.pickupTime).toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' })}`
              : data.pickupTime === 'ihned' ? ' ihned' : '';

            // Show notification
            if ('Notification' in window && Notification.permission === 'granted') {
              new Notification('Nová jízda přiřazena!', {
                body: `Jízda pro ${data.customerName}${pickupTimeText} byla přiřazena vašemu vozidlu`,
                icon: '/android-launchericon-192-192.png'
              });
            }
          }

          // Refresh ride data for any ride update
          loadRides();
        });

        // Listen for ride cancellations
        socketInstance.on('ride_cancelled', (data) => {
          console.log('❌ Ride cancelled:', data);
          loadRides();
        });

        socketInstance.on('disconnect', () => {
          console.log('🔌 Driver socket disconnected');
          setSocketConnected(false);
        });

        socketInstance.on('reconnect', () => {
          console.log('🔄 Driver socket reconnected');
          setSocketConnected(true);
        });

      } catch (error) {
        console.error('❌ Failed to initialize driver socket:', error);
        setSocketConnected(false);
      }
    };

    initializeSocket();

    // Cleanup on unmount
    return () => {
      if (socket) {
        socket.disconnect();
      }
    };
  }, []);
  */

  // Initialize notifications
  useEffect(() => {
    const init = async () => {
      const selectedDriverId = localStorage.getItem('selectedDriverId');
      if (selectedDriverId) {
        console.log('Initializing notifications for driver:', selectedDriverId);

        // Initialize comprehensive notifications (permissions, push, wake lock)
        const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY; // Add this to .env when available
        await initializeNotifications(selectedDriverId, vapidKey);

        // Update permission status
        if ('Notification' in window) {
          setNotificationPermission(Notification.permission);
        } else {
          setNotificationPermission('denied');
        }
      }
    };
    init();
  }, []);

  // Listen for messages from service worker
  useEffect(() => {
    const handleServiceWorkerMessage = async (event: MessageEvent) => {
      try {
        if (event.data && event.data.type === 'NOTIFICATION_RECEIVED') {
          console.log('Received notification from service worker:', event.data);
          // Play sound and vibrate as if it was a local notification
          await notifyUser(event.data.notificationType, {
            title: event.data.title,
            body: event.data.body,
            sound: true,
            vibration: true,
            systemNotification: false // Don't show duplicate system notification
          }).catch(error => console.error('Error in notifyUser:', error));
        }
      } catch (error) {
        console.error('Error handling service worker message:', error);
      }
    };

    // Add a small delay to ensure service worker is ready
    const setupMessageListener = () => {
      if ('serviceWorker' in navigator && navigator.serviceWorker.ready) {
        navigator.serviceWorker.addEventListener('message', handleServiceWorkerMessage);
        return true;
      }
      return false;
    };

    // Try to set up immediately, or wait for service worker to be ready
    if (!setupMessageListener()) {
      navigator.serviceWorker.ready.then(() => {
        setupMessageListener();
      }).catch(error => console.warn('Service worker ready failed:', error));
    }

    return () => {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.removeEventListener('message', handleServiceWorkerMessage);
      }
    };
  }, []);

  // Shift data is now loaded synchronously in state initialization

  // State for shift revenue (loaded from localStorage synchronously)
   const [shiftRevenue, setShiftRevenue] = useState<number>(() => {
     const savedShiftRevenue = localStorage.getItem('shiftRevenue');
     return savedShiftRevenue ? parseFloat(savedShiftRevenue) : 0;
   });



    // Load shift plans when service is available and driver changes
    useEffect(() => {
      if (shiftPlanningService) {
        // Always load only the current driver's shifts in driver app
        const currentDriverId = selectedDriver?.id || driverInfo?.id;
        if (currentDriverId) {
          loadShiftPlans(shiftPlanningService, currentDriverId);
        }
      }
    }, [shiftPlanningService, driverInfo, selectedDriver]);

  const loadShiftPlans = async (service: ShiftPlanningService, driverId: number) => {
    try {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

      const plans = await service.getDriverShiftPlans(driverId, startOfMonth, endOfMonth);
      setShiftPlans(plans);
    } catch (error) {
      console.error('Error loading shift plans:', error);
      // Show user-friendly error message for network issues
      if (error.message?.includes('NetworkError') || error.message?.includes('fetch')) {
        alert('Network connection issue. Shift plans may not be available. Please check your internet connection and try again.');
      }
    }
  };

  const loadAllShiftPlans = async (service: ShiftPlanningService) => {
    try {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

      const plans = await service.getAllShiftPlans(startOfMonth, endOfMonth);
      setShiftPlans(plans);
    } catch (error) {
      console.error('Error loading all shift plans:', error);
      // Show user-friendly error message for network issues
      if (error.message?.includes('NetworkError') || error.message?.includes('fetch')) {
        alert('Network connection issue. Shift plans may not be available. Please check your internet connection and try again.');
      }
    }
  };

  const handleCreateShift = async (shiftPlan: Omit<ShiftPlan, 'id' | 'createdAt' | 'updatedAt'>) => {
    if (!shiftPlanningService) return;
    
    try {
      let finalShiftPlan = { ...shiftPlan };
      
      // Auto-assign driver ID and name based on selection
      if (selectedDriver) {
        finalShiftPlan = {
          ...finalShiftPlan,
          driverId: selectedDriver?.id,
          driverName: selectedDriver?.name
        };
      } else if (driverInfo) {
        finalShiftPlan = {
          ...finalShiftPlan,
          driverId: driverInfo?.id,
          driverName: driverInfo?.name
        };
      }
      
       if (finalShiftPlan.recurringPattern && finalShiftPlan.recurringPattern !== RecurringPattern.None && finalShiftPlan.recurringEndDate) {
         // Create recurring shifts
         await shiftPlanningService.createRecurringShiftPlans(
           finalShiftPlan,
           finalShiftPlan.recurringPattern,
           finalShiftPlan.recurringEndDate
         );
       } else {
         // Create single shift
         await shiftPlanningService.createShiftPlan(finalShiftPlan);
       }

       // Reload shift plans - always load current driver's shifts
       const currentDriverId = selectedDriver?.id || driverInfo?.id;
       if (currentDriverId) {
         await loadShiftPlans(shiftPlanningService, currentDriverId);
       }
     } catch (error) {
       console.error('Error creating shift plan:', error);
       throw error;
     }
   };

   const handleUpdateShift = async (id: string, updates: Partial<ShiftPlan>) => {
     if (!shiftPlanningService) return;

     try {
        await shiftPlanningService.updateShiftPlan(id, updates);

        // If the shift is being set to Active, update the vehicle shiftStart
        if (updates.status === ShiftPlanStatus.Active && vehicleNumber) {
          const startTime = Date.now();
          setShiftStartTime(startTime);
          setShiftEndTimestamp(null);
          setDriverStatus('available');
          setIsShiftActive(true);
          localStorage.setItem('shiftStartTime', startTime.toString());
          localStorage.removeItem('shiftEndTime');
          localStorage.setItem('driverStatus', 'available');
          localStorage.setItem('isShiftActive', 'true');

          // Update vehicle with shiftStart
          try {
            const currentVehicle = vehicles.find(v => v.id === vehicleNumber);
            const updatedVehicle = {
              ...currentVehicle,
              shift_start: new Date(startTime),
              shiftStartOdo: startOdo,
              mileage: startOdo
            };
            if (updatedVehicle) {
              await supabaseService.updateVehicles([updatedVehicle]);
              console.log('✅ Vehicle shift start updated in database');

              // Update local vehicles state
              setVehicles(prev => prev.map(v => v.id === vehicleNumber ? updatedVehicle : v));
              console.log('✅ Local vehicles state updated');
            }
          } catch (error) {
            console.error('❌ Failed to update vehicle shift start:', error);
          }
        }

         // Reload shift plans - always load current driver's shifts
         const currentDriverId = selectedDriver?.id || driverInfo?.id;
         if (currentDriverId) {
           await loadShiftPlans(shiftPlanningService, currentDriverId);
         }
      } catch (error) {
        console.error('Error updating shift plan:', error);
        throw error;
       }
    };

  const handleDeleteShift = async (id: string) => {
    if (!shiftPlanningService) return;
    
    try {
       await shiftPlanningService.deleteShiftPlan(id);

        // Reload shift plans - always load current driver's shifts
        const currentDriverId = selectedDriver?.id || driverInfo?.id;
        if (currentDriverId) {
          await loadShiftPlans(shiftPlanningService, currentDriverId);
        }
     } catch (error) {
       console.error('Error deleting shift plan:', error);
       throw error;
     }
  };

    const handleDateSelect = (date: Date) => {
      setSelectedDate(date);
    };

    const handleShiftClick = (shift: ShiftPlan) => {
      setEditingShift(shift);
      setShowShiftPlanningModal(true);
    };

    // Calculate revenue for the current active shift
    const calculateCurrentShiftCash = useCallback(() => {
      if (!isShiftActive || !shiftStartTimestamp || !rideHistory.length) {
        return 0;
      }

      return rideHistory.filter(ride => {
        const isCompleted = ride.status === RideStatus.Completed;
        const hasPrice = ride.estimatedPrice && ride.estimatedPrice > 0;
        const isCorrectVehicle = ride.vehicleId === vehicleNumber;

        // Use completedAt if available (for completed rides), otherwise use timestamp
        const rideTime = ride.completedAt ? ride.completedAt : new Date(ride.timestamp).getTime();
        const isAfterShiftStart = rideTime >= shiftStartTimestamp;

        return isCompleted && hasPrice && isCorrectVehicle && isAfterShiftStart;
      }).reduce((sum, ride) => sum + (ride.estimatedPrice || 0), 0);
    }, [isShiftActive, shiftStartTimestamp, rideHistory]);

    // General function to calculate shift cash for any time range
    const calculateShiftCash = useCallback((rides: RideLog[], shiftStart?: number) => {
      if (!rides.length || !shiftStart) {
        return 0;
      }

      return rides.filter(ride => {
        // Only count completed rides with cash payment
        if (ride.status !== RideStatus.Completed || ride.payment !== 'cash') return false;

        const rideTime = new Date(ride.timestamp).getTime();

        // Check if ride was completed during the shift
        return rideTime >= shiftStart;
      }).reduce((sum, ride) => sum + (ride.estimatedPrice || 0), 0);
    }, []);

    const currentShiftCash = calculateCurrentShiftCash();







  // Show loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-900 text-white p-4 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
          <p>Loading vehicle data...</p>
        </div>
      </div>
    );
  }

  // Show error state
  if (error) {
    return (
      <div className="min-h-screen bg-slate-900 text-white p-4 flex items-center justify-center">
        <div className="text-center max-w-md">
          <div className="text-red-400 text-6xl mb-4">⚠️</div>
          <h2 className="text-xl font-bold mb-2">Connection Error</h2>
          <p className="text-slate-300 mb-4">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-white"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white p-4">
      <div className="max-w-md mx-auto space-y-6 pb-24">
        <h1 className="text-2xl font-bold text-center text-white">{t('dashboard.title')} - {licensePlate || `Vehicle ${vehicleNumber}`}</h1>

        {/* Operations Card */}
        {activeCard === 'operations' && (
          <div className="space-y-6">
            {/* Manual Ride Button */}
            <div className="glass card-hover p-4 rounded-2xl border border-slate-700/50">
              <button
                onClick={() => setShowManualRideModal(true)}
                disabled={!!currentRide}
                className={`w-full py-3 rounded-lg btn-modern text-white font-bold text-lg shadow-lg ${
                  currentRide
                    ? 'bg-gray-600 cursor-not-allowed opacity-50'
                    : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                ➕ Přidat přímou jízdu
              </button>
              <p className="text-xs mt-2 text-center">
                {currentRide
                  ? <span className="text-orange-400">⚠️ Dokončete aktuální jízdu před přidáním nové</span>
                  : <span className="text-slate-400">Pro zákazníky, kteří přijdou přímo k vozidlu</span>
                }
              </p>
            </div>

            {/* New Rides */}
            {pendingRides.length > 0 && (
              <div className="glass card-hover p-4 rounded-2xl border border-slate-700/50">
                <h2 className="text-lg font-semibold mb-3 text-white">Nové jízdy</h2>
                <div className="space-y-3">
                  {pendingRides.map((ride) => (
                    <div key={ride.id} className={`bg-slate-800/50 rounded-lg p-3 border border-slate-600 transition-all duration-300 ${flashingRides.has(ride.id) ? 'flash-notification' : ''}`}>
                       <div className="space-y-2 text-slate-300">
                          <p><span className="font-medium">Zákazník:</span> {ride.customerName}</p>
                          <p><span className="font-medium">Telefon:</span> <a href={`tel:${ride.customerPhone}`} className="text-blue-400 underline hover:text-blue-300">{ride.customerPhone}</a></p>
                           <p><span className="font-medium">Odkud:</span> {cleanAddress(ride.stops[0])}</p>
                           <p><span className="font-medium">Kam:</span> {cleanAddress(ride.stops[ride.stops.length - 1])}</p>
                          <p><span className="font-medium">Počet pasažérů:</span> {ride.passengers}</p>
                          <p><span className="font-medium">Čas vyzvednutí:</span> {formatPickupTime(ride.pickupTime)}</p>
                          {ride.estimatedPrice && <p><span className="font-medium">Cena:</span> {ride.estimatedPrice} Kč</p>}
                       </div>
                      <div className="mt-3 space-y-2">
                         <button
                           onClick={() => acceptRideSpecific(ride)}
                           className="w-full bg-green-600 hover:bg-green-700 py-3 rounded-lg btn-modern text-white font-bold text-lg shadow-lg"
                         >
                           ✅ Začít jízdu
                         </button>
                         <button
                           onClick={() => navigateToDestination(ride)}
                           className="w-full bg-purple-600 hover:bg-purple-700 py-2 rounded-lg btn-modern text-white font-medium"
                         >
                           🗺️ Navigovat ({preferredNavApp === 'google' ? 'Google Maps' : 'Mapy.cz'})
                         </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Current Ride */}
            {currentRide && (
               <div className="glass card-hover p-4 rounded-2xl border border-slate-700/50">
                 <div className="flex justify-between items-center mb-3">
                   <h2 className="text-lg font-semibold text-white">{t('dashboard.currentRide')}</h2>
                 {currentRide && currentRide.status === RideStatus.InProgress && (
                      <button
                        onClick={() => setShowCancelConfirmation(true)}
                        className="text-red-400 hover:text-red-300 text-sm font-normal px-2 py-1 rounded border border-red-800/30 hover:border-red-700/50 hover:bg-red-900/20 transition-colors"
                        title="Zrušit jízdu"
                      >
                        ❌ Zrušit
                      </button>
                    )}
                 </div>
                  <div className="space-y-2 text-slate-300">
                    <p><span className="font-medium">{t('dashboard.customer')}:</span> {currentRide.customerName}</p>
                    <p><span className="font-medium">{t('dashboard.phone')}:</span> <a href={`tel:${currentRide.customerPhone}`} className="text-blue-600 underline">{currentRide.customerPhone}</a></p>
                     <p><span className="font-medium">{t('dashboard.pickup')}:</span> {cleanAddress(currentRide.stops[0])}</p>
                     <p><span className="font-medium">{t('dashboard.destination')}:</span> {cleanAddress(currentRide.stops[currentRide.stops.length - 1])}</p>
                    <p><span className="font-medium">Počet pasažérů:</span> {currentRide.passengers}</p>
                    <p><span className="font-medium">{t('dashboard.status')}:</span> {currentRide.status}</p>
                  </div>

                 <div className="mt-4 space-y-2">
                      {currentRide && currentRide.status === RideStatus.Pending && (
                        <button onClick={acceptRide} className="w-full bg-green-600 hover:bg-green-700 py-2 rounded-lg btn-modern text-white font-medium">
                          Začít jízdu
                        </button>
                      )}
                      {currentRide && currentRide.status === RideStatus.Accepted && (
                        <div className="space-y-2">
                          <button onClick={startRide} className="w-full bg-blue-600 hover:bg-blue-700 py-2 rounded-lg btn-modern text-white font-medium">
                            {t('dashboard.startRide')}
                          </button>
                          <button onClick={() => navigateToDestination()} className="w-full bg-purple-600 hover:bg-purple-700 py-2 rounded-lg btn-modern text-white font-medium">
                            🗺️ Navigovat ({preferredNavApp === 'google' ? 'Google Maps' : 'Mapy.cz'})
                          </button>
                        </div>
                      )}
                         {currentRide && currentRide.status === RideStatus.InProgress && (
                          <div className="space-y-2">
                            <button onClick={endRide} className="w-full bg-red-600 hover:bg-red-700 py-2 rounded-lg btn-modern text-white font-medium">
                              {t('dashboard.completeRide')}
                            </button>
                             <button onClick={() => navigateToDestination()} className="w-full bg-purple-600 hover:bg-purple-700 py-2 rounded-lg btn-modern text-white font-medium">
                               🗺️ Navigovat ({preferredNavApp === 'google' ? 'Google Maps' : preferredNavApp === 'mapy' ? 'Mapy.cz' : 'Waze'})
                             </button>
                          </div>
                        )}
             </div>
           </div>
         )}



            {/* Ride History */}
            {showRideHistory && (
               <div className="glass card-hover p-4 rounded-2xl border border-slate-700/50">
                    <div className="flex justify-between items-center mb-3">
                      <h2 className="text-lg font-semibold text-white">{t('dashboard.recentRides')}</h2>
                      <button
                        onClick={() => setShowRideHistory(false)}
                        className="p-1 text-slate-400 hover:text-white hover:bg-slate-700 rounded transition-colors"
                        title="Zavřít historii jízd"
                      >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                 <div className="flex items-center space-x-2 mb-4">
                   <button
                     onClick={() => setHistoryFilter('2days')}
                     className={`px-3 py-1 text-xs rounded-full transition-colors ${
                       historyFilter === '2days'
                         ? 'bg-blue-600 text-white'
                         : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                     }`}
                   >
                     2 dny
                   </button>
                   <button
                     onClick={() => setHistoryFilter('week')}
                     className={`px-3 py-1 text-xs rounded-full transition-colors ${
                       historyFilter === 'week'
                         ? 'bg-blue-600 text-white'
                         : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                     }`}
                   >
                     Týden
                   </button>
                   <button
                     onClick={() => setHistoryFilter('month')}
                     className={`px-3 py-1 text-xs rounded-full transition-colors ${
                       historyFilter === 'month'
                         ? 'bg-blue-600 text-white'
                         : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                     }`}
                   >
                     Měsíc
                   </button>
                   <button
                     onClick={() => setHistoryFilter('all')}
                     className={`px-3 py-1 text-xs rounded-full transition-colors ${
                       historyFilter === 'all'
                         ? 'bg-blue-600 text-white'
                         : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                     }`}
                   >
                     Vše
                   </button>
                 </div>

                {filteredRideHistory.length > 0 ? (
                  <ul className="space-y-2">
                    {filteredRideHistory.map((ride) => (
                     <li key={ride.id} className="text-sm text-slate-300 bg-slate-800/30 rounded-lg p-2">
                       <div className="flex justify-between items-start">
                          <div>
                            <span className="font-medium text-white">{ride.customerName}</span>
                            <div className="text-xs text-slate-400">
                              {new Date(ride.timestamp).toLocaleDateString()} • {ride.status}
                              {ride.payment && (
                                <span className={`ml-2 px-1.5 py-0.5 rounded text-xs font-medium ${
                                  ride.payment === 'cash'
                                    ? 'bg-green-900/50 text-green-300 border border-green-700/50'
                                    : 'bg-blue-900/50 text-blue-300 border border-blue-700/50'
                                }`}>
                                  {ride.payment === 'cash' ? '💵 Hotovost' : '💳 Karta'}
                                </span>
                              )}
                            </div>
                          </div>
                          {ride.estimatedPrice && (
                            <div className="text-sm font-medium text-green-400">
                              {ride.estimatedPrice} Kč
                            </div>
                          )}
                       </div>
                     </li>
                   ))}
                 </ul>
               ) : (
                 <p className="text-sm text-slate-400 italic">
                   {historyFilter === '2days' && 'Žádné jízdy za poslední 2 dny'}
                   {historyFilter === 'week' && 'Žádné jízdy za poslední týden'}
                   {historyFilter === 'month' && 'Žádné jízdy za poslední měsíc'}
                   {historyFilter === 'all' && 'Žádné jízdy'}
                 </p>
               )}
             </div>
           )}

           {!showRideHistory && (
             <div className="glass card-hover p-4 rounded-2xl border border-slate-700/50">
               <div className="flex justify-between items-center">
                 <h2 className="text-lg font-semibold text-white">{t('dashboard.recentRides')}</h2>
                    <div className="flex items-center space-x-2">
                    <div className="text-sm text-slate-300">
                       {isShiftActive ? (
                         <>
                           <span className="font-medium">Tržba aktuální směny:</span> {currentShiftCash} Kč
                           <div className="text-xs text-slate-400 mt-1">
                             Od: {new Date(shiftStartTimestamp!).toLocaleTimeString('cs-CZ', {
                               hour: '2-digit',
                               minute: '2-digit'
                             })}
                           </div>
                         </>
                        ) : (
                         <>
                           <span className="font-medium">Tržba směny:</span> {shiftCash} Kč
                           {shiftEndTimestamp && shiftStartTimestamp ? (
                             <div className="text-xs text-slate-400 mt-1">
                               Od: {new Date(shiftStartTimestamp).toLocaleTimeString('cs-CZ', {
                                 hour: '2-digit',
                                 minute: '2-digit'
                               })} Do: {new Date(shiftEndTimestamp).toLocaleTimeString('cs-CZ', {
                                 hour: '2-digit',
                                 minute: '2-digit'
                               })}
                             </div>
                           ) : useCustomShift && customShiftStart && customShiftEnd && customShiftDate ? (
                             <div className="text-xs text-slate-400">
                               {new Date(customShiftDate).toLocaleDateString('cs-CZ')} • {customShiftStart} - {customShiftEnd}
                               <span className="text-xs text-slate-500 ml-1">(přes půlnoc)</span>
                             </div>
                           ) : null}
                         </>
                       )}
                    </div>
                   <button
                     onClick={() => setShowRideHistory(true)}
                     className="p-1 text-slate-400 hover:text-white hover:bg-slate-700 rounded transition-colors"
                     title="Show ride history"
                   >
                     <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                       <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                       <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                     </svg>
                   </button>
                 </div>
               </div>
              </div>
            )}

            {/* Shift Management and Status - Bottom of Operations Card */}
            <div className="glass card-hover p-4 rounded-2xl border border-slate-700/50">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-white">Směna a stav</h2>
                <div className="text-xs text-slate-400">
                  {isShiftActive ? 'Aktivní' : 'Neaktivní'}
                </div>
              </div>

              <div className="space-y-4">
                {/* Shift Button */}
                 <button
                   onClick={() => {
                     if (!isShiftActive && localStorage.getItem('shiftStartOdo')) {
                       // Start shift directly with stored odometer
                       handleStartShift(parseFloat(localStorage.getItem('shiftStartOdo')!));
                     } else {
                       setShowShiftModal(true);
                     }
                   }}
                   className={`w-full py-3 rounded-lg btn-modern text-white font-bold text-lg shadow-lg ${
                     isShiftActive
                       ? 'bg-red-600 hover:bg-red-700'
                       : 'bg-green-600 hover:bg-green-700'
                   }`}
                 >
                   {isShiftActive ? '🏁 Ukončit směnu' : '🚗 Začít směnu'}
                 </button>

                {/* Status Selector */}
                <div>
                  <label className="block text-sm font-medium mb-2 text-slate-300">Stav řidiče</label>
                  <select
                    value={driverStatus}
                    onChange={(e) => updateVehicleStatus(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white focus:ring-2 focus:ring-primary focus:border-primary"
                  >
                   {isShiftActive && <option value="available">{t('dashboard.available')}</option>}
                   {isShiftActive && <option value="on_ride">{t('dashboard.onRide')}</option>}
                   {isShiftActive && (
                     <>
                       <option value="break_10">Pauza 10 min</option>
                       <option value="break_20">Pauza 20 min</option>
                       <option value="break_30">Pauza 30 min</option>
                       <option value="break_60">Pauza 1 hod</option>
                       <option value="pause">{t('dashboard.pause')}</option>
                       <option value="refueling">{t('dashboard.refueling')}</option>
                     </>
                   )}
                   <option value="offline">{t('dashboard.offline')}</option>
                  </select>
                  {driverStatus === 'break' && breakEndTime && (
                    <div className="mt-2 text-sm text-warning">
                      {t('dashboard.breakEndsIn')}: {Math.max(0, Math.ceil((breakEndTime - Date.now()) / (1000 * 60)))} min
                    </div>
                  )}
                </div>
              </div>
            </div>
           </div>
         )}

        {/* Shifts Card */}
        {activeCard === 'shifts' && (
          <div className="space-y-6">
            {/* Shift Planning Card */}
            <div className="glass card-hover p-4 rounded-2xl border border-slate-700/50">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-white">Plánování směn</h2>
                <button
                  onClick={() => {
                    setEditingShift(undefined);
                    setShowShiftPlanningModal(true);
                  }}
                  className="p-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-white transition-colors"
                  title="Přidat novou směnu"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                </button>
              </div>

              {/* Current Driver Info - No selection in driver app */}
              <div className="mb-4 p-3 bg-slate-800/50 rounded-lg border border-slate-700/50">
                <div className="text-white/80 text-sm">
                  <span className="font-medium">Řidič:</span> {selectedDriver?.name || driverInfo?.name || 'Nezadáno'}
                  <div className="text-xs text-slate-400 mt-1">
                    Selected: {selectedDriver?.id} | Info: {driverInfo?.id}
                  </div>
                </div>
              </div>

              {/* View Mode Toggle */}
              <div className="flex items-center justify-center mb-4">
                <div className="flex rounded-lg bg-slate-800/50 p-1 border border-slate-700/50">
                  <button
                    onClick={() => setShiftViewMode('calendar')}
                    className={`flex items-center space-x-2 px-3 py-2 rounded-md text-sm font-medium transition-all duration-200 ${
                      shiftViewMode === 'calendar'
                        ? 'bg-blue-600 text-white shadow-lg'
                        : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
                    }`}
                  >
                    <span>📅 Kalendář</span>
                  </button>
                  <button
                    onClick={() => setShiftViewMode('list')}
                    className={`flex items-center space-x-2 px-3 py-2 rounded-md text-sm font-medium transition-all duration-200 ${
                      shiftViewMode === 'list'
                        ? 'bg-blue-600 text-white shadow-lg'
                        : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
                    }`}
                  >
                    <span>📋 Seznam</span>
                  </button>
                </div>
              </div>

              {shiftViewMode === 'calendar' ? (
                <ShiftCalendar
                  shiftPlans={shiftPlans}
                  onDateSelect={handleDateSelect}
                  onShiftClick={handleShiftClick}
                  selectedDate={selectedDate}
                />
              ) : (
                /* List View */
                <div className="space-y-2">
                  {shiftPlans.length > 0 ? (
                    <>
                      {/* Header */}
                      <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-slate-800 rounded-lg text-xs font-medium text-slate-300 border-b border-slate-700">
                        <div className="col-span-2">Datum</div>
                        <div className="col-span-2">Začátek</div>
                        <div className="col-span-2">Konec</div>
                        <div className="col-span-3">Stav</div>
                        <div className="col-span-3">Akce</div>
                      </div>

                      {/* Shifts */}
                      {shiftPlans.map((shift) => (
                        <div
                          key={shift.id}
                          className="grid grid-cols-12 gap-2 px-3 py-3 bg-slate-800/50 rounded-lg border border-slate-700 hover:bg-slate-800/70 transition-colors"
                        >
                          {/* Date */}
                          <div className="col-span-2">
                            <div className="text-xs text-slate-300">
                              {format(new Date(shift.plannedStart), 'd.M.', { locale: cs })}
                            </div>
                            <div className="text-xs text-slate-400">
                              {format(new Date(shift.plannedStart), 'yyyy', { locale: cs })}
                            </div>
                          </div>

                          {/* Start Time */}
                          <div className="col-span-2">
                            <div className="text-xs text-slate-300">
                              {format(new Date(shift.plannedStart), 'HH:mm', { locale: cs })}
                            </div>
                          </div>

                          {/* End Time */}
                          <div className="col-span-2">
                            <div className="text-xs text-slate-300">
                              {format(new Date(shift.plannedEnd), 'HH:mm', { locale: cs })}
                            </div>
                          </div>

                          {/* Status */}
                          <div className="col-span-3">
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
                              onClick={() => {
                                setEditingShift(shift);
                                setShowShiftPlanningModal(true);
                              }}
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
                    </>
                  ) : (
                    <div className="text-center py-8">
                      <svg className="w-12 h-12 text-gray-500 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      <h3 className="text-lg font-medium text-white mb-2">
                        Žádné směny
                      </h3>
                      <p className="text-gray-400 mb-4">
                        Zatím nemáte naplánované žádné směny.
                      </p>
                      <button
                        onClick={() => {
                          setEditingShift(undefined);
                          setShowShiftPlanningModal(true);
                        }}
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
              )}
            </div>
          </div>
        )}

        {/* Chat Card */}
        {activeCard === 'chat' && (
          <div className="space-y-6">
            <div className="glass card-hover p-4 rounded-2xl border border-slate-700/50">
          <StreamChatDriver
            vehicleNumber={vehicleNumber || 0}
            driverName={driverInfo?.name || `Driver ${vehicleNumber}`}
            otherDrivers={otherDrivers}
            resetToDispatcher={chatCardActivated}
            key={`chat-${vehicleNumber}`} // Stable key to prevent unnecessary re-mounts
          />
            </div>
          </div>
        )}

        {/* Settings Card */}
        {activeCard === 'settings' && (
          <div className="space-y-6">
            {/* Navigation Settings */}
            <div className="glass card-hover p-4 rounded-2xl border border-slate-700/50">
              <h2 className="text-lg font-semibold mb-3 text-white">Nastavení navigace</h2>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Preferovaná navigační aplikace
                  </label>
                    <div className="grid grid-cols-3 gap-2">
                       <button
                         onClick={() => {
                           setPreferredNavApp('google');
                           localStorage.setItem('preferredNavApp', 'google');
                         }}
                         className={`py-2 px-3 rounded-lg btn-modern text-white font-medium text-sm ${
                           preferredNavApp === 'google'
                             ? 'bg-blue-600 hover:bg-blue-700'
                             : 'bg-slate-700 hover:bg-slate-600'
                         }`}
                       >
                         Google Maps
                       </button>
                       <button
                         onClick={() => {
                           setPreferredNavApp('mapy');
                           localStorage.setItem('preferredNavApp', 'mapy');
                         }}
                         className={`py-2 px-3 rounded-lg btn-modern text-white font-medium text-sm ${
                           preferredNavApp === 'mapy'
                             ? 'bg-green-600 hover:bg-green-700'
                             : 'bg-slate-700 hover:bg-slate-600'
                         }`}
                       >
                         Mapy.cz
                       </button>
                       <button
                         onClick={() => {
                           setPreferredNavApp('waze');
                           localStorage.setItem('preferredNavApp', 'waze');
                         }}
                         className={`py-2 px-3 rounded-lg btn-modern text-white font-medium text-sm ${
                           preferredNavApp === 'waze'
                             ? 'bg-purple-600 hover:bg-purple-700'
                             : 'bg-slate-700 hover:bg-slate-600'
                         }`}
                       >
                         Waze
                       </button>
                    </div>
                 </div>
              </div>
            </div>

            {/* Shift Time Settings */}
            <div className="glass card-hover p-4 rounded-2xl border border-slate-700/50">
              <h2 className="text-lg font-semibold mb-3 text-white">Nastavení směny</h2>
              <div className="space-y-3">
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="useCustomShift"
                    checked={useCustomShift}
                    onChange={(e) => {
                      const enabled = e.target.checked;
                      setUseCustomShift(enabled);
                      localStorage.setItem('useCustomShift', enabled.toString());
                      // Recalculate cash when switching modes
                      if (rideHistory.length > 0) {
                        const shiftCashAmount = calculateShiftCash(rideHistory, shiftStartTime || undefined);
                        setShiftCash(shiftCashAmount);
                      }
                    }}
                    className="w-4 h-4 text-blue-600 bg-slate-700 border-slate-600 rounded focus:ring-blue-500"
                  />
                  <label htmlFor="useCustomShift" className="text-sm font-medium text-slate-300">
                    Použít vlastní časové rozmezí pro výpočet tržby
                  </label>
                </div>

                {useCustomShift && (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-1">
                        Datum směny
                      </label>
                      <input
                        type="date"
                        value={customShiftDate}
                        onChange={(e) => {
                          setCustomShiftDate(e.target.value);
                          localStorage.setItem('customShiftDate', e.target.value);
                        }}
                        className="w-full bg-slate-700 border border-slate-600 rounded-md py-2 px-3 text-white focus:ring-2 focus:ring-primary focus:border-primary"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1">
                          Začátek směny
                        </label>
                        <input
                          type="time"
                          value={customShiftStart}
                          onChange={(e) => {
                            setCustomShiftStart(e.target.value);
                            localStorage.setItem('customShiftStart', e.target.value);
                          }}
                          className="w-full bg-slate-700 border border-slate-600 rounded-md py-2 px-3 text-white focus:ring-2 focus:ring-primary focus:border-primary"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1">
                          Konec směny
                        </label>
                        <input
                          type="time"
                          value={customShiftEnd}
                          onChange={(e) => {
                            setCustomShiftEnd(e.target.value);
                            localStorage.setItem('customShiftEnd', e.target.value);
                          }}
                          className="w-full bg-slate-700 border border-slate-600 rounded-md py-2 px-3 text-white focus:ring-2 focus:ring-primary focus:border-primary"
                        />
                      </div>
                    </div>
                  </div>
                )}

                  <div className="text-xs text-slate-400">
                    {useCustomShift
                      ? "Tržba se počítá pouze z jízd dokončených v zadaném časovém rozmezí pro vybraný den."
                      : "Tržba se počítá od okamžiku přihlášení do odhlášení."
                    }
                  </div>
                </div>
            </div>

            {/* System Status */}
            <div className="glass card-hover p-4 rounded-2xl border border-slate-700/50">
              <h2 className="text-lg font-semibold mb-4 text-white">Stav systému</h2>
              <div className="space-y-4">
                {/* GPS Status */}
                {isShiftActive && (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <div className={`w-2 h-2 rounded-full ${location ? 'bg-green-400' : 'bg-red-400'}`}></div>
                      <span className="text-sm text-slate-300">GPS</span>
                    </div>
                    <div className="text-xs text-slate-400">
                      {location ? (
                        <>
                          {lastLocationUpdate ? `${Math.floor((Date.now() - lastLocationUpdate) / 1000)}s ago` : 'Active'}
                        </>
                      ) : (
                        'No signal'
                      )}
                    </div>
                  </div>
                )}

                {/* Network Status */}
                <div className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full ${isOnline ? 'bg-green-400' : 'bg-red-400'}`}></div>
                  <span className="text-xs text-slate-400">
                    {isOnline ? 'Online' : 'Offline'}
                  </span>
                </div>

                {/* Real-time Connection Status */}
                <div className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full ${
                    realtimeConnectionStatus === 'connected' ? 'bg-blue-400' :
                    realtimeConnectionStatus === 'connecting' ? 'bg-yellow-400' :
                    'bg-red-400'
                  }`}></div>
                  <span className="text-xs text-slate-400">
                    Real-time: {
                      realtimeConnectionStatus === 'connected' ? 'Connected' :
                      realtimeConnectionStatus === 'connecting' ? 'Connecting...' :
                      'Disconnected'
                    }
                  </span>
                </div>

                {/* Navigation Mode Indicator */}
                {navigationActive && (
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-orange-400 animate-pulse"></div>
                    <span className="text-xs text-orange-400">
                      Navigation Mode (10s updates)
                    </span>
                  </div>
                )}

                {/* Background Sync Status */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`w-3 h-3 rounded-full ${
                      syncStatus === 'syncing' ? 'bg-blue-400 animate-pulse' :
                      syncStatus === 'success' ? 'bg-green-400' :
                      syncStatus === 'error' ? 'bg-red-400' :
                      'bg-gray-400'
                    }`}></div>
                    <span className="text-xs text-slate-400">
                      Sync: {
                        syncStatus === 'syncing' ? 'Syncing...' :
                        syncStatus === 'success' ? 'Synced' :
                        syncStatus === 'error' ? 'Sync failed' :
                        queuedDataCount > 0 ? `${queuedDataCount} queued` :
                        'Idle'
                      }
                    </span>
                  </div>
                  {queuedDataCount > 0 && (
                    <button
                      onClick={async () => {
                        setSyncStatus('syncing');
                        try {
                          await requestBackgroundSync();
                          setSyncStatus('success');
                          setTimeout(() => updateSyncStatus(), 1000);
                        } catch (error) {
                          console.error('Manual sync failed:', error);
                          setSyncStatus('error');
                          setTimeout(() => updateSyncStatus(), 3000);
                        }
                      }}
                      className="text-xs bg-blue-600 hover:bg-blue-700 px-2 py-1 rounded text-white"
                      disabled={syncStatus === 'syncing'}
                    >
                      {syncStatus === 'syncing' ? 'Syncing...' : 'Sync Now'}
                    </button>
                  )}
                </div>

                {/* Notification Permission Indicator */}
                {notificationPermission !== 'granted' && (
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-yellow-400"></div>
                    <span className="text-xs text-yellow-400">
                      Upozornění: Povolte notifikace pro lepší zážitek
                    </span>
                    <button
                      onClick={async () => {
                        console.log('Requesting notification permission, current status:', Notification.permission);
                        try {
                          if ('Notification' in window) {
                            const permission = await Notification.requestPermission();
                            console.log('Permission result:', permission);
                            setNotificationPermission(permission);

                            if (permission === 'granted') {
                              console.log('Permission granted, setting up push notifications');
                              // Try to register for push notifications
                              try {
                                const registration = await navigator.serviceWorker.ready;
                                const subscription = await registration.pushManager.subscribe({
                                  userVisibleOnly: true,
                                  applicationServerKey: undefined
                                });
                                console.log('Push subscription created:', subscription ? 'success' : 'failed');
                              } catch (pushError) {
                                console.warn('Push subscription failed:', pushError);
                              }
                            }
                          } else {
                            console.warn('Notifications not supported');
                            setNotificationPermission('denied');
                          }
                        } catch (error) {
                          console.error('Error requesting permission:', error);
                          setNotificationPermission('denied');
                        }
                      }}
                      className="text-xs bg-yellow-600 hover:bg-yellow-700 px-2 py-1 rounded text-white"
                    >
                      Povolit
                    </button>
                  </div>
                )}

                {/* Screen Wake Lock Indicator */}
                {isWakeLockSupported() && (
                  <div className="flex items-center gap-2">
                    <div className={`w-3 h-3 rounded-full ${wakeLockActive ? 'bg-green-400' : 'bg-gray-400'}`}></div>
                    <span className="text-xs text-slate-400">
                      {wakeLockActive ? 'Obrazovka zůstane zapnutá' : 'Obrazovka se může vypnout'}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Location */}
            <div className="glass card-hover p-4 rounded-2xl border border-slate-700/50">
              <label className="block text-sm font-medium mb-2 text-slate-300">{t('dashboard.currentLocation')}</label>
              <p className="text-slate-300">
                {location ? `${location.lat.toFixed(6)}, ${location.lng.toFixed(6)}` : t('dashboard.locationNotAvailable')}
              </p>
                {location && lastLocationUpdate && (
                  <p className="text-xs text-slate-400 mt-1">
                    Last updated: {new Date(lastLocationUpdate).toLocaleTimeString()}
                  </p>
                )}
            </div>

            {/* Gamification Button */}
            <div className="glass card-hover p-4 rounded-2xl border border-slate-700/50">
              <button
                onClick={() => setShowNotificationSettingsModal(true)}
                className="w-full py-3 rounded-lg btn-modern text-white font-bold text-lg shadow-lg bg-slate-700 hover:bg-slate-600"
              >
                ⚙️ Nastavení notifikací
              </button>
              <button
                onClick={() => testNotifications()}
                className="w-full py-2 rounded-lg btn-modern text-white font-medium bg-purple-600 hover:bg-purple-700"
              >
                🧪 Testovat notifikace
              </button>
              <p className="text-xs text-slate-400 mt-2 text-center">
                Zobrazit skóre, achievement a pořadí řidičů
              </p>
            </div>

            {/* Notification Settings */}
            <div className="glass card-hover p-4 rounded-2xl border border-slate-700/50">
              <button
                onClick={() => setShowNotificationSettingsModal(true)}
                className="w-full flex items-center justify-center space-x-2 py-2 text-slate-300 hover:text-white transition-colors"
              >

                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-5 5v-5zM4.868 12.683A17.925 17.925 0 012 21h13.78a3.08 3.08 0 01-.46-1.61c0-1.77.73-3.4 1.94-4.59L4.868 12.683z" />
                </svg>
                <span className="text-sm">Nastavení notifikací</span>
              </button>
            </div>
          </div>
        )}

        {/* Manual Ride Modal */}
        {showManualRideModal && vehicleNumber && (
             <ManualRideModal
               onClose={() => setShowManualRideModal(false)}
               vehicleNumber={vehicleNumber}
               licensePlate={licensePlate}
               onRideAdded={handleManualRideAdded}
               onNavigateToDestination={navigateToDestination}
               preferredNavApp={preferredNavApp}
               currentLocation={location}
               currentRide={currentRide}
             />
        )}

         {/* Ride Completion Modal */}
         {showCompletionModal && rideToComplete && vehicleNumber && (
           <RideCompletionModal
             onClose={() => {
               setShowCompletionModal(false);
               setRideToComplete(null);
             }}
             ride={rideToComplete}
             vehicleNumber={vehicleNumber}
               onRideCompleted={handleRideCompleted}
               socket={socket}
               socketConnected={socketConnected}
           />
          )}

         {/* Gamification Modal */}
          <GamificationModal
            isOpen={showGamificationModal}
            onClose={() => setShowGamificationModal(false)}
            driverId={driverInfo?.id || vehicleNumber || 0}
            driverName={driverInfo?.name || licensePlate || `Vehicle ${vehicleNumber}`}
          />

        {/* Cancel Ride Confirmation Modal */}
        {showCancelConfirmation && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-slate-800 p-6 rounded-2xl border border-slate-700 max-w-sm mx-4">
              <h3 className="text-lg font-semibold text-white mb-4">Potvrdit zrušení jízdy</h3>
              <p className="text-slate-300 mb-6">
                Opravdu chcete zrušit tuto jízdu? Tato akce je nevratná.
              </p>
              <div className="flex space-x-3">
                <button
                  onClick={() => setShowCancelConfirmation(false)}
                  className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-white font-medium transition-colors"
                >
                  Zrušit
                </button>
                <button
                  onClick={async () => {
                    setShowCancelConfirmation(false);
                    await cancelRide();
                  }}
                  className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg text-white font-medium transition-colors"
                >
                  Potvrdit zrušení
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Shift Modal */}
        <ShiftModal
          isOpen={showShiftModal}
          onClose={() => setShowShiftModal(false)}
          onStartShift={handleStartShift}
          onEndShift={handleEndShift}
          isShiftActive={isShiftActive}
          currentOdo={shiftStartOdo}
          vehicleMileage={vehicles.find(v => v.id === vehicleNumber)?.mileage}
        />

        {/* Notification Settings Modal */}
        <NotificationSettingsModal
          isOpen={showNotificationSettingsModal}
          onClose={() => setShowNotificationSettingsModal(false)}
        />

        {/* Shift Planning Modal */}
        <ShiftPlanningModal
          isOpen={showShiftPlanningModal}
          onClose={() => {
            setShowShiftPlanningModal(false);
            setEditingShift(undefined);
          }}
          onSave={handleCreateShift}
          onUpdate={handleUpdateShift}
          editingShift={editingShift}
          driverId={selectedDriver?.id || driverInfo?.id}
          isDispatcher={!selectedDriver && !driverInfo} // Act as dispatcher when no driver selected
        />

         {/* Large Card Switch at Bottom */}
         <div className="fixed bottom-0 left-0 right-0 bg-slate-900/95 backdrop-blur-sm border-t border-slate-700/50 p-4">
           <div className="max-w-md mx-auto">
             <div className="flex rounded-2xl bg-slate-800/50 p-1 border border-slate-700/50">
                <button
                  onClick={() => setActiveCard('operations')}
                  className={`flex-1 py-3 px-4 rounded-xl text-xs font-medium transition-all duration-200 ${
                    activeCard === 'operations'
                      ? 'bg-blue-600 text-white shadow-lg'
                      : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
                  }`}
                >
                  <div className="flex flex-col items-center space-y-1">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                    </svg>
                    <span>Jízdy</span>
                  </div>
                </button>
               <button
                 onClick={() => setActiveCard('shifts')}
                 className={`flex-1 py-3 px-4 rounded-xl text-xs font-medium transition-all duration-200 ${
                   activeCard === 'shifts'
                     ? 'bg-blue-600 text-white shadow-lg'
                     : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
                 }`}
               >
                 <div className="flex flex-col items-center space-y-1">
                   <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                     <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                   </svg>
                   <span>Směny</span>
                 </div>
               </button>
              <button
                onClick={() => {
                  setActiveCard('chat');
                  setChatCardActivated(Date.now());
                }}
                className={`flex-1 py-3 px-4 rounded-xl text-xs font-medium transition-all duration-200 ${
                  activeCard === 'chat'
                    ? 'bg-blue-600 text-white shadow-lg'
                    : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
                }`}
              >
                <div className="flex flex-col items-center space-y-1">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                  <span>Chat</span>
                </div>
              </button>
              <button
                onClick={() => setActiveCard('settings')}
                className={`flex-1 py-3 px-4 rounded-xl text-xs font-medium transition-all duration-200 ${
                  activeCard === 'settings'
                    ? 'bg-blue-600 text-white shadow-lg'
                    : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
                }`}
              >
                <div className="flex flex-col items-center space-y-1">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <span>Nastavení</span>
                </div>
              </button>
            </div>
          </div>
          </div>
          </div>

        </div>
         );
};

export default Dashboard;
