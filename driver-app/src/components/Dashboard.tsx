import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { supabaseService } from '../supabaseClient';
import { RideLog, RideStatus } from '../types';

const Dashboard: React.FC = () => {
  const [driverStatus, setDriverStatus] = useState('offline');
  const [currentRide, setCurrentRide] = useState<RideLog | null>(null);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [rideHistory, setRideHistory] = useState<RideLog[]>([]);
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState('');

  useEffect(() => {
    // Get current user and their driver info
    const getDriverInfo = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
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

    // Subscribe to messages
    const messageChannel = supabase
      .channel('messages')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        console.log('New message:', payload);
        setMessages(prev => [...prev, payload.new]);
      })
      .subscribe();

    // Load recent messages
    const loadMessages = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase.from('messages').select('*').or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`).order('timestamp', { ascending: false }).limit(20);
        if (data) {
          setMessages(data.reverse());
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

  const updateDriverStatus = async (status: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from('drivers').update({ current_status: status, updated_at: new Date().toISOString() }).eq('id', user.id);
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
    if (!newMessage.trim()) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from('messages').insert({
        sender_id: user.id,
        receiver_id: 'dispatcher', // Assume dispatcher ID or role
        message: newMessage,
        timestamp: new Date().toISOString(),
      });
      setNewMessage('');
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-white p-4">
      <div className="max-w-md mx-auto space-y-6">
        <h1 className="text-2xl font-bold text-center">Driver Dashboard</h1>

        {/* Status */}
        <div className="bg-slate-800 p-4 rounded-lg">
          <label className="block text-sm font-medium mb-2">Status</label>
          <select
            value={driverStatus}
            onChange={(e) => updateDriverStatus(e.target.value)}
            className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white"
          >
            <option value="available">Available</option>
            <option value="on_ride">On Ride</option>
            <option value="pause">Pause</option>
            <option value="refueling">Refueling</option>
            <option value="offline">Offline</option>
          </select>
        </div>

        {/* Current Ride */}
        {currentRide && (
          <div className="bg-slate-800 p-4 rounded-lg">
            <h2 className="text-lg font-semibold mb-2">Current Ride</h2>
            <p>Customer: {currentRide.customerName}</p>
            <p>From: {currentRide.stops[0]}</p>
            <p>To: {currentRide.stops[currentRide.stops.length - 1]}</p>
            <p>Status: {currentRide.status}</p>

            <div className="mt-4 space-y-2">
              {currentRide.status === 'pending' && (
                <button onClick={acceptRide} className="w-full bg-green-600 hover:bg-green-700 py-2 rounded-md">
                  Accept Ride
                </button>
              )}
              {currentRide.status === 'accepted' && (
                <button onClick={startRide} className="w-full bg-blue-600 hover:bg-blue-700 py-2 rounded-md">
                  Start Ride
                </button>
              )}
              {currentRide.status === 'in_progress' && (
                <>
                  <button onClick={endRide} className="w-full bg-red-600 hover:bg-red-700 py-2 rounded-md">
                    Complete Ride
                  </button>
                  <button onClick={navigateToDestination} className="w-full bg-purple-600 hover:bg-purple-700 py-2 rounded-md">
                    Navigate
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {/* Location */}
        <div className="bg-slate-800 p-4 rounded-lg">
          <p>Current Location: {location ? `${location.lat}, ${location.lng}` : 'Not available'}</p>
        </div>

        {/* Messaging */}
        <div className="bg-slate-800 p-4 rounded-lg">
          <h2 className="text-lg font-semibold mb-2">Messages</h2>
          <div className="h-32 overflow-y-auto mb-2">
            {messages.map((msg, idx) => (
              <div key={idx} className="text-sm">
                <strong>{msg.sender_id === 'dispatcher' ? 'Dispatcher' : 'You'}:</strong> {msg.message}
              </div>
            ))}
          </div>
          <div className="flex">
            <input
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              className="flex-1 px-2 py-1 bg-slate-700 border border-slate-600 rounded-l-md text-white"
              placeholder="Type message..."
            />
            <button onClick={sendMessage} className="px-4 py-1 bg-blue-600 hover:bg-blue-700 rounded-r-md">
              Send
            </button>
          </div>
        </div>

        {/* Ride History */}
        <div className="bg-slate-800 p-4 rounded-lg">
          <h2 className="text-lg font-semibold mb-2">Recent Rides</h2>
          {rideHistory.length > 0 ? (
            <ul className="space-y-2">
              {rideHistory.map((ride) => (
                <li key={ride.id} className="text-sm">
                  {ride.customerName} - {new Date(ride.timestamp).toLocaleDateString()}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-400">No completed rides yet</p>
          )}
        </div>

        {/* Logout */}
        <button
          onClick={() => supabase.auth.signOut()}
          className="w-full bg-red-600 hover:bg-red-700 py-2 rounded-md"
        >
          Logout
        </button>
      </div>
    </div>
  );
};

export default Dashboard;