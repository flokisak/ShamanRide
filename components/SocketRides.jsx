import React, { useState, useEffect } from 'react';
import io from 'socket.io-client';
import { supabase } from '../../services/supabaseClient';

const Rides = ({ currentUser, shiftId, isDispatcher = false }) => {
  const [rides, setRides] = useState([]);
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);

  // Initialize socket connection
  useEffect(() => {
    if (!currentUser) return;

    // Get JWT token for authentication
    const getToken = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      return session?.access_token;
    };

    const initSocket = async () => {
      const token = await getToken();

      const socketInstance = io(process.env.REACT_APP_SOCKET_URL || 'http://localhost:3000', {
        auth: { token },
        transports: ['websocket', 'polling']
      });

      socketInstance.on('connect', () => {
        console.log('Connected to rides server');
        setIsConnected(true);

        // Join shift room for ride updates
        socketInstance.emit('join_shift', shiftId);
      });

      socketInstance.on('disconnect', () => {
        console.log('Disconnected from rides server');
        setIsConnected(false);
      });

      // Listen for ride updates
      socketInstance.on('ride_updated', (rideData) => {
        console.log('Ride updated:', rideData);
        setRides(prev => {
          const existingIndex = prev.findIndex(r => r.id === rideData.id);
          if (existingIndex >= 0) {
            // Update existing ride
            const updated = [...prev];
            updated[existingIndex] = { ...updated[existingIndex], ...rideData };
            return updated;
          } else {
            // Add new ride
            return [...prev, rideData];
          }
        });
      });

      // Listen for status changes
      socketInstance.on('status_changed', (data) => {
        console.log('Status changed:', data);
        setRides(prev => prev.map(ride =>
          ride.id === data.rideId
            ? { ...ride, status: data.newStatus }
            : ride
        ));
      });

      // Listen for ride cancellations
      socketInstance.on('ride_cancelled', (data) => {
        console.log('Ride cancelled:', data);
        setRides(prev => prev.filter(ride => ride.id !== data.rideId));
      });

      // Listen for position updates (dispatcher only)
      if (isDispatcher) {
        socketInstance.on('position_updated', (data) => {
          console.log('Position updated:', data);
          // Update vehicle position in rides if needed
          setRides(prev => prev.map(ride =>
            ride.vehicleId === data.vehicleId
              ? { ...ride, currentLocation: { lat: data.latitude, lng: data.longitude } }
              : ride
          ));
        });
      }

      setSocket(socketInstance);
    };

    initSocket();

    return () => {
      if (socket) {
        socket.disconnect();
      }
    };
  }, [currentUser, shiftId, isDispatcher]);

  // Load initial rides data
  useEffect(() => {
    const loadRides = async () => {
      try {
        // Load rides from Supabase
        const { data, error } = await supabase
          .from('ride_logs')
          .select('*')
          .order('timestamp', { ascending: false })
          .limit(50);

        if (error) {
          console.error('Error loading rides:', error);
        } else {
          // Filter rides based on user role
          let filteredRides = data;

          if (!isDispatcher) {
            // For drivers, only show rides assigned to their vehicle
            // This would need to be determined from user context
            // For now, show all rides
          }

          setRides(filteredRides.map(ride => ({
            id: ride.id,
            timestamp: ride.timestamp,
            vehicleName: ride.vehicle_name,
            vehicleLicensePlate: ride.vehicle_license_plate,
            driverName: ride.driver_name,
            vehicleType: ride.vehicle_type,
            customerName: ride.customer_name,
            rideType: ride.ride_type,
            customerPhone: ride.customer_phone,
            stops: ride.stops,
            passengers: ride.passengers,
            pickupTime: ride.pickup_time,
            status: ride.status,
            vehicleId: ride.vehicle_id,
            notes: ride.notes,
            estimatedPrice: ride.estimated_price,
            estimatedPickupTimestamp: ride.estimated_pickup_timestamp,
            estimatedCompletionTimestamp: ride.estimated_completion_timestamp,
            fuelCost: ride.fuel_cost,
            distance: ride.distance,
            acceptedAt: ride.accepted_at,
            startedAt: ride.started_at,
            completedAt: ride.completed_at
          })));
        }
      } catch (err) {
        console.error('Error loading rides:', err);
      }
    };

    if (currentUser) {
      loadRides();
    }
  }, [currentUser, isDispatcher]);

  // Send ride update (dispatcher)
  const updateRide = (rideData) => {
    if (socket && isConnected) {
      socket.emit('ride_update', { shiftId, rideData });
    }
  };

  // Send status change (driver)
  const changeStatus = (rideId, newStatus, driverId) => {
    if (socket && isConnected) {
      socket.emit('status_change', { shiftId, rideId, newStatus, driverId });
    }
  };

  // Send position update (driver)
  const updatePosition = (vehicleId, latitude, longitude) => {
    if (socket && isConnected && !isDispatcher) {
      socket.emit('position_update', { shiftId, vehicleId, latitude, longitude });
    }
  };

  // Cancel ride (dispatcher)
  const cancelRide = (rideId) => {
    if (socket && isConnected) {
      socket.emit('ride_cancelled', { shiftId, rideId });
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'pending': return 'bg-yellow-500';
      case 'accepted': return 'bg-blue-500';
      case 'in_progress': return 'bg-green-500';
      case 'completed': return 'bg-gray-500';
      case 'cancelled': return 'bg-red-500';
      default: return 'bg-gray-400';
    }
  };

  const formatTime = (timestamp) => {
    return new Date(timestamp).toLocaleTimeString('cs-CZ', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="flex flex-col h-full bg-slate-900 text-white">
      {/* Connection status */}
      <div className="p-2 bg-slate-800 border-b border-slate-700">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-400' : 'bg-red-400'}`}></div>
          <span className="text-sm text-slate-300">
            {isConnected ? 'Live Updates Active' : 'Connecting...'}
          </span>
        </div>
      </div>

      {/* Rides list */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {rides.length === 0 ? (
          <div className="text-center text-slate-400 py-8">
            No rides available
          </div>
        ) : (
          rides.map((ride) => (
            <div
              key={ride.id}
              className="bg-slate-800 rounded-lg p-4 border border-slate-700"
            >
              <div className="flex justify-between items-start mb-2">
                <div>
                  <h3 className="font-semibold text-white">{ride.customerName}</h3>
                  <p className="text-sm text-slate-400">
                    {ride.vehicleName} • {ride.vehicleLicensePlate}
                  </p>
                </div>
                <div className={`px-2 py-1 rounded text-xs font-medium text-white ${getStatusColor(ride.status)}`}>
                  {ride.status?.replace('_', ' ').toUpperCase()}
                </div>
              </div>

              <div className="space-y-1 text-sm text-slate-300">
                <p><span className="font-medium">Phone:</span> {ride.customerPhone}</p>
                <p><span className="font-medium">Pickup:</span> {ride.stops?.[0]}</p>
                <p><span className="font-medium">Destination:</span> {ride.stops?.[ride.stops.length - 1]}</p>
                <p><span className="font-medium">Passengers:</span> {ride.passengers}</p>
                {ride.estimatedPrice && (
                  <p><span className="font-medium">Price:</span> {ride.estimatedPrice} Kč</p>
                )}
                <p><span className="font-medium">Time:</span> {formatTime(ride.timestamp)}</p>
              </div>

              {/* Action buttons based on role and status */}
              <div className="mt-3 flex gap-2">
                {isDispatcher ? (
                  <>
                    {ride.status === 'pending' && (
                      <button
                        onClick={() => updateRide({ ...ride, status: 'assigned' })}
                        className="px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded text-sm font-medium"
                      >
                        Assign
                      </button>
                    )}
                    {ride.status !== 'completed' && ride.status !== 'cancelled' && (
                      <button
                        onClick={() => cancelRide(ride.id)}
                        className="px-3 py-1 bg-red-600 hover:bg-red-700 rounded text-sm font-medium"
                      >
                        Cancel
                      </button>
                    )}
                  </>
                ) : (
                  <>
                    {ride.status === 'assigned' && (
                      <button
                        onClick={() => changeStatus(ride.id, 'accepted', currentUser.id)}
                        className="px-3 py-1 bg-green-600 hover:bg-green-700 rounded text-sm font-medium"
                      >
                        Accept
                      </button>
                    )}
                    {ride.status === 'accepted' && (
                      <button
                        onClick={() => changeStatus(ride.id, 'in_progress', currentUser.id)}
                        className="px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded text-sm font-medium"
                      >
                        Start Ride
                      </button>
                    )}
                    {ride.status === 'in_progress' && (
                      <button
                        onClick={() => changeStatus(ride.id, 'completed', currentUser.id)}
                        className="px-3 py-1 bg-purple-600 hover:bg-purple-700 rounded text-sm font-medium"
                      >
                        Complete
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default Rides;