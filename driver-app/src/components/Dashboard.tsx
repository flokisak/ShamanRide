import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { supabaseService } from '../supabaseClient';
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

  useEffect(() => {
    // Get current user and their driver info
    const getDriverInfo = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        // Extract vehicle number from email (vinnetaxi1@gmail.com -> 1)
        const emailMatch = user.email?.match(/vinnetaxi(\d+)@gmail\.com/);
        const vehicleNum = emailMatch ? parseInt(emailMatch[1]) : null;
        setVehicleNumber(vehicleNum);

        // Assume driver_id is user.id for simplicity
        const driverId = user.id;

        // Get current status from drivers table
        const { data: driver } = await supabase.from('drivers').select('current_status').eq('id', driverId).single();
        if (driver) {
          setDriverStatus(driver.current_status || 'offline');
        }

        // Get active ride
        const { data: rides } = await supabase.from('ride_logs').select('*').eq('driver_id', driverId).in('status', ['pending', 'accepted', 'in_progress']);
        if (rides && rides.length > 0) {
          setCurrentRide(rides[0]);
        }

        // Get completed rides
        const { data: history } = await supabase.from('ride_logs').select('*').eq('driver_id', driverId).eq('status', 'COMPLETED').order('timestamp', { ascending: false }).limit(10);
        if (history) {
          setRideHistory(history);
        }
      }
    };

    getDriverInfo();

    // Subscribe to ride assignments
    const rideChannel = supabase
      .channel('ride_assignments')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'ride_logs' }, (payload) => {
        console.log('New ride assigned:', payload);
        // Check if it's for this driver
        getDriverInfo();
      })
      .subscribe();

    // Subscribe to driver messages
    const messageChannel = supabase
      .channel('driver_messages')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'driver_messages' }, (payload) => {
        console.log('New driver message:', payload);
        // Check if the message is for this driver
        if (vehicleNumber && (payload.new.sender_id === vehicleNumber.toString() || payload.new.receiver_id === `driver_${vehicleNumber}`)) {
          setMessages(prev => [...prev, payload.new]);
        }
      })
      .subscribe();

    // Load recent driver messages
    const loadMessages = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user && vehicleNumber) {
        const { data } = await supabase.from('driver_messages').select('*')
          .or(`sender_id.eq.${user.id},receiver_id.eq.driver_${vehicleNumber}`)
          .order('timestamp', { ascending: true });
        if (data) {
          setMessages(data);
        }
      }
    };
    loadMessages();

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

      // Send location every 10-15 seconds if active
      locationInterval = setInterval(async () => {
        if (currentPosition && driverStatus !== 'offline') {
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            try {
              await supabase.from('locations').insert({
                driver_id: user.id,
                latitude: currentPosition.lat,
                longitude: currentPosition.lng,
                timestamp: new Date().toISOString(),
              });
            } catch (err) {
              console.warn('Failed to send location, queuing offline', err);
              // For offline queuing, could store in localStorage
              const queued = JSON.parse(localStorage.getItem('queued_locations') || '[]');
              queued.push({
                driver_id: user.id,
                latitude: currentPosition!.lat,
                longitude: currentPosition!.lng,
                timestamp: new Date().toISOString(),
              });
              localStorage.setItem('queued_locations', JSON.stringify(queued));
            }
          }
        }
      }, 12000); // 12 seconds
    }

    return () => {
      supabase.removeChannel(rideChannel);
      supabase.removeChannel(messageChannel);
      if (watchId) {
        navigator.geolocation.clearWatch(watchId);
      }
      if (locationInterval) {
        clearInterval(locationInterval);
      }
    };
  }, [driverStatus]);

  // Handle break timer
  useEffect(() => {
    if (breakEndTime && driverStatus === 'break') {
      const checkBreakEnd = async () => {
        if (Date.now() >= breakEndTime) {
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            // Update driver status to available
            await supabase.from('drivers').update({
              current_status: 'available',
              break_end_time: null,
              updated_at: new Date().toISOString()
            }).eq('id', user.id);

            // Update associated vehicle status to available
            const { data: driver } = await supabase.from('drivers').select('vehicle_id').eq('id', user.id).single();
            if (driver?.vehicle_id) {
              await supabase.from('vehicles').update({
                status: 'AVAILABLE',
                updated_at: new Date().toISOString()
              }).eq('id', driver.vehicle_id);
            }

            setDriverStatus('available');
            setBreakEndTime(null);
          }
        }
      };

      // Check immediately
      checkBreakEnd();

      // Set up interval to check every minute
      const breakInterval = setInterval(checkBreakEnd, 60000);

      return () => clearInterval(breakInterval);
    }
  }, [breakEndTime, driverStatus]);

  const updateDriverStatus = async (status: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
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

      // Update driver status
      await supabase.from('drivers').update({
        current_status: status,
        break_end_time: breakEndTimeValue,
        updated_at: new Date().toISOString()
      }).eq('id', user.id);

      // Also update associated vehicle status
      const { data: driver } = await supabase.from('drivers').select('vehicle_id').eq('id', user.id).single();
      if (driver?.vehicle_id) {
        await supabase.from('vehicles').update({
          status: vehicleStatus,
          updated_at: new Date().toISOString()
        }).eq('id', driver.vehicle_id);
      }

      setDriverStatus(status);
    }
  };

  const acceptRide = async () => {
    if (currentRide) {
      await supabase.from('ride_logs').update({ status: 'accepted', accepted_at: new Date().toISOString() }).eq('id', currentRide.id);
      setCurrentRide({ ...currentRide, status: 'accepted' });
    }
  };

  const startRide = async () => {
    if (currentRide) {
      await supabase.from('ride_logs').update({ status: 'in_progress', started_at: new Date().toISOString() }).eq('id', currentRide.id);
      setCurrentRide({ ...currentRide, status: 'in_progress' });
    }
  };

  const endRide = async () => {
    if (currentRide) {
      await supabase.from('ride_logs').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', currentRide.id);
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
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      // For now, send to a generic dispatcher ID. In production, this should be the actual dispatcher ID
      const dispatcherId = 'dispatcher'; // TODO: Get actual dispatcher ID
      await supabase.from('driver_messages').insert({
        sender_id: `driver_${vehicleNumber}`,
        receiver_id: dispatcherId,
        message: newMessage,
        read: false
      });
      setNewMessage('');
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-white p-4">
      <div className="max-w-md mx-auto space-y-6">
        <h1 className="text-2xl font-bold text-center text-white">{t('dashboard.title')}</h1>

        {/* Status */}
        <div className="glass card-hover p-4 rounded-2xl border border-slate-700/50">
          <label className="block text-sm font-medium mb-2 text-slate-300">{t('dashboard.status')}</label>
          <select
            value={driverStatus}
            onChange={(e) => updateDriverStatus(e.target.value)}
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