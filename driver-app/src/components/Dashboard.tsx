import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { RideLog, RideStatus } from '../types';
import { useTranslation } from '../contexts/LanguageContext';
import { notifyUser } from '../utils/notifications';

const Dashboard: React.FC = () => {
  const { t } = useTranslation();
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

  useEffect(() => {
    // Get current user and their vehicle info
    const getVehicleInfo = async () => {
      try {
        setIsLoading(true);
        setError(null);

        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError) {
          setError('Authentication error: ' + authError.message);
          return;
        }

        if (!user) {
          setError('No user logged in');
          return;
        }

        setUserId(user.id);

        // Find vehicle by driver's email
        const { data: vehicleData, error: vehicleQueryError } = await supabase
          .from('vehicles')
          .select('id')
          .eq('email', user.email)
          .single();

        if (vehicleQueryError || !vehicleData) {
          setError('Vehicle not found for this email: ' + user.email);
          return;
        }

        const vehicleNum = vehicleData.id;
        setVehicleNumber(vehicleNum);
        console.log('Vehicle number set to:', vehicleNum);

        // Get vehicle status and license plate from vehicles table
        const { data: vehicle, error: vehicleError } = await supabase.from('vehicles').select('status, license_plate').eq('id', vehicleNum).single();
        if (vehicleError) {
          console.warn('Could not load vehicle status:', vehicleError);
          // Continue without vehicle status
        } else if (vehicle) {
          setDriverStatus(vehicle.status === 'AVAILABLE' ? 'available' :
                          vehicle.status === 'BUSY' ? 'on_ride' :
                          vehicle.status === 'BREAK' ? 'break' :
                          vehicle.status === 'OUT_OF_SERVICE' ? 'offline' : 'offline');
          setLicensePlate(vehicle.license_plate);
        }

        // Get pending rides for this vehicle (queue: oldest first)
        console.log('Querying for rides with vehicle_id:', vehicleNum, 'status: pending');
        const { data: pending, error: pendingError } = await supabase.from('ride_logs').select('*').eq('vehicle_id', vehicleNum).eq('status', 'pending').order('timestamp', { ascending: true });
        if (pendingError) {
           console.warn('Could not load pending rides:', pendingError);
        } else {
           console.log('Found pending rides:', pending);
           setPendingRides(pending || []);
        }

        // Get active ride for this vehicle (accepted or in progress)
        const { data: rides, error: ridesError } = await supabase.from('ride_logs').select('*').eq('vehicle_id', vehicleNum).in('status', ['accepted', 'in_progress']);
        if (ridesError) {
          console.warn('Could not load active rides:', ridesError);
        } else if (rides && rides.length > 0) {
          setCurrentRide(rides[0]);
        }

        // Get all rides for this vehicle (completed, pending, accepted, etc.)
         const { data: history, error: historyError } = await supabase.from('ride_logs').select('*').eq('vehicle_id', vehicleNum).order('timestamp', { ascending: false }).limit(20);
         if (historyError) {
           console.warn('Could not load ride history:', historyError);
         } else if (history) {
           setRideHistory(history);

            // Calculate daily cash from completed rides today
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const todayCompleted = history.filter(ride =>
              ride.status === 'completed' &&
              new Date(ride.timestamp) >= today
            );
           const totalCash = todayCompleted.reduce((sum, ride) => sum + (ride.estimatedPrice || 0), 0);
           setDailyCash(totalCash);
         }

        // Get other drivers for chat
         const { data: allVehicles, error: vehiclesError } = await supabase.from('vehicles').select('id, name, driver_id').neq('id', vehicleNum);
         if (vehiclesError) {
           console.warn('Could not load other vehicles:', vehiclesError);
         } else if (allVehicles) {
           // Get driver names
           const driverIds = allVehicles.map(v => v.driver_id).filter(id => id);
           const { data: driversData } = await supabase.from('people').select('id, name').in('id', driverIds);
           const driversMap = (driversData || []).reduce((acc, d) => ({ ...acc, [d.id]: d.name }), {});
           const otherDriversList = allVehicles.map(v => ({
             id: v.id,
             name: driversMap[v.driver_id] || v.name,
             vehicleId: v.id
           })).filter(d => d.name);
           setOtherDrivers(otherDriversList);
         }

      } catch (err: any) {
        console.error('Error loading vehicle info:', err);
        setError('Failed to load vehicle data: ' + err.message);
      } finally {
        setIsLoading(false);
      }
    };

    getVehicleInfo();

    // Subscribe to ride assignments and updates
    const rideChannel = supabase
      .channel('ride_assignments')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'ride_logs' }, (payload) => {
        console.log('New ride assigned:', payload);
        // Refresh data - getVehicleInfo will filter for current vehicle
        getVehicleInfo();
        // Notify user with sound and vibration for new ride assignment
        notifyUser();
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'ride_logs' }, (payload) => {
        console.log('Ride updated:', payload);
        // Refresh data - getVehicleInfo will filter for current vehicle
        getVehicleInfo();
      })
      .subscribe();

    // Subscribe to driver messages
     const messageChannel = supabase
       .channel('driver_messages')
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
              notifyUser();
              // Messages will appear in the chat widget automatically
            }
          }
       })
      .subscribe();

    // Subscribe to vehicle status changes (from dispatcher app)
    const vehicleChannel = supabase
      .channel('vehicle_status_changes_driver')
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'vehicles'
      }, (payload) => {
        const updatedVehicle = payload.new;
        console.log('Vehicle status changed (driver app):', updatedVehicle);

        // Only update if this is our vehicle
        if (vehicleNumber && updatedVehicle.id === vehicleNumber) {
          const newStatus = updatedVehicle.status === 'AVAILABLE' ? 'available' :
                           updatedVehicle.status === 'BUSY' ? 'on_ride' :
                           updatedVehicle.status === 'BREAK' ? 'break' :
                           updatedVehicle.status === 'OUT_OF_SERVICE' ? 'offline' : 'offline';

          console.log(`Updating local status to ${newStatus} from database change`);
          setDriverStatus(newStatus);
        }
      })
      .subscribe();

    // Load recent driver messages
    const loadMessages = async () => {
      if (vehicleNumber) {
        const { data } = await supabase.from('driver_messages').select('*')
          .or(`sender_id.eq.driver_${vehicleNumber},receiver_id.eq.driver_${vehicleNumber}`)
          .order('timestamp', { ascending: false });
        if (data) {
          setMessages(data);
        }
      }
    };
    return () => {
      supabase.removeChannel(rideChannel);
      supabase.removeChannel(messageChannel);
      supabase.removeChannel(vehicleChannel);
    };
  }, [driverStatus, vehicleNumber]);

  // Load messages when vehicle number is available
  useEffect(() => {
    const loadMessages = async () => {
      if (vehicleNumber) {
        try {
          const { data, error } = await supabase.from('driver_messages').select('*')
            .or(`sender_id.eq.driver_${vehicleNumber},receiver_id.eq.driver_${vehicleNumber},receiver_id.eq.general`)
            .order('timestamp', { ascending: false });
          if (error) {
            console.warn('Could not load messages:', error);
          } else if (data) {
            setMessages(data);
          }
        } catch (err) {
          console.warn('Error loading messages:', err);
        }
      }
    };

    loadMessages();
  }, [vehicleNumber]);

  // Network connectivity monitoring for mobile
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
    };
    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // GPS Location tracking and sending
  useEffect(() => {
    if (!vehicleNumber) {
      return;
    }

    if (!navigator.geolocation) {
      return;
    }

    let watchId: number | null = null;
    let locationInterval: NodeJS.Timeout | null = null;
    let currentPosition: { lat: number; lng: number } | null = null;

    console.log('Starting GPS tracking for vehicle:', vehicleNumber);

    // Watch position continuously
    watchId = navigator.geolocation.watchPosition(
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

    // Send location every 15 seconds
    locationInterval = setInterval(async () => {
      if (currentPosition && vehicleNumber) {
        const locationData = {
          vehicle_id: vehicleNumber,
          latitude: currentPosition.lat,
          longitude: currentPosition.lng,
          timestamp: new Date().toISOString(),
        };

        console.log('Sending location to Supabase:', locationData);

        try {
          // First check if locations table exists by trying to query it
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
            return;
          }

          console.log('Locations table exists, attempting to insert location data...');

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
        console.log('Not sending location - currentPosition:', !!currentPosition, 'vehicleNumber:', vehicleNumber);
      }
    }, 15000); // Send every 15 seconds

    return () => {
      console.log('Stopping GPS tracking');
      if (watchId) {
        navigator.geolocation.clearWatch(watchId);
      }
      if (locationInterval) {
        clearInterval(locationInterval);
      }
    };
  }, [vehicleNumber]);

  // Auto-refresh messages every 30 seconds
  useEffect(() => {
    if (!vehicleNumber) return;

    const refreshInterval = setInterval(async () => {
      try {
        const { data, error } = await supabase.from('driver_messages').select('*')
          .or(`sender_id.eq.driver_${vehicleNumber},receiver_id.eq.driver_${vehicleNumber},receiver_id.eq.general`)
          .order('timestamp', { ascending: false });

        if (error) {
          console.warn('Could not refresh messages:', error);
        } else if (data) {
          // Only update if we have new messages or different data
          const currentMessageIds = messages.map(m => m.id).sort();
          const newMessageIds = data.map(m => m.id).sort();

          if (JSON.stringify(currentMessageIds) !== JSON.stringify(newMessageIds)) {
            setMessages(data);
            console.log('Messages refreshed automatically');
          }
        }
      } catch (err) {
        console.warn('Error refreshing messages:', err);
      }
    }, 30000); // Refresh every 30 seconds

    return () => clearInterval(refreshInterval);
  }, [vehicleNumber, messages]);

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

      // Update vehicle status directly
      const { error } = await supabase.from('vehicles').update({
        status: vehicleStatus
      }).eq('id', vehicleNumber);

      if (error) {
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
      await supabase.from('ride_logs').update({ status: RideStatus.Accepted, accepted_at: Date.now() }).eq('id', ride.id);

      // Update vehicle status to BUSY when ride is accepted, set freeAt to estimated completion time
      const freeAt = ride.estimatedCompletionTimestamp || (Date.now() + 30 * 60 * 1000); // Default 30 min if not set
      await supabase.from('vehicles').update({
        status: 'BUSY',
        free_at: freeAt
      }).eq('id', vehicleNumber);

      // Remove from pending rides and set as current ride
      setPendingRides(prev => prev.filter(r => r.id !== ride.id));
      setCurrentRide({ ...ride, status: RideStatus.Accepted });
    }
  };

  const acceptRide = async () => {
    if (currentRide && vehicleNumber) {
      await supabase.from('ride_logs').update({ status: RideStatus.Accepted, accepted_at: Date.now() }).eq('id', currentRide.id);

      // Update vehicle status to BUSY when ride is accepted, set freeAt to estimated completion time
      const freeAt = currentRide.estimatedCompletionTimestamp || (Date.now() + 30 * 60 * 1000); // Default 30 min if not set
      await supabase.from('vehicles').update({
        status: 'BUSY',
        free_at: freeAt
      }).eq('id', vehicleNumber);

      setCurrentRide({ ...currentRide, status: RideStatus.Accepted });
    }
  };

  const startRide = async () => {
    if (currentRide) {
      await supabase.from('ride_logs').update({ status: RideStatus.InProgress, started_at: Date.now() }).eq('id', currentRide.id);
      setCurrentRide({ ...currentRide, status: RideStatus.InProgress });
    }
  };

  const endRide = async () => {
    if (currentRide && vehicleNumber) {
      await supabase.from('ride_logs').update({ status: RideStatus.Completed, completed_at: Date.now() }).eq('id', currentRide.id);

      // Check if there are pending rides in queue
      const nextRide = pendingRides.length > 0 ? pendingRides[0] : null;

      if (nextRide) {
        // Automatically accept the next ride in queue
        await supabase.from('ride_logs').update({ status: RideStatus.Accepted, accepted_at: Date.now() }).eq('id', nextRide.id);

        // Update vehicle status to BUSY, set freeAt to estimated completion time
        const freeAt = nextRide.estimatedCompletionTimestamp || (Date.now() + 30 * 60 * 1000); // Default 30 min if not set
        const locationUpdate: any = {
          status: 'BUSY',
          free_at: freeAt
        };

        if (location) {
          locationUpdate.location = `${location.lat}, ${location.lng}`;
        }

        await supabase.from('vehicles').update(locationUpdate).eq('id', vehicleNumber);

        // Update state: remove from pending, set as current
        setPendingRides(prev => prev.filter(r => r.id !== nextRide.id));
        setCurrentRide({ ...nextRide, status: RideStatus.Accepted });
      } else {
        // No more rides, set to AVAILABLE and clear freeAt
        const locationUpdate: any = {
          status: 'AVAILABLE',
          free_at: null
        };

        if (location) {
          locationUpdate.location = `${location.lat}, ${location.lng}`;
        }

        await supabase.from('vehicles').update(locationUpdate).eq('id', vehicleNumber);

        setCurrentRide(null);
      }
    }
  };

  const navigateToDestination = (ride?: RideLog) => {
    const targetRide = ride || currentRide;
    if (targetRide && targetRide.stops.length > 0) {
      const destination = targetRide.stops[targetRide.stops.length - 1];
      const url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
      window.open(url, '_blank');
    }
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !vehicleNumber) return;
    const receiverId = selectedRecipient === 'dispatcher' ? 'dispatcher' :
                      selectedRecipient === 'general' ? 'general' :
                      `driver_${selectedRecipient}`;
    await supabase.from('driver_messages').insert({
      sender_id: `driver_${vehicleNumber}`,
      receiver_id: receiverId,
      message: newMessage,
      timestamp: Date.now(),
      read: false
    });
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

  // Test function to check and create locations table
  const testLocationsTable = async () => {
    console.log('Testing locations table...');

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
                    {ride.estimatedPrice && <p><span className="font-medium">Cena:</span> {ride.estimatedPrice} Kč</p>}
                  </div>
                  <div className="mt-3 space-y-2">
                    <button
                      onClick={() => acceptRideSpecific(ride)}
                      className="w-full bg-green-600 hover:bg-green-700 py-3 rounded-lg btn-modern text-white font-bold text-lg shadow-lg"
                    >
                      ✅ Přijmout
                    </button>
                    <button
                      onClick={() => navigateToDestination(ride)}
                      className="w-full bg-purple-600 hover:bg-purple-700 py-2 rounded-lg btn-modern text-white font-medium"
                    >
                      🗺️ Navigovat
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
               <p><span className="font-medium">{t('dashboard.status')}:</span> {currentRide.status}</p>
             </div>

             <div className="mt-4 space-y-2">
                {currentRide.status === 'pending' && (
                  <button onClick={acceptRide} className="w-full bg-green-600 hover:bg-green-700 py-2 rounded-lg btn-modern text-white font-medium">
                    {t('dashboard.acceptRide')}
                  </button>
                )}
                {currentRide.status === 'accepted' && (
                  <button onClick={startRide} className="w-full bg-blue-600 hover:bg-blue-700 py-2 rounded-lg btn-modern text-white font-medium">
                    {t('dashboard.startRide')}
                  </button>
                )}
                {currentRide.status === 'in_progress' && (
                 <div className="space-y-2">
                   <button onClick={endRide} className="w-full bg-red-600 hover:bg-red-700 py-2 rounded-lg btn-modern text-white font-medium">
                     {t('dashboard.completeRide')}
                   </button>
                    <button onClick={() => navigateToDestination()} className="w-full bg-purple-600 hover:bg-purple-700 py-2 rounded-lg btn-modern text-white font-medium">
                      {t('dashboard.navigate')}
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
        <div className="glass card-hover p-4 rounded-2xl border border-slate-700/50">
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-lg font-semibold text-white">{t('dashboard.recentRides')}</h2>
            <div className="text-sm text-slate-300">
              <span className="font-medium">Denní tržba:</span> {dailyCash} Kč
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

        {/* Logout */}
        <button
          onClick={() => supabase.auth.signOut()}
          className="w-full bg-danger hover:bg-red-700 py-3 rounded-2xl btn-modern text-white font-medium shadow-frost"
        >
          {t('dashboard.logout')}
        </button>
      </div>
    </div>
  );
};

export default Dashboard;
