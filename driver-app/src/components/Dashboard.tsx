import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { RideLog, RideStatus } from '../types';
import { useTranslation } from '../contexts/LanguageContext';

const Dashboard: React.FC = () => {
  const { t } = useTranslation();
  const [driverStatus, setDriverStatus] = useState('offline');
  const [breakEndTime, setBreakEndTime] = useState<number | null>(null);
  const [currentRide, setCurrentRide] = useState<RideLog | null>(null);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [rideHistory, setRideHistory] = useState<RideLog[]>([]);
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [vehicleNumber, setVehicleNumber] = useState<number | null>(null);
  const [licensePlate, setLicensePlate] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

        // Get active ride for this vehicle
        const { data: rides, error: ridesError } = await supabase.from('ride_logs').select('*').eq('vehicle_id', vehicleNum).in('status', [RideStatus.Pending, RideStatus.Accepted, RideStatus.InProgress]);
        if (ridesError) {
          console.warn('Could not load active rides:', ridesError);
        } else if (rides && rides.length > 0) {
          setCurrentRide(rides[0]);
        }

        // Get completed rides for this vehicle
        const { data: history, error: historyError } = await supabase.from('ride_logs').select('*').eq('vehicle_id', vehicleNum).eq('status', RideStatus.Completed).order('timestamp', { ascending: false }).limit(10);
        if (historyError) {
          console.warn('Could not load ride history:', historyError);
        } else if (history) {
          setRideHistory(history);
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
        // Check if it's for this vehicle
        getVehicleInfo();
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'ride_logs' }, (payload) => {
        console.log('Ride updated:', payload);
        // Check if it's for this vehicle
        if (vehicleNumber && payload.new.vehicle_id === vehicleNumber) {
          getVehicleInfo();
        }
      })
      .subscribe();

    // Subscribe to driver messages
    const messageChannel = supabase
      .channel('driver_messages')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'driver_messages' }, (payload) => {
        console.log('New driver message:', payload);
        // Check if the message is for this vehicle
        if (vehicleNumber && (
          payload.new.sender_id === `driver_${vehicleNumber}` ||
          payload.new.receiver_id === `driver_${vehicleNumber}`
        )) {
          setMessages(prev => [...prev, payload.new]);
          // Notify if message from dispatcher
          if (payload.new.sender_id === 'dispatcher') {
            alert(`Nová zpráva od dispečera: ${payload.new.message}`);
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
          .order('timestamp', { ascending: true });
        if (data) {
          setMessages(data);
        }
      }
    };
    // GPS tracking
    let watchId: number | null = null;
    let locationInterval: NodeJS.Timeout | null = null;
    let currentPosition: { lat: number; lng: number } | null = null;

    if (navigator.geolocation) {
        watchId = navigator.geolocation.watchPosition(
          (position) => {
            const { latitude, longitude } = position.coords;
            currentPosition = { lat: latitude, lng: longitude };
            setLocation(currentPosition);
            console.log('GPS position updated:', currentPosition);
          },
        (error) => {
          console.error('GPS error:', error);
        },
        {
          enableHighAccuracy: true,
          timeout: 5000,
          maximumAge: 0,
        }
      );

      // Send location every 10-15 seconds if vehicle is loaded
      locationInterval = setInterval(async () => {
        if (currentPosition && vehicleNumber) {
          console.log('Attempting to send location to Supabase:', {
            driver_id: vehicleNumber.toString(),
            latitude: currentPosition.lat,
            longitude: currentPosition.lng,
            timestamp: new Date().toISOString(),
          });
          try {
            const result = await supabase.from('locations').insert({
              driver_id: userId, // Use user id as driver_id for locations
              latitude: currentPosition.lat,
              longitude: currentPosition.lng,
              timestamp: new Date().toISOString(),
            });
            console.log('Location sent successfully:', result);
          } catch (err) {
            console.warn('Failed to send location, queuing offline', err);
            // For offline queuing, could store in localStorage
            const queued = JSON.parse(localStorage.getItem('queued_locations') || '[]');
            queued.push({
              driver_id: userId,
              latitude: currentPosition!.lat,
              longitude: currentPosition!.lng,
              timestamp: new Date().toISOString(),
            });
            localStorage.setItem('queued_locations', JSON.stringify(queued));
          }
        } else {
          console.log('Not sending location: currentPosition=', !!currentPosition, 'vehicleNumber=', vehicleNumber);
        }
      }, 12000); // 12 seconds
    }

    return () => {
      supabase.removeChannel(rideChannel);
      supabase.removeChannel(messageChannel);
      supabase.removeChannel(vehicleChannel);
      if (watchId) {
        navigator.geolocation.clearWatch(watchId);
      }
      if (locationInterval) {
        clearInterval(locationInterval);
      }
    };
  }, [driverStatus, vehicleNumber]);

  // Load messages when vehicle number is available
  useEffect(() => {
    const loadMessages = async () => {
      if (vehicleNumber) {
        try {
          const { data, error } = await supabase.from('driver_messages').select('*')
            .or(`sender_id.eq.driver_${vehicleNumber},receiver_id.eq.driver_${vehicleNumber}`)
            .order('timestamp', { ascending: true });
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
      let breakEndTimeValue = null;
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

  const acceptRide = async () => {
    if (currentRide && vehicleNumber) {
      await supabase.from('ride_logs').update({ status: RideStatus.Accepted, accepted_at: new Date().toISOString() }).eq('id', currentRide.id);

      // Update vehicle status to BUSY when ride is accepted
      await supabase.from('vehicles').update({
        status: 'BUSY'
      }).eq('id', vehicleNumber);

      setCurrentRide({ ...currentRide, status: RideStatus.Accepted });
    }
  };

  const startRide = async () => {
    if (currentRide) {
      await supabase.from('ride_logs').update({ status: RideStatus.InProgress, started_at: new Date().toISOString() }).eq('id', currentRide.id);
      setCurrentRide({ ...currentRide, status: RideStatus.InProgress });
    }
  };

  const endRide = async () => {
    if (currentRide && vehicleNumber) {
      await supabase.from('ride_logs').update({ status: RideStatus.Completed, completed_at: new Date().toISOString() }).eq('id', currentRide.id);

      // Update vehicle status to AVAILABLE and set current location
      const locationUpdate: any = {
        status: 'AVAILABLE'
      };

      if (location) {
        locationUpdate.location = `${location.lat}, ${location.lng}`;
      }

      await supabase.from('vehicles').update(locationUpdate).eq('id', vehicleNumber);

      setCurrentRide(null);
    }
  };

  const navigateToDestination = () => {
    if (currentRide && currentRide.stops.length > 0) {
      const destination = currentRide.stops[currentRide.stops.length - 1];
      const url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
      window.open(url, '_blank');
    }
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !vehicleNumber) return;
    // For now, send to a generic dispatcher ID. In production, this should be the actual dispatcher ID
    const dispatcherId = 'dispatcher'; // TODO: Get actual dispatcher ID
    await supabase.from('driver_messages').insert({
      sender_id: `driver_${vehicleNumber}`,
      receiver_id: dispatcherId,
      message: newMessage,
      timestamp: new Date().toISOString(),
      read: false
    });
    setNewMessage('');
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

        {/* Current Ride */}
        {currentRide && (
          <div className="glass card-hover p-4 rounded-2xl border border-slate-700/50">
            <h2 className="text-lg font-semibold mb-3 text-white">{t('dashboard.currentRide')}</h2>
            <div className="space-y-2 text-slate-300">
              <p><span className="font-medium">{t('dashboard.customer')}:</span> {currentRide.customerName}</p>
              <p><span className="font-medium">{t('dashboard.pickup')}:</span> {currentRide.stops[0]}</p>
              <p><span className="font-medium">{t('dashboard.destination')}:</span> {currentRide.stops[currentRide.stops.length - 1]}</p>
              <p><span className="font-medium">{t('dashboard.status')}:</span> {currentRide.status}</p>
            </div>

             <div className="mt-4 space-y-2">
               {currentRide.status === RideStatus.Pending && (
                 <button onClick={acceptRide} className="w-full bg-green-600 hover:bg-green-700 py-2 rounded-lg btn-modern text-white font-medium">
                   {t('dashboard.acceptRide')}
                 </button>
               )}
               {currentRide.status === RideStatus.Accepted && (
                 <button onClick={startRide} className="w-full bg-blue-600 hover:bg-blue-700 py-2 rounded-lg btn-modern text-white font-medium">
                   {t('dashboard.startRide')}
                 </button>
               )}
               {currentRide.status === RideStatus.InProgress && (
                 <div className="space-y-2">
                   <button onClick={endRide} className="w-full bg-red-600 hover:bg-red-700 py-2 rounded-lg btn-modern text-white font-medium">
                     {t('dashboard.completeRide')}
                   </button>
                   <button onClick={navigateToDestination} className="w-full bg-purple-600 hover:bg-purple-700 py-2 rounded-lg btn-modern text-white font-medium">
                     {t('dashboard.navigate')}
                   </button>
                 </div>
               )}
             </div>
          </div>
        )}

        {/* Location */}
        <div className="glass card-hover p-4 rounded-2xl border border-slate-700/50">
          <p className="text-slate-300">
            <span className="font-medium text-white">{t('dashboard.currentLocation')}:</span> {location ? `${location.lat}, ${location.lng}` : t('dashboard.locationNotAvailable')}
          </p>
        </div>

        {/* Messaging */}
        <div className="glass card-hover p-4 rounded-2xl border border-slate-700/50">
          <h2 className="text-lg font-semibold mb-3 text-white">{t('dashboard.messages')}</h2>
          <div className="h-32 overflow-y-auto mb-3 bg-slate-800/50 rounded-lg p-2">
            {messages.length > 0 ? (
              messages.map((msg, idx) => (
                <div key={idx} className="text-sm text-slate-300 mb-1">
                  <strong className="text-primary">{msg.sender_id === 'dispatcher' ? 'Dispečer' : 'Vy'}:</strong> {msg.message}
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-400 italic">Žádné zprávy zatím</p>
            )}
          </div>
           <div className="space-y-2">
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
          <h2 className="text-lg font-semibold mb-3 text-white">{t('dashboard.recentRides')}</h2>
          {rideHistory.length > 0 ? (
            <ul className="space-y-2">
              {rideHistory.map((ride) => (
                <li key={ride.id} className="text-sm text-slate-300 bg-slate-800/30 rounded-lg p-2">
                  <span className="font-medium text-white">{ride.customerName}</span> - {new Date(ride.timestamp).toLocaleDateString()}
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