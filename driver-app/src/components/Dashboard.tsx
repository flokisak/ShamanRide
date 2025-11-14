import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase, authService, geocodeAddress, SUPABASE_ENABLED } from '../supabaseClient';
import { supabaseService, startAuthKeepAlive, stopAuthKeepAlive } from '../supabaseClient';
import { SUPABASE_ENABLED as SUPABASE_ENABLED_SERVICES } from '../supabaseClient';
import { persistRide } from '../utils/syncService';
import { RideLog, RideStatus } from '../types';
import { useTranslation } from '../contexts/LanguageContext';
import { useAuth } from '../AuthContext';
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
import { ShiftPlanningService } from '../../../services/shiftPlanningService';
import { ShiftPlan, ShiftPlanStatus, RecurringPattern } from '../../../types';

import io from 'socket.io-client';
import { safeGetAccessToken, getCachedAccessToken } from '../supabaseClient';

const Dashboard: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const watchIdRef = useRef<number | null>(null);
  const locationIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const [driverStatus, setDriverStatus] = useState('offline');
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
  const [historyFilter, setHistoryFilter] = useState<'2days' | 'week' | 'month' | 'all'>('all');
  const [licensePlate, setLicensePlate] = useState<string>('');
  const [otherDrivers, setOtherDrivers] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [wakeLockActive, setWakeLockActive] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>('default');
   const [isOnline, setIsOnline] = useState(navigator.onLine);
   const [realtimeConnectionStatus, setRealtimeConnectionStatus] = useState<'connected' | 'connecting' | 'disconnected'>('disconnected');
   const [lastAcceptedRideId, setLastAcceptedRideId] = useState<string | null>(null);
   const [lastAcceptTime, setLastAcceptTime] = useState<number>(0);
    const [refreshTrigger, setRefreshTrigger] = useState(0);
    const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'success' | 'error'>('idle');
    const [queuedDataCount, setQueuedDataCount] = useState(0);
  const [vehicles, setVehicles] = useState<any[]>([]);
     const [driverInfo, setDriverInfo] = useState<{id: number, name: string} | null>(null);
    const [flashingRides, setFlashingRides] = useState<Set<string>>(new Set());
      const [activeCard, setActiveCard] = useState<'operations' | 'chat' | 'settings' | 'shifts'>('operations');
     const [chatCardActivated, setChatCardActivated] = useState<number>(0);
     
     // Shift planning state
     const [showShiftPlanningModal, setShowShiftPlanningModal] = useState(false);
     const [editingShift, setEditingShift] = useState<ShiftPlan | undefined>(undefined);
     const [shiftPlans, setShiftPlans] = useState<ShiftPlan[]>([]);
     const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
     const [shiftPlanningService, setShiftPlanningService] = useState<ShiftPlanningService | null>(null);

  // Driver-specific sync function using driver app's socket
  const syncUpdateVehicles = useCallback(async (updatedVehicles: any[], options?: any) => {
    console.log('syncUpdateVehicles called with vehicles:', updatedVehicles.map(v => ({ id: v.id, shiftStartOdo: v.shiftStartOdo, shiftEndOdo: v.shiftEndOdo, mileage: v.mileage })));
    try {
      if (socket && socketConnected) {
        console.log('Sending vehicle update via socket, socket connected:', socketConnected);
        socket.emit('vehicles_update', { shiftId: `driver_shift_${vehicleNumber}`, vehicles: updatedVehicles, options });
        console.log('Vehicle update sent via driver socket');
        return { via: 'socket' };
      } else {
        console.log('Socket not available, using Supabase fallback');
        await supabaseService.updateVehicles(updatedVehicles, options);
        console.log('Vehicle update sent via Supabase (socket not available)');
        return { via: 'supabase' };
      }
    } catch (err) {
      console.warn('Socket update failed, falling back to Supabase:', err);
      try {
        await supabaseService.updateVehicles(updatedVehicles, options);
        return { via: 'supabase', error: err };
      } catch (err2) {
        console.error('Both socket and Supabase updates failed:', err2);
        return { via: 'failed', error: err2 };
      }
    }
  }, [socket, socketConnected, vehicleNumber]);

  // Update sync status and queued data count
  const updateSyncStatus = useCallback(() => {
    try {
      const cachedLocations = localStorage.getItem('cached-locations');
      const pendingMessages = localStorage.getItem('pending-messages');
      const pendingUpdates = localStorage.getItem('pending-ride-updates');

      const locationsCount = cachedLocations ? JSON.parse(cachedLocations).length : 0;
      const messagesCount = pendingMessages ? JSON.parse(pendingMessages).length : 0;
      const updatesCount = pendingUpdates ? JSON.parse(pendingUpdates).length : 0;

      const totalQueued = locationsCount + messagesCount + updatesCount;
      setQueuedDataCount(totalQueued);

      console.log('Sync status update:', {
        locations: locationsCount,
        messages: messagesCount,
        updates: updatesCount,
        total: totalQueued,
        currentStatus: syncStatus
      });

      // Update sync status to idle if no queued data and not currently syncing
      if (totalQueued === 0 && syncStatus !== 'syncing') {
        setSyncStatus('idle');
      }
    } catch (error) {
      console.error('Error updating sync status:', error);
      setQueuedDataCount(0);
    }
  }, [syncStatus]);

  // Set up background sync status callback
  useEffect(() => {
    backgroundSyncManager.setStatusCallback({
      onSyncStart: (tag) => {
        console.log('Sync started:', tag);
        setSyncStatus('syncing');
      },
      onSyncSuccess: (tag) => {
        console.log('Sync completed:', tag);
        setSyncStatus('success');
        updateSyncStatus();
        setTimeout(() => setSyncStatus('idle'), 3000);
      },
      onSyncError: (tag, error) => {
        console.error('Sync failed:', tag, error);
        setSyncStatus('error');
        setTimeout(() => updateSyncStatus(), 3000);
      }
    });
  }, [updateSyncStatus]);

  // Load ride data for the current vehicle
  const loadRideData = useCallback(async (vehicleId: number) => {
    try {
      console.log('Loading ride data for vehicle:', vehicleId);
      const [currentRides, pendingRidesData, rideHistoryData] = await Promise.all([
        supabaseService.getRideLogsByVehicle(vehicleId, 'in_progress', 1),
        supabaseService.getRideLogsByVehicle(vehicleId, 'pending', 10),
        supabaseService.getRideLogsByVehicle(vehicleId, undefined, 100)
      ]);

      setCurrentRide(currentRides[0] || null);
      setPendingRides(pendingRidesData);
      setRideHistory(rideHistoryData);

      // Note: Driver status is now only changed by manual driver actions
      // Automatic status changes based on rides have been removed

      console.log('Ride data loaded successfully');
    } catch (error) {
      console.error('Error loading ride data:', error);
    }
  }, [driverStatus]);

  // Refresh vehicle data
  const refreshVehicleData = useCallback(async () => {
    if (!vehicleNumber) return;

    try {
      console.log('Refreshing vehicle data for vehicle:', vehicleNumber);
      await loadRideData(vehicleNumber);

      // Also refresh vehicle info
      const vehicles = await supabaseService.getVehicles();
      const vehicle = vehicles.find(v => v.id === vehicleNumber);
      if (vehicle) {
        setLicensePlate(vehicle.licensePlate || '');
      }
    } catch (error) {
      console.error('Error refreshing vehicle data:', error);
    }
  }, [vehicleNumber, loadRideData]);

  // Initialize vehicle number when user changes
  useEffect(() => {
    const initializeVehicle = async () => {
      if (!user || !user.email) {
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

        console.log('Looking for vehicle with email:', user.email);
        console.log('Available vehicles:', vehiclesData.map(v => ({ id: v.id, email: v.email, name: v.name, licensePlate: v.licensePlate, mileage: v.mileage, driverId: v.driverId })));

        // Find the vehicle that matches this authenticated user's email
        const assignedVehicle = vehiclesData.find(v => v.email === user.email);

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

        // Get driver info from people table using authenticated user's email
        const driver = peopleData.find(p => p.phone === user.email || p.email === user.email);
        if (driver) {
          setDriverInfo({ id: driver.id, name: driver.name });
          console.log('Driver info from people table:', driver.id, driver.name);
        } else {
          console.warn('Driver not found for email:', user.email);
          console.warn('Available people:', peopleData.map(p => ({ id: p.id, name: p.name, phone: p.phone, email: p.email })));
          setDriverInfo(null);
        }

        // Load shift start/end timestamps from database if available
        if (assignedVehicle.shiftStart) {
          const shiftStartDate = new Date(assignedVehicle.shiftStart);
          if (!isNaN(shiftStartDate.getTime())) {
            const shiftStartTimeVal = shiftStartDate.getTime();
            setShiftStartTimestamp(shiftStartTimeVal);
            localStorage.setItem('shiftStartTime', shiftStartTimeVal.toString());
            console.log('Loaded shift start from database:', new Date(shiftStartTimeVal).toLocaleString());
          } else {
            console.warn('Invalid shift start date from database:', assignedVehicle.shiftStart);
          }
        }

        if (assignedVehicle.shiftEnd) {
          const shiftEndDate = new Date(assignedVehicle.shiftEnd);
          if (!isNaN(shiftEndDate.getTime())) {
            const shiftEndTimeVal = shiftEndDate.getTime();
            setShiftEndTimestamp(shiftEndTimeVal);
            localStorage.setItem('shiftEndTime', shiftEndTimeVal.toString());
            console.log('Loaded shift end from database:', new Date(shiftEndTimeVal).toLocaleString());
          } else {
            console.warn('Invalid shift end date from database:', assignedVehicle.shiftEnd);
          }
        }

        // Load shift odometer readings from database
        if (assignedVehicle.shiftStartOdo !== null && assignedVehicle.shiftStartOdo !== undefined) {
          setShiftStartOdo(assignedVehicle.shiftStartOdo);
          localStorage.setItem('shiftStartOdo', assignedVehicle.shiftStartOdo.toString());
          console.log('Loaded shift start odometer from database:', assignedVehicle.shiftStartOdo);
        }
        if (assignedVehicle.shiftEndOdo !== null && assignedVehicle.shiftEndOdo !== undefined) {
          setShiftEndOdo(assignedVehicle.shiftEndOdo);
          localStorage.setItem('shiftEndOdo', assignedVehicle.shiftEndOdo.toString());
          console.log('Loaded shift end odometer from database:', assignedVehicle.shiftEndOdo);
        }

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
      } else {
          console.warn('No vehicle found with email:', user.email);
          console.warn('Available vehicle emails:', vehicles.map(v => v.email).filter(Boolean));
          setError('No vehicle assigned to this driver account. Please contact your dispatcher.');
          setVehicleNumber(null);
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
  }, [user]);



  // Load other drivers for chat functionality
  useEffect(() => {
    const loadOtherDrivers = async () => {
      try {
        const vehicles = await supabaseService.getVehicles();
        const drivers = vehicles
          .filter(v => v.id !== vehicleNumber)
          .map(v => ({ id: v.id, name: v.name || `Vehicle ${v.id}` }));
        setOtherDrivers(drivers);
      } catch (error) {
        console.error('Error loading other drivers:', error);
      }
    };

    if (vehicleNumber) {
      loadOtherDrivers();
    }
  }, [vehicleNumber]);

  // Initialize notifications
  useEffect(() => {
    const init = async () => {
      if (user?.id) {
        console.log('Initializing notifications for user:', user.id);

        // Initialize comprehensive notifications (permissions, push, wake lock)
        const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY; // Add this to .env when available
        await initializeNotifications(user.id, vapidKey);

        // Update permission status
        if ('Notification' in window) {
          setNotificationPermission(Notification.permission);
        } else {
          setNotificationPermission('denied');
        }
      }
    };
    init();
  }, [user?.id]);

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

  // Monitor online status
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      // Trigger background sync when coming back online
      requestBackgroundSync();
      updateSyncStatus();
    };
    const handleOffline = () => {
      setIsOnline(false);
      updateSyncStatus();
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Update sync status periodically
    const syncStatusInterval = setInterval(updateSyncStatus, 10000); // Every 10 seconds

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(syncStatusInterval);
    };
  }, [updateSyncStatus]);

    // Calculate shift cash from completed rides within shift time range
  const calculateShiftCash = (rides: RideLog[], shiftStart?: number, shiftEnd?: number) => {
    if (useCustomShift && customShiftStart && customShiftEnd && customShiftDate) {
      // Use custom shift times for selected date
      const [startHours, startMinutes] = customShiftStart.split(':').map(Number);
      const [endHours, endMinutes] = customShiftEnd.split(':').map(Number);

      // Parse the selected date
      const shiftDate = new Date(customShiftDate + 'T00:00:00');

      // Create shift start time for the selected date
      const shiftStartTime = new Date(shiftDate);
      shiftStartTime.setHours(startHours, startMinutes, 0, 0);

      // Create shift end time - if end time is before start time, it's next day
      const shiftEndTime = new Date(shiftDate);
      shiftEndTime.setHours(endHours, endMinutes, 0, 0);

      if (shiftEndTime <= shiftStartTime) {
        shiftEndTime.setDate(shiftEndTime.getDate() + 1);
      }

      return rides.filter(ride => {
        if (ride.status !== RideStatus.Completed) return false;

        const rideTime = new Date(ride.timestamp).getTime();

        // Check if ride falls within the selected shift time window
        return rideTime >= shiftStartTime.getTime() && rideTime <= shiftEndTime.getTime();
      }).reduce((sum, ride) => sum + (ride.estimatedPrice || 0), 0);
    } else {
      // Use automatic shift start time or filter by history filter period
      let startTime: number;
      const now = Date.now();

      if (shiftStart) {
        startTime = shiftStart;
      } else {
        // Use history filter period as fallback
        const filterDate = new Date();
        switch (historyFilter) {
          case '2days':
            filterDate.setDate(filterDate.getDate() - 2);
            break;
          case 'week':
            filterDate.setDate(filterDate.getDate() - 7);
            break;
          case 'month':
            filterDate.setMonth(filterDate.getMonth() - 1);
            break;
          case 'all':
          default:
            // For 'all', use a very old date (effectively no start limit)
            filterDate.setFullYear(filterDate.getFullYear() - 10);
            break;
        }
        startTime = filterDate.getTime();
      }

      const shiftCompleted = rides.filter(ride =>
        ride.status === RideStatus.Completed &&
        new Date(ride.timestamp).getTime() >= startTime &&
        new Date(ride.timestamp).getTime() <= now
      );
      return shiftCompleted.reduce((sum, ride) => sum + (ride.estimatedPrice || 0), 0);
        }
     };

    // Load ride data when vehicle number or refresh trigger changes - only when socket is disconnected
    useEffect(() => {
      if (vehicleNumber && realtimeConnectionStatus !== 'connected') {
        loadRideData(vehicleNumber);
      }
    }, [vehicleNumber, refreshTrigger, loadRideData]); // Removed realtimeConnectionStatus to prevent excessive reloading

    // Socket.io connection for real-time messaging and ride updates
   useEffect(() => {
      if (!user?.id || !vehicleNumber) return;

     const waitForToken = async (timeoutMs = 3000): Promise<string | null> => {
       // Prefer global cached token if available (shared by root client)
       try {
         const win: any = window as any;
         if (win && win.__shamanride_access_token) return win.__shamanride_access_token;
       } catch (e) {
         // ignore
       }

       // Try the canonical helper which will attempt a defensive refresh if needed.
       try {
         const token = await safeGetAccessToken({ forceRefresh: false });
         if (token) return token;
       } catch (e) {
         console.warn('safeGetAccessToken failed in driver-app waitForToken:', e);
       }

       // As a last resort, poll for a cached token for a short time
       const start = Date.now();
       while (Date.now() - start < timeoutMs) {
         try {
           const cached = getCachedAccessToken();
           if (cached) return cached;
         } catch (e) {
           // ignore
         }
         await new Promise(r => setTimeout(r, 250));
       }

       // Give up
       return null;
     };

      const initSocket = async () => {
        setRealtimeConnectionStatus('connecting');
        const token = await waitForToken(3000);
        const socketUrl = import.meta.env.VITE_SOCKET_URL || import.meta.env.REACT_APP_SOCKET_URL || 'http://localhost:3000';

        if (!token) {
          console.error('Driver Dashboard: no access token available, aborting socket connection');
          setRealtimeConnectionStatus('disconnected');
          setSocketConnected(false);
          return;
        }

        console.log('Initializing socket connection to:', socketUrl);

         const socketInstance = io(socketUrl, {
          auth: { token },
          transports: ['websocket', 'polling']
        });

        socketInstance.on('connect', () => {
           console.log('Driver app connected to server, vehicleNumber:', vehicleNumber);
           setSocketConnected(true);
           setRealtimeConnectionStatus('connected');

           // Send any queued location data when connection is restored
           const sendQueuedLocationData = async () => {
             try {
               const cachedLocations = localStorage.getItem('cached-locations');
               if (cachedLocations) {
                 const locations = JSON.parse(cachedLocations);
                 if (locations.length > 0) {
                   console.log('Sending queued location data:', locations.length, 'entries');
                   for (const locationData of locations) {
                     socketInstance.emit('position_update', locationData);
                     // Small delay to avoid overwhelming the server
                     await new Promise(resolve => setTimeout(resolve, 100));
                   }
                   localStorage.removeItem('cached-locations');
                   console.log('Queued location data sent successfully');
                 }
               }
             } catch (error) {
               console.error('Error sending queued location data:', error);
             }
           };

           // Send queued data after a short delay to ensure connection is stable
           setTimeout(sendQueuedLocationData, 1000);

          // Join shift room for ride updates
          socketInstance.emit('join_shift', `driver_shift_${vehicleNumber}`);
          console.log('Joined shift room:', `driver_shift_${vehicleNumber}`);

          // Join group chat for shift messages (same room as dispatcher)
          socketInstance.emit('join_group_chat', 'dispatcher_shift');
          console.log('Joined group chat room:', 'dispatcher_shift');

          // Broadcast current driver status when connecting
          if (vehicleNumber && driverStatus) {
            const vehicleStatus = driverStatus === 'available' ? 'AVAILABLE' :
                                 driverStatus === 'on_ride' ? 'BUSY' :
                                 driverStatus === 'break' ? 'BREAK' :
                                 driverStatus === 'offline' ? 'OUT_OF_SERVICE' : 'OUT_OF_SERVICE';

            console.log('Broadcasting current driver status on connect:', {
              vehicleId: vehicleNumber,
              status: vehicleStatus,
              driverStatus: driverStatus
            });

            socketInstance.emit('vehicle_status_changed', {
              vehicleId: vehicleNumber,
              status: vehicleStatus,
              driverStatus: driverStatus,
              timestamp: Date.now()
            });
          }

          // Join dispatcher chat room
          socketInstance.emit('join_chat_dispatcher_driver', {
            dispatcherId: 'dispatcher',
            driverId: vehicleNumber
          });
          console.log('Joined dispatcher chat room for driver:', vehicleNumber);
        });

       socketInstance.on('disconnect', () => {
          console.log('Driver app disconnected from server');
          setSocketConnected(false);
          setRealtimeConnectionStatus('disconnected');
        });

        // Listen for ride updates
        socketInstance.on('ride_updated', (rideData) => {
           console.log('Driver app received ride update:', rideData);
           if (rideData.vehicleId === vehicleNumber) {
              // Notify driver of new ride assignment
              if (rideData.status === 'assigned' || rideData.status === 'pending') {
                notifyUser('ride', {
                  title: 'Nová jízda přiřazena!',
                  body: `${rideData.customerName} - ${rideData.stops?.[0]} → ${rideData.stops?.[rideData.stops.length - 1]}`
                }).catch(error => console.error('Error notifying user:', error));
               // Add visual flashing for new ride
               setFlashingRides(prev => new Set(prev).add(rideData.id));
               // Clear flashing after 10 seconds
               setTimeout(() => {
                 setFlashingRides(prev => {
                   const newSet = new Set(prev);
                   newSet.delete(rideData.id);
                   return newSet;
                 });
               }, 10000);
             }
             refreshVehicleData();
           }
         });

        // Listen for status changes
        socketInstance.on('status_changed', (data) => {
          console.log('Driver app received status change:', data);

          // Notify driver of important status changes
          if (data.newStatus === 'cancelled') {
            notifyUser('general', {
              title: 'Jízda zrušena',
              body: `Jízda ID ${data.rideId} byla zrušena dispečerem`
            }).catch(error => console.error('Error notifying user:', error));
          }

          refreshVehicleData();
        });

        // Listen for ride cancellations
        socketInstance.on('ride_cancelled', (data) => {
          console.log('Driver app received ride cancellation:', data);

          // Notify driver of ride cancellation
          notifyUser('general', {
            title: 'Jízda zrušena',
            body: `Jízda ID ${data.rideId} byla zrušena dispečerem`
          }).catch(error => console.error('Error notifying user:', error));

          refreshVehicleData();
        });

       setSocket(socketInstance);
     };

     initSocket();

     return () => {
       if (socket) {
         socket.disconnect();
       }
     };
    }, [user?.id, vehicleNumber]);





  // Auto-disable navigation mode after 2 hours
  useEffect(() => {
    if (navigationActive && navigationStartTime) {
      const timeout = setTimeout(() => {
        console.log('Auto-disabling navigation mode after 2 hours');
        setNavigationActive(false);
        setNavigationStartTime(null);
      }, 2 * 60 * 60 * 1000); // 2 hours

      return () => clearTimeout(timeout);
    }
  }, [navigationActive, navigationStartTime]);

    // GPS Location tracking and sending
   useEffect(() => {
     if (!vehicleNumber) {
       console.log('GPS tracking: No vehicle number, skipping GPS initialization');
       return;
     }

      if (!navigator.geolocation) {
        console.warn('GPS tracking: Geolocation API not supported by this browser');
        // In development, provide mock location for testing
        if (import.meta.env.DEV) {
          console.log('GPS tracking: Using mock location for development');
          // Set a default location (e.g., Prague coordinates)
          const mockPosition = { lat: 50.0755, lng: 14.4378 }; // Prague coordinates
          setLocation(mockPosition);
          setLastLocationUpdate(Date.now());
          console.log('GPS mock position set:', mockPosition);
        }
        return;
      }

     console.log('GPS tracking: Initializing GPS tracking for vehicle:', vehicleNumber);

    let currentPosition: { lat: number; lng: number } | null = null;

    console.log('Starting GPS tracking for vehicle:', vehicleNumber);

    // Clear any existing GPS tracking
    if (watchIdRef.current) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (locationIntervalRef.current) {
      clearInterval(locationIntervalRef.current);
      locationIntervalRef.current = null;
    }

    // Watch position continuously
    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        currentPosition = { lat: latitude, lng: longitude };
        setLocation(currentPosition);
        setLastLocationUpdate(Date.now());
        console.log(`GPS position updated: ${latitude.toFixed(6)}, ${longitude.toFixed(6)} (accuracy: ${accuracy.toFixed(1)}m)`);
      },
      (error) => {
        // Reduce console spam - only log GPS errors occasionally
        const shouldLog = Math.random() < 0.05; // Log ~5% of GPS errors to reduce spam

        if (shouldLog) {
          console.warn('GPS tracking error:', error);
          switch(error.code) {
            case error.PERMISSION_DENIED:
              console.warn('GPS tracking: Location permission denied. Please enable location access in browser settings.');
              break;
            case error.POSITION_UNAVAILABLE:
              console.warn('GPS tracking: Position unavailable. Check GPS signal and try refreshing the page.');
              break;
            case error.TIMEOUT:
              console.warn('GPS tracking: Location request timed out. This may happen on slow networks.');
              break;
            default:
              console.warn('GPS tracking: Unknown location error:', error.message);
          }
        }

        // Set a fallback location for testing if in development
        if (import.meta.env.DEV && !location) {
          const mockPosition = { lat: 50.0755, lng: 14.4378 }; // Prague coordinates
          setLocation(mockPosition);
          setLastLocationUpdate(Date.now());
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 30000, // Accept positions up to 30 seconds old
      }
    );

    // Location updates are now handled via socket.io - no need to check Supabase table

    // Send real-time location updates via socket.io
    // Use more frequent updates when navigation is active
    const updateInterval = navigationActive ? 10000 : 30000; // 10 seconds when navigating, 30 seconds otherwise

    locationIntervalRef.current = setInterval(() => {
      if (currentPosition && vehicleNumber) {
        const locationData = {
          shiftId: `driver_shift_${vehicleNumber}`,
          vehicleId: vehicleNumber,
          latitude: currentPosition.lat,
          longitude: currentPosition.lng,
          timestamp: Date.now()
        };

        if (socket && socketConnected) {
          console.log(`📍 Sending location update: ${currentPosition.lat.toFixed(6)}, ${currentPosition.lng.toFixed(6)} (${navigationActive ? 'navigation' : 'normal'} mode)`);
          socket.emit('position_update', locationData);
        } else {
          // Queue location data for background sync when offline
          console.log('📍 Queueing location data (offline):', locationData);
          queueLocationData(locationData);
          updateSyncStatus();
        }
      } else {
        console.log('📍 Not sending location - position available:', !!currentPosition, 'vehicle set:', !!vehicleNumber, 'socket connected:', socketConnected);
      }
    }, updateInterval);

    return () => {
      console.log('Stopping GPS tracking');
      if (watchIdRef.current) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      if (locationIntervalRef.current) {
        clearInterval(locationIntervalRef.current);
        locationIntervalRef.current = null;
      }
    };
    }, [vehicleNumber, socket, navigationActive]); // Removed socketConnected to prevent GPS restart on connection changes





       // Periodic ride data validation to detect manual deletions - only when socket is disconnected
       useEffect(() => {
         if (!vehicleNumber || realtimeConnectionStatus === 'connected') return;

         const validateRidesInterval = setInterval(async () => {
           try {
             console.log('Validating ride data for manual deletions (socket disconnected)...');
             const [currentRides, pendingRidesData, rideHistoryData] = await Promise.all([
               supabaseService.getRideLogsByVehicle(vehicleNumber, 'in_progress', 1),
               supabaseService.getRideLogsByVehicle(vehicleNumber, 'pending', 10),
               supabaseService.getRideLogsByVehicle(vehicleNumber, undefined, 100)
             ]);

             const dbCurrentRide = currentRides[0] || null;
             const dbPendingRides = pendingRidesData;
             const dbRideHistory = rideHistoryData;

             // Check if current ride still exists in database
             if (currentRide && (!dbCurrentRide || dbCurrentRide.id !== currentRide.id)) {
               console.log('Current ride was deleted from database, clearing local state');
               setCurrentRide(null);
             }

             // Check if any pending rides were deleted
             const deletedPendingRides = pendingRides.filter(ride =>
               !dbPendingRides.some(dbRide => dbRide.id === ride.id)
             );
             if (deletedPendingRides.length > 0) {
               console.log('Pending rides deleted from database:', deletedPendingRides.map(r => r.id));
               setPendingRides(prev => prev.filter(ride =>
                 !deletedPendingRides.some(deleted => deleted.id === ride.id)
               ));
             }

             // Check if any completed rides were deleted
             const localCompletedRides = rideHistory.filter(ride => ride.status === RideStatus.Completed);
             const deletedCompletedRides = localCompletedRides.filter(ride =>
               !dbRideHistory.some(dbRide => dbRide.id === ride.id)
             );
             if (deletedCompletedRides.length > 0) {
               console.log('Completed rides deleted from database:', deletedCompletedRides.map(r => r.id));
               setRideHistory(prev => prev.filter(ride =>
                 !deletedCompletedRides.some(deleted => deleted.id === ride.id)
               ));
             }

           } catch (error) {
             console.warn('Error validating ride data:', error);
           }
         }, 300000); // Check every 5 minutes when disconnected (reduced frequency)

         return () => clearInterval(validateRidesInterval);
       }, [vehicleNumber, currentRide, pendingRides, rideHistory, realtimeConnectionStatus]);

   // Auto-refresh ride data every 15 seconds (for local mode without real-time)




    // Manage screen wake lock based on driver status, ride activity, and user settings
     useEffect(() => {
       const shouldKeepScreenOn = driverStatus === 'available' || driverStatus === 'on_ride' || currentRide !== null;

       // Check user settings for wake lock
       const settings = (() => {
         try {
           const saved = localStorage.getItem('notification-settings');
           return saved ? JSON.parse(saved) : { wakeLockEnabled: true };
         } catch {
           return { wakeLockEnabled: true };
         }
       })();

       const wakeLockEnabled = settings.wakeLockEnabled !== false; // Default to true
       const shouldActivateWakeLock = shouldKeepScreenOn && wakeLockEnabled;

       console.log('Wake lock check:', {
         driverStatus,
         currentRide: !!currentRide,
         shouldKeepScreenOn,
         wakeLockEnabled,
         shouldActivateWakeLock,
         wakeLockActive,
         isWakeLockSupported: isWakeLockSupported()
       });

       const manageWakeLock = async () => {
         if (shouldActivateWakeLock && !wakeLockActive && isWakeLockSupported()) {
           const success = await requestWakeLock();
           if (success) {
             setWakeLockActive(true);
             console.log('Screen wake lock activated - display will stay on');
           }
         } else if (!shouldActivateWakeLock && wakeLockActive) {
           await releaseWakeLock();
           setWakeLockActive(false);
           console.log('Screen wake lock released - display can turn off');
         }
       };

       manageWakeLock();

     // Re-request wake lock when page becomes visible again
     const handleVisibilityChange = () => {
       if (document.visibilityState === 'visible' && shouldKeepScreenOn && isWakeLockSupported()) {
         requestWakeLock().then(success => {
           if (success) {
             setWakeLockActive(true);
             console.log('Screen wake lock re-acquired after visibility change');
           }
         });
       }
     };

     document.addEventListener('visibilitychange', handleVisibilityChange);

     return () => {
       document.removeEventListener('visibilitychange', handleVisibilityChange);
     };
   }, [driverStatus, currentRide, wakeLockActive]);

   // Filter ride history based on selected time period (only completed rides)
   const filteredRideHistory = rideHistory.filter(ride => {
     // Only show completed rides in history
     if (ride.status !== RideStatus.Completed) return false;

     const rideDate = new Date(ride.timestamp);
     const now = new Date();

     switch (historyFilter) {
       case '2days':
         const twoDaysAgo = new Date(now);
         twoDaysAgo.setDate(now.getDate() - 2);
         return rideDate >= twoDaysAgo;
       case 'week':
         const oneWeekAgo = new Date(now);
         oneWeekAgo.setDate(now.getDate() - 7);
         return rideDate >= oneWeekAgo;
       case 'month':
         const oneMonthAgo = new Date(now);
         oneMonthAgo.setMonth(now.getMonth() - 1);
         return rideDate >= oneMonthAgo;
       case 'all':
       default:
         return true;
     }
   });

   // Debug logging for filtered history
   console.log('📋 Filtered ride history for display:', filteredRideHistory.length, 'rides with filter:', historyFilter);

  // Update shift cash when ride history changes
   useEffect(() => {
     if ((shiftStartTime || (useCustomShift && customShiftStart && customShiftEnd && customShiftDate) || (!useCustomShift && historyFilter)) && rideHistory.length > 0) {
       const shiftCashAmount = calculateShiftCash(rideHistory, shiftStartTime || undefined);
       setShiftCash(shiftCashAmount);
     }
   }, [rideHistory, shiftStartTime, useCustomShift, customShiftStart, customShiftEnd, customShiftDate, historyFilter]);

   // Handle break timer
  useEffect(() => {
    if (breakEndTime && driverStatus === 'break' && vehicleNumber) {
      const checkBreakEnd = async () => {
        if (Date.now() >= breakEndTime) {
          // Update vehicle status to available via sync helper (prefer socket), fallback to supabase
          try {
            const vehicles = await supabaseService.getVehicles();
            const updatedVehicles = vehicles.map(v => v.id === vehicleNumber ? { ...v, status: 'AVAILABLE' } : v);
            try {
              await syncUpdateVehicles(updatedVehicles);
            } catch (err) {
              await supabaseService.updateVehicles(updatedVehicles).catch(e => console.error('updateVehicles fallback failed', e));
            }
          } catch (err) {
            console.error('Failed to update vehicle status after break end:', err);
          }

          setDriverStatus('available');
          setBreakEndTime(null);
        }
      };

      // Check immediately
      checkBreakEnd();

      // Set up interval to check every minute
      const breakInterval = setInterval(checkBreakEnd, 60000);

      return () => clearInterval(breakInterval);
    }
  }, [breakEndTime, driverStatus, vehicleNumber]);

  const updateVehicleStatus = async (status: string) => {
    if (!vehicleNumber) {
      console.error('No vehicle number set');
      return;
    }

    // Prevent setting to available if shift is not active
    if (status === 'available' && !isShiftActive) {
      console.warn('Cannot set to available without active shift');
      return;
    }

    try {
      let vehicleStatus: string;
      if (status.startsWith('break_')) {
        const breakMinutes = parseInt(status.split('_')[1]);
        setBreakEndTime(Date.now() + breakMinutes * 60 * 1000);
        status = 'break'; // Driver status stored as 'break'
        vehicleStatus = 'BREAK';
      } else {
        setBreakEndTime(null);
        // Map driver status to vehicle status
        if (status === 'available') vehicleStatus = 'AVAILABLE';
        else if (status === 'on_ride') vehicleStatus = 'BUSY';
        else if (status === 'offline') vehicleStatus = 'OUT_OF_SERVICE';
        else vehicleStatus = status.toUpperCase();
      }

       console.log(`Updating vehicle ${vehicleNumber} status to ${vehicleStatus}`);
       console.log('Emitting vehicle_status_changed:', { vehicleId: vehicleNumber, status: vehicleStatus, driverStatus: status });

       // Update vehicle status using service - prefer server-authoritative socket when available
      try {
        if (SUPABASE_ENABLED && socket && socketConnected) {
          try {
            socket.emit('vehicle_status_changed', {
              vehicleId: vehicleNumber,
              status: vehicleStatus,
              driverStatus: status,
              timestamp: Date.now()
            });
            console.log('Requested vehicle status update via socket (server will persist).');
          } catch (emitErr) {
            console.warn('Socket emit for vehicle status failed, falling back to local DB update:', emitErr);
            const vehicles = await supabaseService.getVehicles();
            const updatedVehicles = vehicles.map(v => v.id === vehicleNumber ? { ...v, status: vehicleStatus } : v);
            try {
              await syncUpdateVehicles(updatedVehicles);
            } catch (err) {
              await supabaseService.updateVehicles(updatedVehicles).catch(e => console.error('updateVehicles fallback failed', e));
            }
          }
        } else {
          const vehicles = await supabaseService.getVehicles();
          const updatedVehicles = vehicles.map(v => v.id === vehicleNumber ? { ...v, status: vehicleStatus } : v);
          try {
            await syncUpdateVehicles(updatedVehicles);
          } catch (err) {
            await supabaseService.updateVehicles(updatedVehicles).catch(e => console.error('updateVehicles fallback failed', e));
          }
        }
      } catch (error) {
        console.error('Failed to update vehicle status:', error);
        alert('Failed to update vehicle status: ' + (error?.message || String(error)));
        return;
      }

      console.log(`Vehicle ${vehicleNumber} status updated successfully to ${vehicleStatus}`);
      setDriverStatus(status);

      // Show success feedback
      console.log(`Status updated to ${status}`);

    } catch (err: any) {
      console.error('Error updating vehicle status:', err);
      alert('Error updating vehicle status: ' + err.message);
    }
  };

    const acceptRideSpecific = async (ride: RideLog) => {
      if (vehicleNumber) {
        try {
          console.log('acceptRideSpecific: Starting ride acceptance for ride:', ride.id);
          // Update ride status to in_progress (skip accepted, start ride immediately)
          const updatedRide = { ...ride, status: RideStatus.InProgress, acceptedAt: Date.now(), startedAt: Date.now() };
          console.log('acceptRideSpecific: Updated ride object:', updatedRide);
            try {
            console.log('acceptRideSpecific: Persisting ride acceptance... SUPABASE_ENABLED =', SUPABASE_ENABLED_SERVICES);
            if (SUPABASE_ENABLED && socket && socketConnected) {
              try {
                socket.emit('ride_update', { shiftId: `driver_shift_${vehicleNumber}`, rideData: updatedRide });
                console.log('acceptRideSpecific: Emitted ride_update via socket');
                } catch (emitErr) {
                console.warn('acceptRideSpecific: Socket emit failed, falling back to persistRide', emitErr);
                try {
                  await persistRide(updatedRide);
                } catch (err) {
                  console.warn('persistRide failed, falling back to supabaseService.addRideLog', err);
                  await supabaseService.addRideLog(updatedRide).catch(e => console.error('addRideLog fallback failed', e));
                }
              }
            } else {
              try {
                await persistRide(updatedRide);
                console.log('acceptRideSpecific: Ride persisted via syncService fallback');
              } catch (err) {
                try {
                  await persistRide(updatedRide);
                } catch (e) {
                  console.warn('persistRide failed, falling back to supabaseService.addRideLog', e);
                  await supabaseService.addRideLog(updatedRide).catch(e2 => console.error('addRideLog fallback failed', e2));
                }
              }
            }

            // Verify the update by fetching the ride back
            try {
              const rides = await supabaseService.getRideLogsByVehicle(vehicleNumber, undefined, 10);
              const updatedRideFromDb = rides.find(r => r.id === ride.id);
              console.log('acceptRideSpecific: Ride status after update:', updatedRideFromDb?.status);
            } catch (verifyError) {
              console.warn('acceptRideSpecific: Could not verify ride update:', verifyError);
            }
          } catch (rideError) {
            console.error('acceptRideSpecific: Failed to accept ride:', rideError);
            alert('Failed to accept ride. Please try again.');
            return;
          }

           // Update vehicle status to BUSY when ride is accepted, set freeAt to estimated completion time
           const freeAt = ride.estimatedCompletionTimestamp || (Date.now() + 30 * 60 * 1000); // Default 30 min if not set
           try {
             const vehicles = await supabaseService.getVehicles();
             const updatedVehicles = vehicles.map(v =>
               v.id === vehicleNumber ? { ...v, status: 'BUSY', freeAt } : v
             );
             try {
               await syncUpdateVehicles(updatedVehicles);
             } catch (err) {
               await supabaseService.updateVehicles(updatedVehicles).catch(e => console.error('updateVehicles fallback failed', e));
             }
           } catch (vehicleError) {
             console.error('Failed to update vehicle status:', vehicleError);
             // Continue anyway, the ride was accepted
           }

          // Track this acceptance to prevent auto-refresh from overriding it
          setLastAcceptedRideId(ride.id);
          setLastAcceptTime(Date.now());

          // Clear the tracking after 10 seconds to allow normal refreshes again
          setTimeout(() => {
            setLastAcceptedRideId(null);
            setLastAcceptTime(0);
          }, 10000);

           // Clear flashing indicator
           setFlashingRides(prev => {
             const newSet = new Set(prev);
             newSet.delete(ride.id);
             return newSet;
           });

           // Immediately update local state to prevent UI flicker
           setPendingRides(prev => prev.filter(r => r.id !== ride.id));
           setCurrentRide({ ...ride, status: RideStatus.InProgress });

          // The real-time subscription will handle any additional updates
        } catch (error) {
          console.error('Error accepting ride:', error);
          alert('Error accepting ride. Please try again.');
        }
      }
    };

    const acceptRide = async () => {
      if (currentRide && vehicleNumber) {
        try {
          // Update ride status to in_progress (skip accepted, start ride immediately)
          const updatedRide = { ...currentRide, status: RideStatus.InProgress, acceptedAt: Date.now(), startedAt: Date.now() };
          try {
            if (SUPABASE_ENABLED && socket && socketConnected) {
              try {
                socket.emit('ride_update', { shiftId: `driver_shift_${vehicleNumber}`, rideData: updatedRide });
                console.log('acceptRide: Emitted ride_update via socket');
              } catch (emitErr) {
                console.warn('acceptRide: Socket emit failed, falling back to persistRide', emitErr);
                try {
                  await persistRide(updatedRide);
                } catch (err) {
                  console.warn('persistRide failed, falling back to supabaseService.addRideLog', err);
                  await supabaseService.addRideLog(updatedRide).catch(e => console.error('addRideLog fallback failed', e));
                }
              }
            } else {
              try {
                await persistRide(updatedRide);
              } catch (err) {
                try {
                  await persistRide(updatedRide);
                } catch (e) {
                  console.warn('persistRide failed, falling back to supabaseService.addRideLog', e);
                  await supabaseService.addRideLog(updatedRide).catch(e2 => console.error('addRideLog fallback failed', e2));
                }
              }
            }
          } catch (rideError) {
            console.error('Failed to accept ride:', rideError);
            alert('Failed to accept ride. Please try again.');
            return;
          }

           // Update vehicle status to BUSY when ride is accepted, set freeAt to estimated completion time
           const freeAt = currentRide.estimatedCompletionTimestamp || (Date.now() + 30 * 60 * 1000); // Default 30 min if not set
           try {
             const vehicles = await supabaseService.getVehicles();
             const updatedVehicles = vehicles.map(v =>
               v.id === vehicleNumber ? { ...v, status: 'BUSY', freeAt } : v
             );
             try {
               await syncUpdateVehicles(updatedVehicles);
             } catch (err) {
               await supabaseService.updateVehicles(updatedVehicles).catch(e => console.error('updateVehicles fallback failed', e));
             }
           } catch (vehicleError) {
             console.error('Failed to update vehicle status:', vehicleError);
             // Continue anyway, the ride was accepted
           }

          // Track this acceptance to prevent auto-refresh from overriding it
          setLastAcceptedRideId(currentRide.id);
          setLastAcceptTime(Date.now());

          setCurrentRide({ ...currentRide, status: RideStatus.InProgress });
        } catch (error) {
          console.error('Error accepting ride:', error);
          alert('Error accepting ride. Please try again.');
        }
      }
    };

    const startRide = async () => {
      if (currentRide) {
        const updatedRide = { ...currentRide, status: RideStatus.InProgress, startedAt: Date.now() };
        if (SUPABASE_ENABLED && socket && socketConnected) {
          try {
            socket.emit('ride_update', { shiftId: `driver_shift_${vehicleNumber}`, rideData: updatedRide });
            console.log('startRide: Emitted ride_update via socket');
          } catch (emitErr) {
            console.warn('startRide: Socket emit failed, falling back to persistRide', emitErr);
            try {
              await persistRide(updatedRide);
            } catch (err) {
              console.warn('persistRide failed, falling back to supabaseService.addRideLog', err);
              await supabaseService.addRideLog(updatedRide).catch(e => console.error('addRideLog fallback failed', e));
            }
          }
        } else {
          try {
            await persistRide(updatedRide);
          } catch (err) {
            try {
              await persistRide(updatedRide);
            } catch (e) {
              console.warn('persistRide failed, falling back to supabaseService.addRideLog', e);
              await supabaseService.addRideLog(updatedRide).catch(e2 => console.error('addRideLog fallback failed', e2));
            }
          }
        }
        setCurrentRide(updatedRide);
      }
    };

    const endRide = async () => {
        if (currentRide) {
            // Show completion modal instead of immediately completing
            setRideToComplete(currentRide);
            setShowCompletionModal(true);
        }
    };

    const cancelRide = async () => {
        if (!currentRide || !vehicleNumber) return;

        try {
            // Update ride status to cancelled
            const cancelledRide = { ...currentRide, status: RideStatus.Cancelled };
            if (SUPABASE_ENABLED && socket && socketConnected) {
              try {
                socket.emit('ride_update', { shiftId: `driver_shift_${vehicleNumber}`, rideData: cancelledRide });
                console.log('cancelRide: Emitted ride_update (cancel) via socket');
                  } catch (emitErr) {
                  console.warn('cancelRide: Socket emit failed, falling back to persistRide', emitErr);
                  try {
                    await persistRide(cancelledRide);
                  } catch (err) {
                    console.warn('persistRide failed, falling back to supabaseService.addRideLog', err);
                    await supabaseService.addRideLog(cancelledRide).catch(e => console.error('addRideLog fallback failed', e));
                  }
                }
              } else {
                try {
                  await persistRide(cancelledRide);
                } catch (err) {
                  try {
                    await persistRide(cancelledRide);
                  } catch (e) {
                    console.warn('persistRide failed, falling back to supabaseService.addRideLog', e);
                    await supabaseService.addRideLog(cancelledRide).catch(e2 => console.error('addRideLog fallback failed', e2));
                  }
                }
              }

              // Update vehicle status back to AVAILABLE
              const vehicles = await supabaseService.getVehicles();
              const updatedVehicles = vehicles.map(v =>
                  v.id === vehicleNumber ? { ...v, status: 'AVAILABLE', freeAt: null } : v
              );
              try {
                await syncUpdateVehicles(updatedVehicles);
              } catch (err) {
                await supabaseService.updateVehicles(updatedVehicles).catch(e => console.error('updateVehicles fallback failed', e));
              }

            // Clear current ride
            setCurrentRide(null);

            // Refresh data
            setTimeout(() => {
                refreshVehicleData();
            }, 1000);

        } catch (error) {
            console.error('Error cancelling ride:', error);
            alert('Chyba při rušení jízdy. Zkuste to znovu.');
        }
    };

  const navigateToDestination = async (rideOrStops?: RideLog | string[], navApp?: 'google' | 'mapy' | 'waze') => {
    let stops: string[];

    if (Array.isArray(rideOrStops)) {
      // Direct stops array from ManualRideModal
      stops = rideOrStops;
    } else {
      // RideLog object
      const targetRide = rideOrStops || currentRide;
      if (targetRide) {
        stops = targetRide.stops;
      } else {
        return;
      }
    }

    if (stops && stops.length > 0) {
      // Use provided navApp or fall back to preferred navigation app
      const appToUse = navApp || preferredNavApp;
      let url: string;

      try {
        // Geocode all stops
        const stopsCoords = await Promise.all(stops.map(stop => geocodeAddress(stop, 'cs')));

        if (appToUse === 'waze') {
          // For Waze, use destination with origin and waypoints
          const formatCoord = (coord: { lat: number; lon: number }) => `${coord.lat},${coord.lon}`;
          const origin = stopsCoords[0];
          const destination = stopsCoords[stopsCoords.length - 1];
          const waypoints = stopsCoords.slice(1, -1);

          let wazeUrl = `https://waze.com/ul?ll=${formatCoord(destination)}&from=${formatCoord(origin)}&navigate=yes`;
          if (waypoints.length > 0) {
            wazeUrl += `&via=${waypoints.map(formatCoord).join('|')}`;
          }
          url = wazeUrl;
        } else if (appToUse === 'mapy') {
          // For Mapy.cz, create a route with all stops
          // Mapy.cz uses x=lon, y=lat format for center point, but lat,lon for route points
          const allPoints = stopsCoords;

          if (allPoints.length === 1) {
            // Single destination - center map on destination
            const dest = allPoints[0];
            url = `https://mapy.cz/zakladni?x=${dest.lon}&y=${dest.lat}&z=15`;
          } else {
            // Route with multiple points
            // Mapy.cz route format: rl1=start_lat,start_lon&rl2=waypoint_lat,waypoint_lon&...&rs=1&rc=1&ri=1&rt=1
            const start = allPoints[0];
            const end = allPoints[allPoints.length - 1];
            const waypoints = allPoints.slice(1, -1); // Middle points as waypoints

            // Start with the destination as center point
            let mapyUrl = `https://mapy.cz/zakladni?x=${end.lon}&y=${end.lat}&z=13`;

            // Add route points in lat,lon format (note: Mapy.cz expects lat first for route points)
            mapyUrl += `&rl1=${start.lat}%2C${start.lon}`;

            // Add intermediate waypoints
            waypoints.forEach((wp, index) => {
              mapyUrl += `&rl${index + 2}=${wp.lat}%2C${wp.lon}`;
            });

            // Add route settings: rs=1 (show route), rc=1 (car), ri=1 (fastest route), rt=1 (route type)
            mapyUrl += '&rs=1&rc=1&ri=1&rt=1';

            url = mapyUrl;
          }

          console.log(`Generated ${appToUse} navigation URL:`, url);
        } else {
          // Use Google Maps - let app use current location as origin
          const destination = `${stopsCoords[stopsCoords.length - 1].lat},${stopsCoords[stopsCoords.length - 1].lon}`;
          const waypoints = stopsCoords.slice(0, -1).map(coord => `${coord.lat},${coord.lon}`); // All stops except destination

          let googleUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}&travelmode=driving`;

          if (waypoints.length > 0) {
            googleUrl += `&waypoints=${encodeURIComponent(waypoints.join('|'))}`;
          }

          url = googleUrl;
        }
      } catch (error) {
        console.error('Error generating navigation URL:', error);
        // Fallback to simple destination navigation
        if (appToUse === 'waze') {
          const destination = stops[stops.length - 1];
          url = `https://waze.com/ul?q=${encodeURIComponent(destination)}&navigate=yes`;
        } else if (appToUse === 'mapy') {
          const destination = stops[stops.length - 1];
          // Try to geocode the destination for better accuracy
          try {
            const destCoords = await geocodeAddress(destination, 'cs');
            // For single destination, just center the map
            url = `https://mapy.cz/zakladni?x=${destCoords.lon}&y=${destCoords.lat}&z=15`;
          } catch (geocodeError) {
            // Fallback to text search
            url = `https://mapy.cz/zakladni?q=${encodeURIComponent(destination)}`;
            console.log('Using fallback Mapy.cz URL:', url);
          }
        } else {
          // For direct stops array (from ManualRideModal), just navigate to destination
          const destination = stops[stops.length - 1];
          url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
        }
      }

      // Mark navigation as active for more frequent GPS updates
      setNavigationActive(true);
      setNavigationStartTime(Date.now());

      window.open(url, '_blank');
    }
  };





    const handleManualRideAdded = (ride?: RideLog) => {
      if (ride) {
        // Immediately set the current ride for instant UI update
        setCurrentRide(ride);
        setDriverStatus('on_ride');
      } else {
        // Fallback: refresh vehicle data
        refreshVehicleData();
      }
    };

   const handleRideCompleted = async () => {
     console.log('handleRideCompleted called, clearing current ride');
     // Clear the current ride since it was completed
     setCurrentRide(null);

     // Check if there are pending rides in queue and handle them
     if (!vehicleNumber) return;

     try {
       const pendingRides = await supabaseService.getRideLogsByVehicle(vehicleNumber, 'pending');

       if (pendingRides.length > 0) {
         const nextRide = pendingRides[0];
         console.log('Accepting next ride in queue:', nextRide.id);

         // Automatically accept the next ride in queue
         const acceptedRide = {
           ...nextRide,
           status: RideStatus.InProgress,
           acceptedAt: Date.now(),
           startedAt: Date.now()
         };
         if (SUPABASE_ENABLED && socket && socketConnected) {
           try {
             socket.emit('ride_update', { shiftId: `driver_shift_${vehicleNumber}`, rideData: acceptedRide });
             console.log('handleRideCompleted: Emitted ride_update for acceptedRide via socket');
           } catch (emitErr) {
             console.warn('handleRideCompleted: Socket emit failed, falling back to persistRide', emitErr);
             try {
               await persistRide(acceptedRide);
             } catch (err) {
               console.warn('persistRide failed, falling back to supabaseService.addRideLog', err);
               await supabaseService.addRideLog(acceptedRide).catch(e => console.error('addRideLog fallback failed', e));
             }
           }
         } else {
           try {
             await persistRide(acceptedRide);
           } catch (err) {
             try {
               await persistRide(acceptedRide);
             } catch (e) {
               console.warn('persistRide failed, falling back to supabaseService.addRideLog', e);
               await supabaseService.addRideLog(acceptedRide).catch(e2 => console.error('addRideLog fallback failed', e2));
             }
           }
         }

        // Update vehicle status to BUSY for next ride (prefer server when online)
        const freeAt = nextRide.estimatedCompletionTimestamp || (Date.now() + 30 * 60 * 1000);
        if (SUPABASE_ENABLED && socket && socketConnected) {
          try {
            socket.emit('vehicle_status_changed', { vehicleId: vehicleNumber, status: 'BUSY', driverStatus: 'on_ride', timestamp: Date.now() });
            console.log('handleRideCompleted: Emitted vehicle_status_changed via socket');
          } catch (emitErr) {
            console.warn('handleRideCompleted: Socket emit failed, falling back to updateVehicles', emitErr);
            const vehicles = await supabaseService.getVehicles();
            const updatedVehicles = vehicles.map(v => v.id === vehicleNumber ? { ...v, status: 'BUSY', freeAt } : v);
            await supabaseService.updateVehicles(updatedVehicles);
          }
        } else {
          const vehicles = await supabaseService.getVehicles();
          const updatedVehicles = vehicles.map(v => v.id === vehicleNumber ? { ...v, status: 'BUSY', freeAt } : v);
          await supabaseService.updateVehicles(updatedVehicles);
        }

         // Update state: remove from pending, set as current
         setPendingRides(prev => prev.filter(r => r.id !== nextRide.id));
         setCurrentRide(acceptedRide);
         console.log('Next ride accepted and set as current');
       } else {
         console.log('No more rides, vehicle remains available');
         // Update vehicle status to AVAILABLE
         const vehicles = await supabaseService.getVehicles();
         const updatedVehicles = vehicles.map(v =>
           v.id === vehicleNumber ? { ...v, status: 'AVAILABLE', freeAt: null } : v
         );
         await supabaseService.updateVehicles(updatedVehicles);
       }
     } catch (error) {
       console.error('Error handling next ride after completion:', error);
     }

      // Small delay to ensure database operations complete, then refresh
      setTimeout(async () => {
        console.log('Calling refreshVehicleData after ride completion');
        await refreshVehicleData();
      }, 1000);
    };

    // Shift management functions
    const handleStartShift = async (startOdo: number) => {
      console.log('handleStartShift called with startOdo:', startOdo, 'vehicleNumber:', vehicleNumber);
      const now = Date.now();
      const nowISO = new Date(now).toISOString();
      setShiftStartTimestamp(now);
      setShiftStartOdo(startOdo);
      setShiftEndTimestamp(null);
      setShiftEndOdo(null);
      setShiftRevenue(0);
      setShiftCash(0);

      // Save to localStorage for persistence
      localStorage.setItem('shiftStartTime', now.toString());
      localStorage.setItem('shiftStartOdo', startOdo.toString());
      // Clear previous shift end data
      localStorage.removeItem('shiftEndTime');
      localStorage.removeItem('shiftEndOdo');
      localStorage.removeItem('shiftRevenue');
      localStorage.removeItem('shiftCash');
      localStorage.removeItem('shiftDistance');

       // Update vehicle shift_start and start odometer via sync helper (prefer socket), fallback to supabase
       try {
         console.log('Fetching vehicles for shift start update...');
         const vehicles = await supabaseService.getVehicles();
         console.log('Vehicles fetched:', vehicles.length, 'looking for vehicle:', vehicleNumber);
         const currentVehicle = vehicles.find(v => v.id === vehicleNumber);
         console.log('Current vehicle before update:', currentVehicle);

         const updatedVehicles = vehicles.map(v => v.id === vehicleNumber ? {
           ...v,
           shiftStart: nowISO,
           shiftEnd: null,
           shiftStartOdo: startOdo,
           shiftEndOdo: null
         } : v);

         const updatedVehicle = updatedVehicles.find(v => v.id === vehicleNumber);
         console.log('Vehicle after update mapping:', updatedVehicle);

         try {
           const result = await syncUpdateVehicles(updatedVehicles);
           console.log('Shift start and odometer updated via syncUpdateVehicles, result:', result);
         } catch (err) {
           console.warn('syncUpdateVehicles failed for shift start, falling back to supabaseService.updateVehicles', err);
           await supabaseService.updateVehicles(updatedVehicles).catch(e => console.error('updateVehicles fallback failed', e));
         }
       } catch (err) {
         console.error('Error updating shift_start via sync helper:', err);
       }

      // Update vehicle status to available when starting shift
      await updateVehicleStatus('available');

      console.log('Shift started at:', new Date(now).toLocaleString(), 'Odo:', startOdo);
    };

    const handleEndShift = async (endOdo: number) => {
      console.log('Dashboard handleEndShift called with endOdo:', endOdo, 'vehicleNumber:', vehicleNumber);
      if (!vehicleNumber) {
        console.error('No vehicle number set for shift end');
        return;
      }

      const now = Date.now();
      const shiftRevenue = calculateCurrentShiftRevenue();
      const shiftCash = calculateCurrentShiftCash();
      const shiftDistance = endOdo - (shiftStartOdo || 0);

      console.log('Calculated shift data - revenue:', shiftRevenue, 'cash:', shiftCash, 'distance:', shiftDistance, 'startOdo:', shiftStartOdo);

      setShiftEndTimestamp(now);
      setShiftEndOdo(endOdo);
      setShiftRevenue(shiftRevenue);

      // Save to localStorage for persistence
      localStorage.setItem('shiftEndTime', now.toString());
      localStorage.setItem('shiftEndOdo', endOdo.toString());
      localStorage.setItem('shiftRevenue', shiftRevenue.toString());
      localStorage.setItem('shiftCash', shiftCash.toString());
      localStorage.setItem('shiftDistance', shiftDistance.toString());

       // Update vehicle shift_end and end odometer in database
       const nowISO = new Date(now).toISOString();
       console.log('Updating vehicle with shiftEnd:', nowISO, 'shiftEndOdo:', endOdo);
       // Update vehicle shift_end and end odometer via sync helper (prefer socket), fallback to supabase
       try {
         console.log('Fetching vehicles for shift end update...');
         const vehicles = await supabaseService.getVehicles();
         console.log('Vehicles fetched:', vehicles.length, 'looking for vehicle:', vehicleNumber);
         const currentVehicle = vehicles.find(v => v.id === vehicleNumber);
         console.log('Current vehicle before update:', currentVehicle);

         const updatedVehicles = vehicles.map(v => v.id === vehicleNumber ? {
           ...v,
           shiftEnd: nowISO,
           shiftEndOdo: endOdo
         } : v);

         const updatedVehicle = updatedVehicles.find(v => v.id === vehicleNumber);
         console.log('Vehicle after update mapping:', updatedVehicle);

         try {
           const result = await syncUpdateVehicles(updatedVehicles);
           console.log('Shift end and odometer updated via syncUpdateVehicles, result:', result);
         } catch (err) {
           console.warn('syncUpdateVehicles failed for shift end, falling back to supabaseService.updateVehicles', err);
           await supabaseService.updateVehicles(updatedVehicles).catch(e => console.error('updateVehicles fallback failed', e));
         }
        } catch (err) {
          console.error('Error updating shift_end via sync helper:', err);
        }

      try {
        // Update vehicle mileage in database
        console.log('Updating vehicle mileage - vehicleNumber:', vehicleNumber, 'type:', typeof vehicleNumber, 'endOdo:', endOdo, 'type:', typeof endOdo);
        const freshVehicles = await supabaseService.getVehicles();
        console.log('Fresh vehicles loaded:', freshVehicles.length);
        console.log('Vehicle IDs in database:', freshVehicles.map(v => ({ id: v.id, name: v.name, idType: typeof v.id })));

        const currentVehicle = freshVehicles.find(v => v.id === vehicleNumber);
        console.log('Current vehicle found:', !!currentVehicle, 'vehicle:', currentVehicle);
        console.log('Current vehicle mileage:', currentVehicle?.mileage, 'type:', typeof currentVehicle?.mileage);

        if (!currentVehicle) {
          console.error('Vehicle not found in database with ID:', vehicleNumber);
          return;
        }

        const updatedVehicles = freshVehicles.map(v =>
          v.id === vehicleNumber ? { ...v, mileage: endOdo } : v
        );

        const updatedVehicle = updatedVehicles.find(v => v.id === vehicleNumber);
        console.log('Vehicle after update:', updatedVehicle);
        console.log('Mileage value being set:', endOdo, 'type:', typeof endOdo);

        // Update vehicle mileage via sync helper (prefer socket), fallback to supabase
        try {
          try {
            await syncUpdateVehicles(updatedVehicles);
            // Update local vehicles state optimistically
            setVehicles(prevVehicles => prevVehicles.map(v => v.id === vehicleNumber ? { ...v, mileage: endOdo } : v));
            console.log('Vehicle mileage updated via syncUpdateVehicles to:', endOdo, 'km');
          } catch (err) {
            console.warn('syncUpdateVehicles failed for mileage update, falling back to supabaseService.updateVehicles', err);
            await supabaseService.updateVehicles(updatedVehicles);
            setVehicles(prevVehicles => prevVehicles.map(v => v.id === vehicleNumber ? { ...v, mileage: endOdo } : v));
          }
        } catch (error) {
          console.error('Failed to update vehicle mileage via sync helper or supabase:', error);
        }
      } catch (error) {
        console.error('Failed to update vehicle mileage:', error);
        console.error('Error details:', error.message, error.details, error.hint);
        // Continue anyway, the shift was ended
      }

      // Update vehicle status to offline when ending shift
      await updateVehicleStatus('offline');

      // Show shift summary
      const shiftDuration = Math.round((now - (shiftStartTimestamp || 0)) / (1000 * 60)); // minutes
      alert(`Směna ukončena!\n\nCelková tržba: ${shiftRevenue} Kč\nHotovost: ${shiftCash} Kč\nUjetá vzdálenost: ${shiftDistance.toFixed(1)} km\nDélka směny: ${Math.floor(shiftDuration / 60)}h ${shiftDuration % 60}min`);

      console.log('Shift ended at:', new Date(now).toLocaleString(), 'Odo:', endOdo);
      console.log('Total shift distance:', shiftDistance, 'km');
      console.log('Total shift revenue:', shiftRevenue, 'Kč');
    };

    const isShiftActive = shiftStartTimestamp !== null && shiftEndTimestamp === null;

    // Enforce offline status when shift is not active
    useEffect(() => {
      if (!isShiftActive && driverStatus !== 'offline') {
        console.log('Shift not active, forcing driver status to offline');
        updateVehicleStatus('offline');
      }
    }, [isShiftActive, driverStatus]);

    // Calculate revenue for the current active shift
    const calculateCurrentShiftRevenue = useCallback(() => {
      if (!isShiftActive || !shiftStartTimestamp || !rideHistory.length) {
        return 0;
      }

      return rideHistory.filter(ride => {
        // Only count completed rides
        if (ride.status !== RideStatus.Completed) return false;

        const rideTime = new Date(ride.timestamp).getTime();

        // Check if ride was completed during the current active shift
        return rideTime >= shiftStartTimestamp;
      }).reduce((sum, ride) => sum + (ride.estimatedPrice || 0), 0);
    }, [isShiftActive, shiftStartTimestamp, rideHistory]);

    const currentShiftRevenue = calculateCurrentShiftRevenue();

  // Initialize shift planning service
  useEffect(() => {
    if (supabase && driverInfo) {
      const service = new ShiftPlanningService(supabase);
      setShiftPlanningService(service);
      
      // Load driver's shift plans
      loadShiftPlans(service, driverInfo.id);
    }
  }, [supabase, driverInfo]);

  const loadShiftPlans = async (service: ShiftPlanningService, driverId: number) => {
      try {
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        
        const plans = await service.getDriverShiftPlans(driverId, startOfMonth, endOfMonth);
        setShiftPlans(plans);
      } catch (error) {
        console.error('Error loading shift plans:', error);
      }
    };

  const handleCreateShift = async (shiftPlan: Omit<ShiftPlan, 'id' | 'createdAt' | 'updatedAt'>) => {
    if (!shiftPlanningService || !driverInfo) return;
    
    try {
      // Auto-assign driver ID and name from logged-in driver
      const shiftPlanWithDriver = {
        ...shiftPlan,
        driverId: driverInfo.id,
        driverName: driverInfo.name
      };
      
      if (shiftPlan.recurringPattern && shiftPlan.recurringPattern !== RecurringPattern.None && shiftPlan.recurringEndDate) {
        // Create recurring shifts
        await shiftPlanningService.createRecurringShiftPlans(
          shiftPlanWithDriver,
          shiftPlan.recurringPattern,
          shiftPlan.recurringEndDate
        );
      } else {
        // Create single shift
        await shiftPlanningService.createShiftPlan(shiftPlanWithDriver);
      }
      
      // Reload shift plans
      await loadShiftPlans(shiftPlanningService, driverInfo.id);
    } catch (error) {
      console.error('Error creating shift plan:', error);
      throw error;
    }
  };

    const handleUpdateShift = async (id: string, updates: Partial<ShiftPlan>) => {
      if (!shiftPlanningService) return;
      
      try {
        await shiftPlanningService.updateShiftPlan(id, updates);
        
        // Reload shift plans
        if (driverInfo) {
          await loadShiftPlans(shiftPlanningService, driverInfo.id);
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
        
        // Reload shift plans
        if (driverInfo) {
          await loadShiftPlans(shiftPlanningService, driverInfo.id);
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

    // Calculate cash payments for the current active shift
    const calculateCurrentShiftCash = useCallback(() => {
      if (!isShiftActive || !shiftStartTimestamp || !rideHistory.length) {
        return 0;
      }

      return rideHistory.filter(ride => {
        // Only count completed rides with cash payment during the current active shift
        if (ride.status !== RideStatus.Completed || ride.payment !== 'cash') return false;

        const rideTime = new Date(ride.timestamp).getTime();

        // Check if ride was completed during the current active shift
        return rideTime >= shiftStartTimestamp;
      }).reduce((sum, ride) => sum + (ride.estimatedPrice || 0), 0);
    }, [isShiftActive, shiftStartTimestamp, rideHistory]);

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
                         <p><span className="font-medium">Odkud:</span> {ride.stops[0]}</p>
                         <p><span className="font-medium">Kam:</span> {ride.stops[ride.stops.length - 1]}</p>
                         <p><span className="font-medium">Počet pasažérů:</span> {ride.passengers}</p>
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
                   {currentRide.status === RideStatus.InProgress && (
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
                    <p><span className="font-medium">{t('dashboard.pickup')}:</span> {currentRide.stops[0]}</p>
                    <p><span className="font-medium">{t('dashboard.destination')}:</span> {currentRide.stops[currentRide.stops.length - 1]}</p>
                    <p><span className="font-medium">Počet pasažérů:</span> {currentRide.passengers}</p>
                    <p><span className="font-medium">{t('dashboard.status')}:</span> {currentRide.status}</p>
                  </div>

                 <div className="mt-4 space-y-2">
                     {currentRide.status === RideStatus.Pending && (
                       <button onClick={acceptRide} className="w-full bg-green-600 hover:bg-green-700 py-2 rounded-lg btn-modern text-white font-medium">
                         Začít jízdu
                       </button>
                     )}
                     {currentRide.status === RideStatus.Accepted && (
                       <div className="space-y-2">
                         <button onClick={startRide} className="w-full bg-blue-600 hover:bg-blue-700 py-2 rounded-lg btn-modern text-white font-medium">
                           {t('dashboard.startRide')}
                         </button>
                         <button onClick={() => navigateToDestination()} className="w-full bg-purple-600 hover:bg-purple-700 py-2 rounded-lg btn-modern text-white font-medium">
                           🗺️ Navigovat ({preferredNavApp === 'google' ? 'Google Maps' : 'Mapy.cz'})
                         </button>
                       </div>
                     )}
                        {currentRide.status === RideStatus.InProgress && (
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

              <ShiftCalendar
                shiftPlans={shiftPlans}
                onDateSelect={handleDateSelect}
                onShiftClick={handleShiftClick}
                selectedDate={selectedDate}
              />
            </div>
           </div>
         )}



            {/* Ride History */}
            {showRideHistory && (
              <div className="glass card-hover p-4 rounded-2xl border border-slate-700/50">
                   <div className="flex justify-between items-center mb-3">
                     <h2 className="text-lg font-semibold text-white">{t('dashboard.recentRides')}</h2>
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
                          <span className="font-medium">Tržba aktuální směny:</span> {currentShiftRevenue} Kč
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
                          {useCustomShift && customShiftStart && customShiftEnd && customShiftDate && (
                            <div className="text-xs text-slate-400">
                              {new Date(customShiftDate).toLocaleDateString('cs-CZ')} • {customShiftStart} - {customShiftEnd}
                              <span className="text-xs text-slate-500 ml-1">(přes půlnoc)</span>
                            </div>
                          )}
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
                  onClick={() => setShowShiftModal(true)}
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

              <ShiftCalendar
                shiftPlans={shiftPlans}
                onDateSelect={handleDateSelect}
                onShiftClick={handleShiftClick}
                selectedDate={selectedDate}
              />
            </div>
          </div>
        )}

        {/* Chat Card */}
        {activeCard === 'chat' && (
          <div className="space-y-6">
            <div className="glass card-hover p-4 rounded-2xl border border-slate-700/50">
              <StreamChatDriver
                vehicleNumber={vehicleNumber || 0}
                driverName={user?.user_metadata?.name || user?.email || `Driver ${vehicleNumber}`}
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
           driverName={user?.user_metadata?.name || user?.email || licensePlate || `Vehicle ${vehicleNumber}`}
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
          driverId={driverInfo?.id}
          isDispatcher={false}
        />

        {/* Large Card Switch at Bottom */}
        <div className="fixed bottom-0 left-0 right-0 bg-slate-900/95 backdrop-blur-sm border-t border-slate-700/50 p-4">
          <div className="max-w-md mx-auto">
            <div className="flex rounded-2xl bg-slate-800/50 p-1 border border-slate-700/50">
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
                     <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 001.066 2.573c-.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-1.543-.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.573c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 001.066 2.573c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.572c-.94-1.543-.826-3.31-2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                   </svg>
                   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
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
