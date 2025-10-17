import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase, supabaseService, authService, geocodeAddress, SUPABASE_ENABLED } from '../supabaseClient';
import { RideLog, RideStatus } from '../types';
import { useTranslation } from '../contexts/LanguageContext';
import { notifyUser, initializeNotifications } from '../utils/notifications';
import { ManualRideModal } from './ManualRideModal';
import { RideCompletionModal } from './RideCompletionModal';

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
  const [dailyCash, setDailyCash] = useState<number>(0);
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
    const [showRideHistory, setShowRideHistory] = useState(true);
    const [lastRefreshTime, setLastRefreshTime] = useState(0);
    const [lastSubscriptionRefresh, setLastSubscriptionRefresh] = useState(0);
    const [refreshTrigger, setRefreshTrigger] = useState(0);

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

   // Auto-refresh function that can access refreshVehicleData
   const startAutoRefresh = () => {
     const refreshInterval = setInterval(async () => {
       if (vehicleNumber) {
         try {
           console.log('Auto-refreshing ride data...');
           await refreshVehicleData();
         } catch (err) {
           console.warn('Error auto-refreshing ride data:', err);
         }
       }
     }, 10000); // Refresh every 10 seconds (reduced from 30)

     return () => clearInterval(refreshInterval);
   };

  useEffect(() => {
    // Initialize notifications and check permissions
    const initNotifications = async () => {
      const granted = await initializeNotifications();
      setNotificationPermission(Notification.permission as NotificationPermission);
    };
    initNotifications();

    // Load preferred navigation app from localStorage
    const savedNavApp = localStorage.getItem('preferredNavApp') as 'google' | 'mapy';
    if (savedNavApp) {
      setPreferredNavApp(savedNavApp);
    }

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
        console.log('Vehicle data:', vehicleData);
        setDriverStatus(vehicleData.status === 'AVAILABLE' ? 'available' :
                        vehicleData.status === 'BUSY' ? 'on_ride' :
                        vehicleData.status === 'BREAK' ? 'break' :
                        vehicleData.status === 'OUT_OF_SERVICE' ? 'offline' : 'offline');
        setLicensePlate(vehicleData.licensePlate);

        // Get pending rides for this vehicle (queue: oldest first)
        console.log('Querying for rides with vehicle_id:', vehicleNum, 'status: pending');
        try {
          const pending = await supabaseService.getRideLogsByVehicle(vehicleNum, 'pending');
          console.log('Found pending rides:', pending);
          setPendingRides(pending);
        } catch (error) {
          console.warn('Could not load pending rides:', error);
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

        // Get all rides for this vehicle (completed, pending, accepted, etc.)
        try {
          const history = await supabaseService.getRideLogsByVehicle(vehicleNum, undefined, 20);
          setRideHistory(history);

          // Calculate daily cash from completed rides today
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const todayCompleted = history.filter(ride =>
            ride.status === RideStatus.Completed &&
            new Date(ride.timestamp) >= today
          );
          const totalCash = todayCompleted.reduce((sum, ride) => sum + (ride.estimatedPrice || 0), 0);
          setDailyCash(totalCash);
        } catch (error) {
          console.warn('Could not load ride history:', error);
          setRideHistory([]);
        }

        // Get other drivers for chat
        console.log('Getting other drivers...');
        try {
          const allVehicles = await supabaseService.getVehicles();
          const otherVehicles = allVehicles.filter(v => v.id !== vehicleNum);
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

         // Load messages
         try {
           const msgs = await supabaseService.getDriverMessages();
           const filtered = msgs.filter((m: any) =>
             m.sender_id === 'dispatcher' ||
             m.receiver_id === `driver_${vehicleNumber}` ||
             m.sender_id === `driver_${vehicleNumber}` ||
             m.receiver_id === 'general'
           ).sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
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

  // Subscribe to driver messages with improved error handling
      const messageChannel = supabase
        .channel('driver_messages_global')
         .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'driver_messages' }, (payload) => {
          console.log('New driver message:', payload);
            // Check if the message is for this vehicle or general
            if (vehicleNumber && (
              payload.new.sender_id === `driver_${vehicleNumber}` ||
              payload.new.receiver_id === `driver_${vehicleNumber}` ||
              payload.new.receiver_id === 'general'
            )) {
              setMessages(prev => [...prev, payload.new]);
              // Notify for dispatcher or general messages
              if (payload.new.sender_id === 'dispatcher' || payload.new.receiver_id === 'general') {
                // Notify user with sound and vibration for dispatcher or general message
                notifyUser('message');
                // Messages will appear in the chat widget automatically
              }
            }
         })
        .subscribe((status) => {
          console.log('Message channel status:', status);
          if (status === 'SUBSCRIBED') {
            console.log('Successfully subscribed to driver messages');
          } else if (status === 'CHANNEL_ERROR') {
            console.error('Failed to subscribe to driver messages, falling back to polling');
          }
        });



    // Subscribe to vehicle status changes (from dispatcher app) with improved error handling
     const vehicleChannel = supabase
       .channel('vehicle_status_changes_driver')
       .on('postgres_changes', {
         event: 'UPDATE',
         schema: 'public',
         table: 'vehicles'
       }, (payload) => {
         const updatedVehicle = payload.new;
         console.log('Vehicle status changed (driver app):', updatedVehicle);

         // Only update if this is our vehicle and it's an external change
         if (vehicleNumber && updatedVehicle.id === vehicleNumber) {
           // Check if this is different from our current status to avoid loops
           const currentDbStatus = driverStatus === 'available' ? 'AVAILABLE' :
                                 driverStatus === 'on_ride' ? 'BUSY' :
                                 driverStatus === 'break' ? 'BREAK' :
                                 driverStatus === 'offline' ? 'OUT_OF_SERVICE' : 'AVAILABLE';

           if (updatedVehicle.status !== currentDbStatus) {
             const newStatus = updatedVehicle.status === 'AVAILABLE' ? 'available' :
                               updatedVehicle.status === 'BUSY' ? 'on_ride' :
                               updatedVehicle.status === 'BREAK' ? 'break' :
                               updatedVehicle.status === 'OUT_OF_SERVICE' ? 'offline' : 'offline';

             console.log(`Updating local status to ${newStatus} from external database change`);
             setDriverStatus(newStatus);
           }
         }
       })
       .subscribe((status) => {
         console.log('Vehicle status channel status:', status);
         if (status === 'SUBSCRIBED') {
           console.log('Successfully subscribed to vehicle status changes');
         } else if (status === 'CHANNEL_ERROR') {
           console.error('Failed to subscribe to vehicle status changes, falling back to polling');
         }
       });

    return () => {
      supabase.removeChannel(messageChannel);
      supabase.removeChannel(vehicleChannel);
      clearInterval(connectionCheckInterval);
    };
  }, []);

  // Separate effect for ride subscriptions that depends on vehicleNumber
   useEffect(() => {
     if (!vehicleNumber || !SUPABASE_ENABLED) return;

     console.log('Setting up ride subscriptions for vehicle:', vehicleNumber);

      // Subscribe to ride update broadcasts from dispatcher with improved error handling
      const updateChannel = supabase
        .channel('ride_updates')
        .on('broadcast', { event: 'ride_updated' }, (payload) => {
          console.log('Received ride update broadcast:', payload);
          // Only refresh if this update is for our vehicle
          if (payload.vehicleId === vehicleNumber) {
            refreshVehicleData();
          }
        })
        .subscribe((status) => {
          console.log('Ride update broadcast channel status:', status);
          if (status === 'SUBSCRIBED') {
            console.log('Successfully subscribed to ride update broadcasts');
          } else if (status === 'CHANNEL_ERROR') {
            console.error('Failed to subscribe to ride update broadcasts');
          }
        });

      const rideChannel = supabase
        .channel('ride_assignments')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'ride_logs' }, (payload) => {
          console.log('New ride assigned:', payload);
          console.log('vehicle_id in payload:', payload.new.vehicle_id, 'vehicleNumber:', vehicleNumber, 'match:', payload.new.vehicle_id === vehicleNumber);
          // Only refresh if this ride is assigned to our vehicle
          if (payload.new.vehicle_id === vehicleNumber) {
            const now = Date.now();
            if (now - lastSubscriptionRefresh > 1000) { // Reduced to 1 second between subscription-triggered refreshes
              setLastSubscriptionRefresh(now);
              refreshVehicleData();
              // Notify user with sound and vibration for new ride assignment
              notifyUser('ride');
            }
          }
        })
         .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'ride_logs' }, (payload) => {
           // Only refresh if this ride is assigned to our vehicle
           if (payload.new.vehicle_id === vehicleNumber) {
             const now = Date.now();
             if (now - lastSubscriptionRefresh > 1000) { // Reduced to 1 second
               setLastSubscriptionRefresh(now);
               refreshVehicleData();
             }
           }
         })
        .subscribe((status) => {
          console.log('Ride assignments channel status:', status);
          if (status === 'SUBSCRIBED') {
            console.log('Successfully subscribed to ride assignments');
          } else if (status === 'CHANNEL_ERROR') {
            console.error('Failed to subscribe to ride assignments, falling back to polling');
          }
        });

     return () => {
       supabase.removeChannel(updateChannel);
       supabase.removeChannel(rideChannel);
     };
   }, [vehicleNumber, lastSubscriptionRefresh, refreshVehicleData]);

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

    // Check locations table if Supabase is enabled
    if (SUPABASE_ENABLED && supabase) {
      (async () => {
        try {
          const { error: tableCheckError } = await supabase
            .from('locations')
            .select('count', { count: 'exact', head: true });

          if (tableCheckError) {
            console.error('Locations table check failed:', tableCheckError);
            console.error('Error code:', tableCheckError.code);
            console.error('Error message:', tableCheckError.message);

            if (tableCheckError.code === 'PGRST116' || tableCheckError.message.includes('relation "locations" does not exist')) {
              console.error('LOCATIONS TABLE DOES NOT EXIST IN SUPABASE!');
              console.error('Please create the locations table using the SQL script in create-locations-table.sql');
              alert('Locations table missing! Please create it in Supabase using the SQL script.');
            } else {
              console.error('Locations table exists but has issues. Current error:', tableCheckError);
              console.error('This might be a permissions issue or column mismatch.');
            }
          } else {
            console.log('Locations table exists and is accessible');
          }
        } catch (err) {
          console.error('Exception checking locations table:', err);
        }
      })();
    }

    // Send location every 5 minutes to reduce data usage
    locationIntervalRef.current = setInterval(async () => {
      if (currentPosition && vehicleNumber) {
        const locationData = {
          vehicle_id: vehicleNumber,
          latitude: currentPosition.lat,
          longitude: currentPosition.lng,
          timestamp: new Date().toISOString(),
        };

        console.log('Sending location:', locationData);

        if (SUPABASE_ENABLED && supabase) {
          try {
            const { data, error } = await supabase.from('locations').insert(locationData);

            if (error) {
              console.error('Failed to send location to Supabase:', error);
              console.error('Error details:', {
                message: error.message,
                details: error.details,
                hint: error.hint,
                code: error.code
              });
              // Store in localStorage as fallback
              const queued = JSON.parse(localStorage.getItem('queued_locations') || '[]');
              queued.push(locationData);
              localStorage.setItem('queued_locations', JSON.stringify(queued));
            } else {
              console.log('Location sent successfully:', data);
            }
          } catch (err) {
            console.error('Exception sending location:', err);
            // Store in localStorage as fallback
            const queued = JSON.parse(localStorage.getItem('queued_locations') || '[]');
            queued.push(locationData);
            localStorage.setItem('queued_locations', JSON.stringify(queued));
          }
        } else {
          console.log('Supabase not enabled, storing location locally');
          // Store in localStorage when Supabase is not available
          const queued = JSON.parse(localStorage.getItem('queued_locations') || '[]');
          queued.push(locationData);
          localStorage.setItem('queued_locations', JSON.stringify(queued));
        }
      } else {
        console.log('Not sending location - currentPosition:', !!currentPosition, 'vehicleNumber:', vehicleNumber);
      }
    }, 300000); // Send every 5 minutes

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
  }, [vehicleNumber]);

    // Auto-refresh messages every 2 minutes (reduced from 5)
     useEffect(() => {
       if (!vehicleNumber) return;

       const refreshInterval = setInterval(async () => {
         try {
           const msgs = await supabaseService.getDriverMessages();
           // Filter for this driver
           const filtered = msgs.filter((m: any) =>
             m.sender_id === 'dispatcher' ||
             m.receiver_id === `driver_${vehicleNumber}` ||
             m.sender_id === `driver_${vehicleNumber}` ||
             m.receiver_id === 'general'
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
       }, 120000); // Refresh every 2 minutes (reduced from 5)

       return () => clearInterval(refreshInterval);
     }, [vehicleNumber, messages]);

   // Auto-refresh ride data every 15 seconds (for local mode without real-time)


  // Save preferred navigation app to localStorage
  useEffect(() => {
    localStorage.setItem('preferredNavApp', preferredNavApp);
  }, [preferredNavApp]);

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
            await supabaseService.addRideLog(updatedRide);
            console.log('acceptRideSpecific: Ride successfully saved to database');
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
     if (!newMessage.trim() || !vehicleNumber) return;
     const receiverId = selectedRecipient === 'dispatcher' ? 'dispatcher' :
                       selectedRecipient === 'general' ? 'general' :
                       `driver_${selectedRecipient}`;

     const messageData = {
       id: `msg-${Date.now()}`,
       sender_id: `driver_${vehicleNumber}`,
       receiver_id: receiverId,
       message: newMessage,
       timestamp: new Date().toISOString(),
       read: false
     };

     // Immediately add to local state for instant UI update
     setMessages(prev => [messageData, ...prev]);

     if (SUPABASE_ENABLED && supabase) {
       try {
         const { data, error } = await supabase
           .from('driver_messages')
           .insert(messageData)
           .select()
           .single();

         if (error) throw error;
       } catch (error) {
         console.error('Failed to send message:', error);
         // Remove from local state if sending failed
         setMessages(prev => prev.filter(m => m.id !== messageData.id));
         alert('Failed to send message. Please try again.');
         return; // Don't clear input if failed
       }
     }
     setNewMessage('');
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

  // Test function to check and create locations table
  const testLocationsTable = async () => {
    console.log('Testing locations table...');

    if (!SUPABASE_ENABLED || !supabase) {
      console.log('Supabase not enabled, skipping locations table test');
      return true;
    }

    try {
      // Try to query the locations table
      const { data, error } = await supabase.from('locations').select('*').limit(1);

      if (error) {
        console.error('Locations table test failed:', error);
        console.error('Error code:', error.code);
        console.error('Error message:', error.message);

        if (error.code === 'PGRST116' || error.message.includes('relation "locations" does not exist')) {
          console.log('Locations table does not exist. You need to create it in Supabase.');
          console.log('Go to: https://supabase.com/dashboard/project/dmxkqofoecqdjbigxoon/editor');
          console.log('Run the SQL script from: create-locations-table.sql');
          alert('Locations table missing! Please create it in Supabase using the SQL script from create-locations-table.sql');
          return false;
        } else {
          console.error('Locations table exists but has issues. Current error:', error);
          console.error('This might be a permissions issue or column mismatch.');
          console.error('Please check the table structure in Supabase dashboard');
        }
        return false;
      }

      console.log('Locations table exists and is accessible');
      console.log('Sample data:', data);
      console.log('Table structure appears to be working');
      return true;

    } catch (err) {
      console.error('Error testing locations table:', err);
      return false;
    }
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

  // Add a button to test the locations table (for debugging)
  useEffect(() => {
    if (vehicleNumber) {
      // Test the locations table after vehicle is loaded
      setTimeout(() => {
        testLocationsTable();
      }, 2000);
    }
  }, [vehicleNumber]);

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
                   const granted = await initializeNotifications();
                   setNotificationPermission(Notification.permission as NotificationPermission);
                 }}
                 className="text-xs bg-yellow-600 hover:bg-yellow-700 px-2 py-1 rounded text-white"
               >
                 Povolit
               </button>
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
                disabled={!newMessage.trim()}
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
                  <span className="font-medium">Denní tržba:</span> {dailyCash} Kč
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
            {rideHistory.length > 0 ? (
              <ul className="space-y-2">
                {rideHistory.map((ride) => (
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
              <p className="text-sm text-slate-400 italic">{t('dashboard.noCompletedRides')}</p>
            )}
          </div>
        )}

        {!showRideHistory && (
          <div className="glass card-hover p-4 rounded-2xl border border-slate-700/50">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-semibold text-white">{t('dashboard.recentRides')}</h2>
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
        )}

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
