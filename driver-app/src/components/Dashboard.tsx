import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase, authService, geocodeAddress, SUPABASE_ENABLED } from '../supabaseClient';
import { supabaseService } from '../../../services/supabaseClient';
import { SUPABASE_ENABLED as SUPABASE_ENABLED_SERVICES } from '../../../services/supabaseClient';
import { RideLog, RideStatus } from '../types';
import { useTranslation } from '../contexts/LanguageContext';
import { notifyUser, initializeNotifications, requestWakeLock, releaseWakeLock, isWakeLockSupported } from '../utils/notifications';
import { ManualRideModal } from './ManualRideModal';
import { RideCompletionModal } from './RideCompletionModal';

import io from 'socket.io-client';

const Dashboard: React.FC = () => {
  const { t } = useTranslation();
  const watchIdRef = useRef<number | null>(null);
  const locationIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const [driverStatus, setDriverStatus] = useState('offline');
  const [breakEndTime, setBreakEndTime] = useState<number | null>(null);
  const [currentRide, setCurrentRide] = useState<RideLog | null>(null);
  const [pendingRides, setPendingRides] = useState<RideLog[]>([]);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [rideHistory, setRideHistory] = useState<RideLog[]>([]);
  const [shiftCash, setShiftCash] = useState<number>(0);
  const [shiftStartTime, setShiftStartTime] = useState<number | null>(null);
  const [customShiftStart, setCustomShiftStart] = useState<string>('');
  const [customShiftEnd, setCustomShiftEnd] = useState<string>('');
  const [customShiftDate, setCustomShiftDate] = useState<string>('');
  const [useCustomShift, setUseCustomShift] = useState<boolean>(false);
  const [socket, setSocket] = useState<any>(null);
  const [socketConnected, setSocketConnected] = useState(false);

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
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [selectedRecipient, setSelectedRecipient] = useState<string>('dispatcher');
  const [otherDrivers, setOtherDrivers] = useState<any[]>([]);
  const [vehicleNumber, setVehicleNumber] = useState<number | null>(null);
  const [licensePlate, setLicensePlate] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
   const [isOnline, setIsOnline] = useState(navigator.onLine);
   const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>('default');
   const [realtimeConnectionStatus, setRealtimeConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
   const [preferredNavApp, setPreferredNavApp] = useState<'google' | 'mapy'>('google');
   const [lastAcceptedRideId, setLastAcceptedRideId] = useState<string | null>(null);
   const [lastAcceptTime, setLastAcceptTime] = useState<number>(0);
   const [isRefreshing, setIsRefreshing] = useState(false);
    const [showManualRideModal, setShowManualRideModal] = useState(false);
     const [showCompletionModal, setShowCompletionModal] = useState(false);
    const [rideToComplete, setRideToComplete] = useState<RideLog | null>(null);
    const [showRideHistory, setShowRideHistory] = useState(false);
  const [historyFilter, setHistoryFilter] = useState<'2days' | 'week' | 'month' | 'all'>('2days');
    const [lastRefreshTime, setLastRefreshTime] = useState(0);
    const [lastSubscriptionRefresh, setLastSubscriptionRefresh] = useState(0);
    const [refreshTrigger, setRefreshTrigger] = useState(0);
    const [wakeLockActive, setWakeLockActive] = useState(false);

   // Debounced refresh function to prevent multiple simultaneous calls
   const refreshVehicleData = useCallback(async () => {
     const now = Date.now();
     if (isRefreshing || now - lastRefreshTime < 3000) {
       console.log('Refresh already in progress or too recent, skipping');
       return;
     }

     // Don't refresh if we just accepted a ride (prevent override)
     if (lastAcceptedRideId && now - lastAcceptTime < 10000) { // 10 second buffer
       console.log('Skipping refresh - recently accepted ride:', lastAcceptedRideId);
       return;
     }

     setIsRefreshing(true);
     setLastRefreshTime(now);
     setRefreshTrigger(prev => prev + 1);
     setTimeout(() => setIsRefreshing(false), 3000); // Prevent refreshes for 3 seconds
   }, [isRefreshing, lastRefreshTime, lastAcceptedRideId, lastAcceptTime]);

    // Auto-refresh disabled - real-time subscriptions handle updates
    const startAutoRefresh = () => {
      // Disabled to prevent excessive database requests
      return () => {};
    };

  useEffect(() => {
    // Initialize notifications and check permissions
    const initNotifications = async () => {
      const granted = await initializeNotifications(userId || undefined);
      setNotificationPermission(Notification.permission as NotificationPermission);
    };
    initNotifications();

    // Load preferred navigation app from localStorage
    const savedNavApp = localStorage.getItem('preferredNavApp') as 'google' | 'mapy';
    if (savedNavApp) {
      setPreferredNavApp(savedNavApp);
    }

    // Load custom shift settings from localStorage
    const savedCustomShift = localStorage.getItem('useCustomShift') === 'true';
    const savedShiftStart = localStorage.getItem('customShiftStart') || '';
    const savedShiftEnd = localStorage.getItem('customShiftEnd') || '';
    const savedShiftDate = localStorage.getItem('customShiftDate') || new Date().toISOString().split('T')[0];

    setUseCustomShift(savedCustomShift);
    setCustomShiftStart(savedShiftStart);
    setCustomShiftEnd(savedShiftEnd);
    setCustomShiftDate(savedShiftDate);

    // Monitor real-time connection status
    const checkRealtimeConnection = () => {
      // Simple check: if we can access supabase and it's enabled, assume connected
      // In a more sophisticated implementation, we could check actual channel states
      if (SUPABASE_ENABLED && supabase) {
        setRealtimeConnectionStatus('connected');
      } else {
        setRealtimeConnectionStatus('disconnected');
      }
    };

    checkRealtimeConnection();
    const connectionCheckInterval = setInterval(checkRealtimeConnection, 30000); // Check every 30 seconds

    // Get current user and their vehicle info
    const getVehicleInfo = async () => {
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Vehicle data loading timed out after 30 seconds')), 30000)
      );

      try {
        console.log('Starting getVehicleInfo... SUPABASE_ENABLED:', SUPABASE_ENABLED);
        setIsLoading(true);
        setError(null);

        await Promise.race([timeoutPromise, (async () => {

        console.log('Getting current user...');
        const user = await authService.getCurrentUser();
        console.log('Auth result:', { user: !!user });
        if (!user) {
          setError('No user logged in');
          return;
        }

        setUserId(user.id);
        console.log('User ID set:', user.id, 'Email:', user.email);

        // Find vehicle by driver's email
        console.log('Querying vehicles for email:', user.email);
        const vehicles = await supabaseService.getVehicles();
        const vehicleData = vehicles.find(v => v.email === user.email);

        console.log('Vehicle query result:', { data: vehicleData });
        if (!vehicleData) {
          setError('Vehicle not found for this email: ' + user.email);
          return;
        }

        const vehicleNum = vehicleData.id;
        setVehicleNumber(vehicleNum);
        console.log('Vehicle number set to:', vehicleNum);

        // Get vehicle status and license plate
        const newStatus = vehicleData.status === 'AVAILABLE' ? 'available' :
                         vehicleData.status === 'BUSY' ? 'on_ride' :
                         vehicleData.status === 'BREAK' ? 'break' :
                         vehicleData.status === 'OUT_OF_SERVICE' ? 'offline' : 'offline';
        setDriverStatus(newStatus);

        // Set shift start time when driver becomes available (starts shift)
        if (newStatus === 'available' && !shiftStartTime) {
          const now = Date.now();
          setShiftStartTime(now);
          console.log('Shift started at:', new Date(now).toLocaleString());
        }

        // Reset shift when driver goes offline
        if (newStatus === 'offline' && shiftStartTime) {
          setShiftStartTime(null);
          setShiftCash(0);
          console.log('Shift ended - cash reset');
        }

        setLicensePlate(vehicleData.licensePlate);

        // Get pending and accepted rides for this vehicle (queue: oldest first)
         console.log('🔍 Querying for rides with vehicle_id:', vehicleNum, 'status: pending/accepted');
         try {
           const pending = await supabaseService.getRideLogsByVehicle(vehicleNum, 'pending');
           const accepted = await supabaseService.getRideLogsByVehicle(vehicleNum, 'accepted');
           const activeRides = [...pending, ...accepted];
           console.log('📋 Found active rides:', activeRides.length, 'rides');
           if (activeRides.length > 0) {
             console.log('📋 Active ride details:', activeRides.map(r => ({ id: r.id, customer: r.customerName, status: r.status })));
           }
           setPendingRides(activeRides);
         } catch (error) {
           console.warn('❌ Could not load active rides:', error);
           setPendingRides([]);
         }

        // Debug: Get all rides for this vehicle to see what's in the database
        try {
          const allRides = await supabaseService.getRideLogsByVehicle(vehicleNum, undefined);
          console.log('All rides for vehicle', vehicleNum, ':', allRides.map(r => ({ id: r.id, status: r.status, customerName: r.customerName })));
        } catch (error) {
          console.warn('Could not load all rides for debugging:', error);
        }

        // Get active ride for this vehicle (accepted or in progress)
        try {
          const acceptedRides = await supabaseService.getRideLogsByVehicle(vehicleNum, 'accepted');
          const inProgressRides = await supabaseService.getRideLogsByVehicle(vehicleNum, 'in_progress');
          const activeRides = [...acceptedRides, ...inProgressRides];
          console.log('Active rides found:', activeRides.length, activeRides.map(r => ({ id: r.id, status: r.status })));
          if (activeRides.length > 0) {
            setCurrentRide(activeRides[0]);
          } else {
            console.log('No active rides found, setting currentRide to null');
            setCurrentRide(null);
          }
        } catch (error) {
          console.warn('Could not load active rides:', error);
        }

         // Get recent rides for this vehicle (include completed rides for history and revenue)
          try {
            const recentRides = await supabaseService.getRideLogsByVehicle(vehicleNum, undefined, 20);
            console.log('📊 Loaded rides for history:', recentRides.length, 'rides');
            console.log('📊 Ride statuses:', recentRides.map(r => ({ id: r.id, status: r.status, price: r.estimatedPrice })));
            // Include completed rides for history display and revenue calculation
            setRideHistory(recentRides);

           // Calculate shift cash from completed rides since shift start
           if (shiftStartTime) {
             const shiftCashAmount = calculateShiftCash(recentRides, shiftStartTime);
             console.log('💰 Calculated shift cash:', shiftCashAmount, 'Kč from', recentRides.filter(r => r.status === RideStatus.Completed).length, 'completed rides');
             setShiftCash(shiftCashAmount);
           }
        } catch (error) {
          console.warn('Could not load ride history:', error);
          setRideHistory([]);
        }

        // Get other drivers for chat (limit to reduce data transfer)
         console.log('Getting other drivers...');
         try {
           const allVehicles = await supabaseService.getVehicles();
           const otherVehicles = allVehicles.filter(v => v.id !== vehicleNum).slice(0, 10); // Limit to 10 other vehicles
           console.log('Other vehicles:', otherVehicles.length);
           // Get driver names
           const driverIds = otherVehicles.map(v => v.driverId).filter(id => id);
           console.log('Getting driver names for IDs:', driverIds);
           const allPeople = await supabaseService.getPeople();
           const driversData = allPeople.filter(p => driverIds.includes(p.id));
           console.log('Driver names query result:', { count: driversData?.length });
           const driversMap = (driversData || []).reduce((acc, d) => ({ ...acc, [d.id]: d.name }), {});
           const otherDriversList = otherVehicles.map(v => ({
             id: v.id,
             name: driversMap[v.driverId] || v.name,
             vehicleId: v.id
           })).filter(d => d.name);
           setOtherDrivers(otherDriversList);
          } catch (error) {
            console.warn('Could not load other vehicles and drivers:', error);
          }

        // Load recent messages (limit to reduce data)
           try {
              const msgs = await supabaseService.getDriverMessages();
              console.log('All messages from DB:', msgs.length);
              const filtered = msgs.filter((m: any) => {
                const isForThisDriver = m.receiver_id === `driver_${vehicleNumber}` ||
                                       m.sender_id === `driver_${vehicleNumber}` ||
                                       m.receiver_id === 'general' ||
                                       (m.sender_id === 'dispatcher' && m.receiver_id === `driver_${vehicleNumber}`);
                return isForThisDriver;
              }).sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
                .slice(0, 50); // Limit to 50 most recent messages
             console.log('Filtered messages count:', filtered.length);
             setMessages(filtered);
           } catch (error) {
             console.warn('Could not load messages:', error);
           }

          console.log('getVehicleInfo completed successfully');

        })()]);

       } catch (err: any) {
         console.error('Error loading vehicle info:', err);
         setError('Failed to load vehicle data: ' + err.message);
       } finally {
         console.log('Setting isLoading to false');
         setIsLoading(false);
       }
    };

    getVehicleInfo();

    // Ride subscription will be set up after vehicleNumber is known







    return () => {
      clearInterval(connectionCheckInterval);
    };
  }, []);

  // Socket.io connection for real-time messaging and ride updates
   useEffect(() => {
     if (!userId || !vehicleNumber) return;

     const getToken = async () => {
       const { data: { session } } = await supabase.auth.getSession();
       return session?.access_token;
     };

     const initSocket = async () => {
       const token = await getToken();

        const socketInstance = io(import.meta.env.VITE_SOCKET_URL || 'http://localhost:3000', {
         auth: { token },
         transports: ['websocket', 'polling']
       });

       socketInstance.on('connect', () => {
         console.log('Driver app connected to server');
         setSocketConnected(true);

         // Join shift room for ride updates
         socketInstance.emit('join_shift', `driver_shift_${vehicleNumber}`);

         // Join group chat for shift messages
         socketInstance.emit('join_group_chat', `driver_shift_${vehicleNumber}`);

         // Join dispatcher chat room
         socketInstance.emit('join_chat_dispatcher_driver', {
           dispatcherId: 'dispatcher', // Assuming dispatcher ID is 'dispatcher'
           driverId: vehicleNumber
         });
       });

       socketInstance.on('disconnect', () => {
         console.log('Driver app disconnected from server');
         setSocketConnected(false);
       });

       // Listen for new messages
       socketInstance.on('new_message', (messageData) => {
         console.log('Driver app received message:', messageData);
         setMessages(prev => {
           // Check if message already exists
           const exists = prev.some(m => m.id === messageData.id);
           if (!exists) {
             return [messageData, ...prev];
           }
           return prev;
         });

         // Notify user for new messages
         if (messageData.sender_id !== `driver_${vehicleNumber}`) {
           notifyUser('message');
         }
       });

       // Listen for ride updates
       socketInstance.on('ride_updated', (rideData) => {
         console.log('Driver app received ride update:', rideData);
         if (rideData.vehicleId === vehicleNumber) {
           refreshVehicleData();
         }
       });

       // Listen for status changes
       socketInstance.on('status_changed', (data) => {
         console.log('Driver app received status change:', data);
         refreshVehicleData();
       });

       // Listen for ride cancellations
       socketInstance.on('ride_cancelled', (data) => {
         console.log('Driver app received ride cancellation:', data);
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
   }, [userId, vehicleNumber]);

   // Join appropriate chat room when recipient changes
   useEffect(() => {
     if (!socket || !socketConnected || !vehicleNumber) return;

     if (selectedRecipient === 'dispatcher') {
       socket.emit('join_chat_dispatcher_driver', {
         dispatcherId: 'dispatcher',
         driverId: vehicleNumber
       });
     } else if (selectedRecipient !== 'general' && selectedRecipient !== 'dispatcher') {
       // Join driver-to-driver chat room
       socket.emit('join_chat_driver_driver', {
         driverId1: vehicleNumber,
         driverId2: parseInt(selectedRecipient)
       });
     }
   }, [selectedRecipient, socket, socketConnected, vehicleNumber]);

  // GPS Location tracking and sending
  useEffect(() => {
    if (!vehicleNumber) {
      return;
    }

    if (!navigator.geolocation) {
      return;
    }

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
        const { latitude, longitude } = position.coords;
        currentPosition = { lat: latitude, lng: longitude };
        setLocation(currentPosition);
        console.log('GPS position updated:', currentPosition, 'Accuracy:', position.coords.accuracy);
      },
      (error) => {
        console.error('GPS error:', error);
        switch(error.code) {
          case error.PERMISSION_DENIED:
            console.error('GPS permission denied by user');
            break;
          case error.POSITION_UNAVAILABLE:
            console.error('GPS position unavailable');
            break;
          case error.TIMEOUT:
            console.error('GPS timeout');
            break;
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
    locationIntervalRef.current = setInterval(() => {
      if (currentPosition && vehicleNumber && socket && socketConnected) {
        console.log('Sending real-time location via socket:', {
          shiftId: `driver_shift_${vehicleNumber}`,
          vehicleId: vehicleNumber,
          latitude: currentPosition.lat,
          longitude: currentPosition.lng
        });

        socket.emit('position_update', {
          shiftId: `driver_shift_${vehicleNumber}`,
          vehicleId: vehicleNumber,
          latitude: currentPosition.lat,
          longitude: currentPosition.lng
        });
      } else {
        console.log('Not sending location - position:', !!currentPosition, 'vehicle:', vehicleNumber, 'socket:', !!socket, 'connected:', socketConnected);
      }
    }, 30000); // Send every 30 seconds for real-time tracking

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
   }, [vehicleNumber, socket, socketConnected]);

     // Auto-refresh messages every 2 minutes (reduced from 5)
     useEffect(() => {
       if (!vehicleNumber) return;

       const refreshInterval = setInterval(async () => {
         try {
            const msgs = await supabaseService.getDriverMessages();
            // Filter for this driver (more flexible)
            const filtered = msgs.filter((m: any) =>
              m.receiver_id === `driver_${vehicleNumber}` ||
              m.receiver_id === vehicleNumber?.toString() ||
              m.sender_id === `driver_${vehicleNumber}` ||
              m.receiver_id === 'general' ||
              (m.sender_id === 'dispatcher' && m.receiver_id === `driver_${vehicleNumber}`) ||
              (m.sender_id === 'dispatcher' && m.receiver_id === vehicleNumber?.toString())
            ).sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

           // Only update if we have new messages or different data
           const currentMessageIds = messages.map(m => m.id).sort();
           const newMessageIds = filtered.map(m => m.id).sort();

           if (JSON.stringify(currentMessageIds) !== JSON.stringify(newMessageIds)) {
             setMessages(filtered);
             console.log('Messages refreshed automatically');
           }
         } catch (err) {
           console.warn('Error refreshing messages:', err);
         }
        }, 300000); // Refresh every 5 minutes to reduce data transfer

       return () => clearInterval(refreshInterval);
     }, [vehicleNumber, messages]);

   // Auto-refresh ride data every 15 seconds (for local mode without real-time)


   // Save preferred navigation app to localStorage
   useEffect(() => {
     localStorage.setItem('preferredNavApp', preferredNavApp);
   }, [preferredNavApp]);

   // Manage screen wake lock based on driver status and ride activity
   useEffect(() => {
     const shouldKeepScreenOn = driverStatus === 'available' || driverStatus === 'on_ride' || currentRide !== null;

     const manageWakeLock = async () => {
       if (shouldKeepScreenOn && !wakeLockActive && isWakeLockSupported()) {
         const success = await requestWakeLock();
         if (success) {
           setWakeLockActive(true);
           console.log('Screen wake lock activated - display will stay on');
         }
       } else if (!shouldKeepScreenOn && wakeLockActive) {
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
          // Update vehicle status to available
          await supabase.from('vehicles').update({
            status: 'AVAILABLE'
          }).eq('id', vehicleNumber);

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
    if (!vehicleNumber) return;

    try {
      let breakEndTimeValue: number | null = null;
      let vehicleStatus = status;

      // Handle break times
      if (status.startsWith('break_')) {
        const breakMinutes = parseInt(status.split('_')[1]);
        breakEndTimeValue = Date.now() + (breakMinutes * 60 * 1000);
        setBreakEndTime(breakEndTimeValue);
        vehicleStatus = 'BREAK'; // Vehicle status should be BREAK
        status = 'break'; // Driver status stored as 'break'
      } else {
        setBreakEndTime(null);
        // Map driver status to vehicle status
        if (status === 'available') vehicleStatus = 'AVAILABLE';
        else if (status === 'on_ride') vehicleStatus = 'BUSY';
        else if (status === 'offline') vehicleStatus = 'OUT_OF_SERVICE';
        else vehicleStatus = status.toUpperCase();

        // Manage shift timing
        if (status === 'available' && !shiftStartTime) {
          // Start new shift when becoming available
          const now = Date.now();
          setShiftStartTime(now);
          console.log('Shift started at:', new Date(now).toLocaleString());
        } else if (status === 'offline') {
          // End shift when going offline
          setShiftStartTime(null);
          setShiftCash(0);
          console.log('Shift ended - cash reset');
        }
      }

      console.log(`Updating vehicle ${vehicleNumber} status to ${vehicleStatus}`);

      // Update vehicle status using service
      try {
        const vehicles = await supabaseService.getVehicles();
        const updatedVehicles = vehicles.map(v =>
          v.id === vehicleNumber ? { ...v, status: vehicleStatus } : v
        );
        await supabaseService.updateVehicles(updatedVehicles);
      } catch (error) {
        console.error('Failed to update vehicle status:', error);
        alert('Failed to update vehicle status: ' + error.message);
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
            console.log('acceptRideSpecific: Calling supabaseService.addRideLog...');
            console.log('acceptRideSpecific: SUPABASE_ENABLED =', SUPABASE_ENABLED_SERVICES);
            await supabaseService.addRideLog(updatedRide);
            console.log('acceptRideSpecific: Ride successfully saved to database');

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
             await supabaseService.updateVehicles(updatedVehicles);
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
          const updatedRide = { ...currentRide, status: RideStatus.InProgress, startedAt: Date.now() };
          try {
            await supabaseService.addRideLog(updatedRide);
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
             await supabaseService.updateVehicles(updatedVehicles);
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
        await supabaseService.addRideLog(updatedRide);
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

  const navigateToDestination = async (ride?: RideLog, navApp?: 'google' | 'mapy') => {
    const targetRide = ride || currentRide;
    if (targetRide) {
      // Use provided navApp or fall back to preferred navigation app
      const appToUse = navApp || preferredNavApp;
      let url: string;

      try {
        // Geocode all stops
        const stopsCoords = await Promise.all(targetRide.stops.map(stop => geocodeAddress(stop, 'cs')));

        if (appToUse === 'mapy') {
          // For Mapy.cz, use the destination with waypoints (pickup as first waypoint)
          const destination = stopsCoords[stopsCoords.length - 1];
          const waypoints = stopsCoords.slice(0, -1); // All stops except destination

          let mapyUrl = `https://mapy.cz/zakladni?x=${destination.lon}&y=${destination.lat}&z=15`;
          if (waypoints.length > 0) {
            const routePoints = waypoints.map((wp, index) => `&rl${index + 1}=${wp.lon}%2C${wp.lat}`);
            mapyUrl += routePoints.join('');
          }
          url = mapyUrl;
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
        if (appToUse === 'mapy') {
          const destination = targetRide.stops[targetRide.stops.length - 1];
          url = `https://mapy.cz/zakladni?q=${encodeURIComponent(destination)}`;
        } else {
          if (targetRide.navigationUrl) {
            url = targetRide.navigationUrl;
          } else {
            const destination = targetRide.stops[targetRide.stops.length - 1];
            url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
          }
        }
      }

      window.open(url, '_blank');
    }
  };

    const sendMessage = async () => {
      if (!newMessage.trim() || !vehicleNumber || !socket || !socketConnected) {
        console.warn('Cannot send message: empty message, no vehicle number, or socket not connected');
        return;
      }

      const receiverId = selectedRecipient === 'dispatcher' ? 'dispatcher' :
                        selectedRecipient === 'general' ? 'general' :
                        `driver_${selectedRecipient}`;

      // Determine room name based on recipient
      let room;
      let chatType;
      if (selectedRecipient === 'dispatcher') {
        room = `chat:Ddispatcher_R${vehicleNumber}`;
        chatType = 'dispatcher_driver';
      } else if (selectedRecipient === 'general') {
        room = `shift_chat:driver_shift_${vehicleNumber}`;
        chatType = 'group';
      } else {
        room = `chat:R${vehicleNumber}_R${selectedRecipient}`;
        chatType = 'driver_driver';
      }

      const messageData = {
        room,
        message: newMessage.trim(),
        senderId: `driver_${vehicleNumber}`,
        receiverId,
        type: chatType
      };

      console.log('Sending message via Socket.io:', messageData);

      try {
        socket.emit('message', messageData);
        console.log('Message sent successfully via Socket.io');
        setNewMessage('');
      } catch (error) {
        console.error('Failed to send message via Socket.io:', error);
        alert('Failed to send message. Please try again.');
      }
    };

  const getSenderName = (senderId: string) => {
    if (senderId === 'dispatcher') return 'Dispečer';
    if (senderId === `driver_${vehicleNumber}`) return 'Vy';
    const driver = otherDrivers.find(d => `driver_${d.id}` === senderId);
    return driver ? driver.name : 'Neznámý řidič';
  };

   const formatMessageTime = (timestamp: string) => {
     return new Date(timestamp).toLocaleTimeString('cs-CZ', {
       hour: '2-digit',
       minute: '2-digit'
     });
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
         await supabaseService.addRideLog(acceptedRide);

         // Update vehicle status to BUSY for next ride
         const freeAt = nextRide.estimatedCompletionTimestamp || (Date.now() + 30 * 60 * 1000);
         const vehicles = await supabaseService.getVehicles();
         const updatedVehicles = vehicles.map(v =>
           v.id === vehicleNumber ? { ...v, status: 'BUSY', freeAt } : v
         );
         await supabaseService.updateVehicles(updatedVehicles);

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



  // Function to check current table structure
  const checkTableStructure = async () => {
    console.log('Checking locations table structure...');

    try {
      // Try to get table info by describing it
      const { data, error } = await supabase.rpc('describe_table', {
        table_name: 'locations'
      });

      if (error) {
        console.error('Could not get table structure:', error);
        console.log('This is expected - describe_table function may not exist');
        console.log('Please check the table manually in Supabase dashboard');
        return;
      }

      console.log('Table structure:', data);

    } catch (err) {
      console.error('Error checking table structure:', err);
    }
  };



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
      <div className="max-w-md mx-auto space-y-6">
        <h1 className="text-2xl font-bold text-center text-white">{t('dashboard.title')} - {licensePlate || `Vehicle ${vehicleNumber}`}</h1>

         {/* Status */}
         <div className="glass card-hover p-4 rounded-2xl border border-slate-700/50">
           <label className="block text-sm font-medium mb-2 text-slate-300">{t('dashboard.status')}</label>
            <select
              value={driverStatus}
              onChange={(e) => updateVehicleStatus(e.target.value)}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white focus:ring-2 focus:ring-primary focus:border-primary"
            >
             <option value="available">{t('dashboard.available')}</option>
             <option value="on_ride">{t('dashboard.onRide')}</option>
             <option value="break_10">Pauza 10 min</option>
             <option value="break_20">Pauza 20 min</option>
             <option value="break_30">Pauza 30 min</option>
             <option value="break_60">Pauza 1 hod</option>
             <option value="pause">{t('dashboard.pause')}</option>
             <option value="refueling">{t('dashboard.refueling')}</option>
             <option value="offline">{t('dashboard.offline')}</option>
           </select>
           {driverStatus === 'break' && breakEndTime && (
             <div className="mt-2 text-sm text-warning">
               {t('dashboard.breakEndsIn')}: {Math.max(0, Math.ceil((breakEndTime - Date.now()) / (1000 * 60)))} min
             </div>
           )}
         </div>

         {/* Manual Ride Button */}
         <div className="glass card-hover p-4 rounded-2xl border border-slate-700/50">
           <button
             onClick={() => setShowManualRideModal(true)}
             className="w-full bg-blue-600 hover:bg-blue-700 py-3 rounded-lg btn-modern text-white font-bold text-lg shadow-lg"
           >
             ➕ Přidat přímou jízdu
           </button>
           <p className="text-xs text-slate-400 mt-2 text-center">
             Pro zákazníky, kteří přijdou přímo k vozidlu
           </p>
         </div>

        {/* New Rides */}
        {pendingRides.length > 0 && (
          <div className="glass card-hover p-4 rounded-2xl border border-slate-700/50">
            <h2 className="text-lg font-semibold mb-3 text-white">Nové jízdy</h2>
            <div className="space-y-3">
              {pendingRides.map((ride) => (
                <div key={ride.id} className="bg-slate-800/50 rounded-lg p-3 border border-slate-600">
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
            <h2 className="text-lg font-semibold mb-3 text-white">{t('dashboard.currentRide')}</h2>
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
                        🗺️ Navigovat ({preferredNavApp === 'google' ? 'Google Maps' : 'Mapy.cz'})
                      </button>
                   </div>
                 )}
             </div>
          </div>
        )}

        {/* Location */}
        <div className="glass card-hover p-4 rounded-2xl border border-slate-700/50">
          <label className="block text-sm font-medium mb-2 text-slate-300">{t('dashboard.currentLocation')}</label>
          <p className="text-slate-300">
            {location ? `${location.lat.toFixed(6)}, ${location.lng.toFixed(6)}` : t('dashboard.locationNotAvailable')}
          </p>
          {location && (
            <p className="text-xs text-slate-400 mt-1">
              Last updated: {new Date().toLocaleTimeString()}
            </p>
          )}

            {/* Network Status Indicator */}
            <div className="flex items-center gap-2 mt-2">
              <div className={`w-3 h-3 rounded-full ${isOnline ? 'bg-green-400' : 'bg-red-400'}`}></div>
              <span className="text-xs text-slate-400">
                {isOnline ? 'Online' : 'Offline'}
              </span>
            </div>

            {/* Real-time Connection Status Indicator */}
            <div className="flex items-center gap-2 mt-2">
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

            {/* Notification Permission Indicator */}
            {notificationPermission !== 'granted' && (
              <div className="flex items-center gap-2 mt-2">
                <div className="w-3 h-3 rounded-full bg-yellow-400"></div>
                <span className="text-xs text-yellow-400">
                  Upozornění: Povolte notifikace pro lepší zážitek
                </span>
                <button
                  onClick={async () => {
                    const granted = await initializeNotifications(userId || undefined);
                    setNotificationPermission(Notification.permission as NotificationPermission);
                  }}
                  className="text-xs bg-yellow-600 hover:bg-yellow-700 px-2 py-1 rounded text-white"
                >
                  Povolit
                </button>
              </div>
            )}

            {/* Screen Wake Lock Indicator */}
            {isWakeLockSupported() && (
              <div className="flex items-center gap-2 mt-2">
                <div className={`w-3 h-3 rounded-full ${wakeLockActive ? 'bg-green-400' : 'bg-gray-400'}`}></div>
                <span className="text-xs text-slate-400">
                  {wakeLockActive ? 'Obrazovka zůstane zapnutá' : 'Obrazovka se může vypnout'}
                </span>
              </div>
            )}
        </div>



        {/* Messaging */}
        <div className="glass card-hover p-4 rounded-2xl border border-slate-700/50">
          <h2 className="text-lg font-semibold mb-3 text-white">{t('dashboard.messages')}</h2>
          <div className="h-40 overflow-y-auto mb-3 bg-slate-800/50 rounded-lg p-2">
            {messages.length > 0 ? (
              messages
                .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
                .map((msg, idx) => (
                  <div key={msg.id || idx} className="text-sm text-slate-300 mb-2 p-2 bg-slate-800/30 rounded">
                     <div className="flex justify-between items-start mb-1">
                       <div className="flex items-center gap-2">
                         <strong className="text-primary text-xs">
                           {getSenderName(msg.sender_id)}
                         </strong>
                         {msg.receiver_id === 'general' && (
                           <span className="text-xs bg-aurora-4 text-slate-900 px-1.5 py-0.5 rounded-full font-medium">
                             VŠEOBECNÝ
                           </span>
                         )}
                       </div>
                       <span className="text-xs text-slate-400">
                         {formatMessageTime(msg.timestamp)}
                       </span>
                     </div>
                     <div className="text-slate-200 text-sm leading-relaxed">
                       {msg.message}
                     </div>
                  </div>
                ))
            ) : (
              <p className="text-sm text-slate-400 italic text-center py-8">Žádné zprávy zatím</p>
            )}
          </div>
            <div className="space-y-2">
               <select
                 value={selectedRecipient}
                 onChange={(e) => setSelectedRecipient(e.target.value)}
                 className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white focus:ring-2 focus:ring-primary focus:border-primary"
               >
                 <option value="general">Všeobecný chat (celá směna)</option>
                 <option value="dispatcher">Dispečer</option>
                 {otherDrivers.map(driver => (
                   <option key={driver.id} value={driver.id}>{driver.name}</option>
                 ))}
               </select>
              <input
                type="text"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white focus:ring-2 focus:ring-primary focus:border-primary"
                placeholder={t('dashboard.typeMessage')}
              />
               <button
                 onClick={sendMessage}
                 disabled={!newMessage.trim() || !socketConnected}
                 className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg btn-modern text-white font-medium"
               >
                {t('dashboard.send')}
              </button>
            </div>
        </div>

        {/* Ride History */}
        {showRideHistory && (
          <div className="glass card-hover p-4 rounded-2xl border border-slate-700/50">
               <div className="flex justify-between items-center mb-3">
                 <h2 className="text-lg font-semibold text-white">{t('dashboard.recentRides')}</h2>
                 <div className="flex items-center space-x-2">
                 <div className="text-sm text-slate-300">
                   <span className="font-medium">Tržba směny:</span> {shiftCash} Kč
                     {useCustomShift && customShiftStart && customShiftEnd && customShiftDate ? (
                       <div className="text-xs text-slate-400 mt-1">
                         {new Date(customShiftDate).toLocaleDateString('cs-CZ')} • {customShiftStart} - {customShiftEnd}
                         <div className="text-xs text-slate-500">
                           (včetně přes půlnoc)
                         </div>
                       </div>
                     ) : shiftStartTime ? (
                       <div className="text-xs text-slate-400 mt-1">
                         Od: {new Date(shiftStartTime).toLocaleTimeString('cs-CZ', {
                           hour: '2-digit',
                           minute: '2-digit'
                         })}
                       </div>
                     ) : null}
                   </div>
                   <button
                     onClick={() => setShowRideHistory(false)}
                     className="p-1 text-slate-400 hover:text-white hover:bg-slate-700 rounded transition-colors"
                     title="Hide ride history"
                   >
                     <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                       <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                     </svg>
                   </button>
                 </div>
                </div>

                {/* History Filters */}
                <div className="flex flex-wrap gap-2 mb-3">
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
                   <span className="font-medium">Tržba směny:</span> {shiftCash} Kč
                   {useCustomShift && customShiftStart && customShiftEnd && customShiftDate && (
                     <div className="text-xs text-slate-400">
                       {new Date(customShiftDate).toLocaleDateString('cs-CZ')} • {customShiftStart} - {customShiftEnd}
                       <span className="text-xs text-slate-500 ml-1">(přes půlnoc)</span>
                     </div>
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

        {/* Navigation Settings */}
        <div className="glass card-hover p-4 rounded-2xl border border-slate-700/50">
          <h2 className="text-lg font-semibold mb-3 text-white">Nastavení navigace</h2>
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Preferovaná navigační aplikace
              </label>
              <div className="flex gap-2">
                <button
                  onClick={() => setPreferredNavApp('google')}
                  className={`flex-1 py-2 px-3 rounded-lg btn-modern text-white font-medium text-sm ${
                    preferredNavApp === 'google'
                      ? 'bg-blue-600 hover:bg-blue-700'
                      : 'bg-slate-700 hover:bg-slate-600'
                  }`}
                >
                  Google Maps
                </button>
                <button
                  onClick={() => setPreferredNavApp('mapy')}
                  className={`flex-1 py-2 px-3 rounded-lg btn-modern text-white font-medium text-sm ${
                    preferredNavApp === 'mapy'
                      ? 'bg-green-600 hover:bg-green-700'
                      : 'bg-slate-700 hover:bg-slate-600'
                  }`}
                >
                  Mapy.cz
                </button>
              </div>
            </div>
          </div>
        </div>

           {/* Logout */}
          <button
           onClick={() => supabase.auth.signOut()}
           className="w-full bg-danger hover:bg-red-700 py-3 rounded-2xl btn-modern text-white font-medium shadow-frost"
         >
           {t('dashboard.logout')}
         </button>
       </div>

       {/* Manual Ride Modal */}
       {showManualRideModal && vehicleNumber && (
         <ManualRideModal
           onClose={() => setShowManualRideModal(false)}
           vehicleNumber={vehicleNumber}
           licensePlate={licensePlate || `Vehicle ${vehicleNumber}`}
           onRideAdded={handleManualRideAdded}
           onNavigateToDestination={async (stops, navApp) => {
             // Create a temporary ride object for navigation
             const tempRide = { stops } as any;
             await navigateToDestination(tempRide, navApp);
           }}
           preferredNavApp={preferredNavApp}
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
         />
        )}


      </div>
    );
  };

export default Dashboard;
