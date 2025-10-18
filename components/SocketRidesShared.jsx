import React, { useState, useEffect } from 'react';
import io from 'socket.io-client';
import { supabase } from '../services/supabaseClient';

const Rides = ({ currentUser, shiftId, isDispatcher = false, onRideUpdate, onStatusChange, onRideCancel, onVehicleStatusUpdate, supabaseClient = supabase }) => {
  const [rides, setRides] = useState([]);
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);

  // Initialize socket connection
  useEffect(() => {
    if (!currentUser) return;

    // Get JWT token for authentication
    const getToken = async () => {
      const { data: { session } } = await supabaseClient.auth.getSession();
      return session?.access_token;
    };

    const initSocket = async () => {
      const token = await getToken();
       const socketUrl = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3000';
      console.log('SocketRides connecting to:', socketUrl);

      const socketInstance = io(socketUrl, {
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
        if (onRideUpdate) {
          onRideUpdate(rideData);
        }
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
        if (onStatusChange) {
          onStatusChange(data.rideId, data.newStatus);
        }
        setRides(prev => prev.map(ride =>
          ride.id === data.rideId
            ? { ...ride, status: data.newStatus }
            : ride
        ));
      });

      // Listen for ride cancellations
      socketInstance.on('ride_cancelled', (data) => {
        console.log('Ride cancelled:', data);
        if (onRideCancel) {
          onRideCancel(data.rideId);
        }
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

       // Listen for vehicle status updates
       socketInstance.on('vehicle_status_updated', (data) => {
         console.log('Vehicle status updated:', data);
         // This will be handled by the parent component that manages vehicle state
         if (onVehicleStatusUpdate) {
           onVehicleStatusUpdate(data);
         }
       });

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
        const { data, error } = await supabaseClient
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
            // Filter by vehicle_id if available in user context
            // Assuming driver has a vehicle_id in their profile
            const driverVehicleId = currentUser?.vehicle_id || currentUser?.vehicleId;
            if (driverVehicleId) {
              filteredRides = filteredRides.filter(ride => ride.vehicle_id === driverVehicleId);
            }
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

       {/* Rides list - compact row format */}
       <div className="flex-1 overflow-y-auto">
         {rides.length === 0 ? (
           <div className="text-center text-slate-400 py-8">
             No rides available
           </div>
         ) : (
           <div className="p-2">
             {/* Header */}
             <div className="grid grid-cols-12 gap-2 mb-2 px-3 py-2 bg-slate-800 rounded-lg text-xs font-medium text-slate-300 border-b border-slate-700">
               <div className="col-span-3">Customer</div>
               <div className="col-span-2">Route</div>
               <div className="col-span-2">Vehicle</div>
               <div className="col-span-2">Time</div>
               <div className="col-span-2">Status</div>
               <div className="col-span-1">Actions</div>
             </div>

             {/* Rides rows */}
             <div className="space-y-1">
               {rides.map((ride) => (
                 <div
                   key={ride.id}
                   className="grid grid-cols-12 gap-2 px-3 py-3 bg-slate-800/50 rounded-lg border border-slate-700 hover:bg-slate-800/70 transition-colors"
                 >
                   {/* Customer */}
                   <div className="col-span-3">
                     <div className="font-medium text-white text-sm">{ride.customerName}</div>
                     <div className="text-xs text-slate-400">{ride.customerPhone}</div>
                     <div className="text-xs text-slate-500">{ride.passengers} pax</div>
                   </div>

                   {/* Route */}
                   <div className="col-span-2">
                     <div className="text-xs text-slate-300 truncate" title={ride.stops?.[0]}>
                       📍 {ride.stops?.[0]}
                     </div>
                     <div className="text-xs text-slate-400 truncate" title={ride.stops?.[ride.stops.length - 1]}>
                       🎯 {ride.stops?.[ride.stops.length - 1]}
                     </div>
                   </div>

                   {/* Vehicle */}
                   <div className="col-span-2">
                     <div className="text-xs text-slate-300">{ride.vehicleName}</div>
                     <div className="text-xs text-slate-400">{ride.vehicleLicensePlate}</div>
                   </div>

                   {/* Time */}
                   <div className="col-span-2">
                     <div className="text-xs text-slate-300">{formatTime(ride.timestamp)}</div>
                     {ride.estimatedPrice && (
                       <div className="text-xs text-green-400 font-medium">{ride.estimatedPrice} Kč</div>
                     )}
                   </div>

                   {/* Status */}
                   <div className="col-span-2">
                     <select
                       value={ride.status || 'pending'}
                       onChange={(e) => {
                         const newStatus = e.target.value;
                         if (isDispatcher) {
                           if (newStatus === 'assigned') {
                             updateRide({ ...ride, status: 'assigned' });
                           } else if (newStatus === 'cancelled') {
                             cancelRide(ride.id);
                           }
                         } else {
                           changeStatus(ride.id, newStatus, currentUser.id);
                         }
                       }}
                       className={`w-full px-2 py-1 rounded text-xs font-medium text-white ${
                         ride.status === 'completed' ? 'bg-green-600' : getStatusColor(ride.status)
                       } border-0`}
                     >
                       <option value="pending">Pending</option>
                       <option value="assigned">Assigned</option>
                       <option value="accepted">Accepted</option>
                       <option value="in_progress">In Progress</option>
                       <option value="completed">Completed</option>
                       <option value="cancelled">Cancelled</option>
                     </select>
                   </div>

                   {/* Actions */}
                   <div className="col-span-1 flex flex-col gap-1">
                     {isDispatcher ? (
                       <>
                         {ride.status === 'pending' && (
                           <button
                             onClick={() => updateRide({ ...ride, status: 'assigned' })}
                             className="px-2 py-1 bg-blue-600 hover:bg-blue-700 rounded text-xs font-medium"
                             title="Assign ride"
                           >
                             ✓
                           </button>
                         )}
                         {ride.status !== 'completed' && ride.status !== 'cancelled' && (
                           <button
                             onClick={() => cancelRide(ride.id)}
                             className="px-2 py-1 bg-red-600 hover:bg-red-700 rounded text-xs font-medium"
                             title="Cancel ride"
                           >
                             ✕
                           </button>
                         )}
                       </>
                     ) : (
                       <>
                         {ride.status === 'assigned' && (
                           <button
                             onClick={() => changeStatus(ride.id, 'accepted', currentUser.id)}
                             className="px-2 py-1 bg-green-600 hover:bg-green-700 rounded text-xs font-medium"
                             title="Accept ride"
                           >
                             ✓
                           </button>
                         )}
                         {ride.status === 'accepted' && (
                           <button
                             onClick={() => changeStatus(ride.id, 'in_progress', currentUser.id)}
                             className="px-2 py-1 bg-blue-600 hover:bg-blue-700 rounded text-xs font-medium"
                             title="Start ride"
                           >
                             ▶
                           </button>
                         )}
                         {ride.status === 'in_progress' && (
                           <button
                             onClick={() => changeStatus(ride.id, 'completed', currentUser.id)}
                             className="px-2 py-1 bg-purple-600 hover:bg-purple-700 rounded text-xs font-medium"
                             title="Complete ride"
                           >
                             ■
                           </button>
                         )}
                       </>
                     )}
                   </div>
                 </div>
               ))}
             </div>
           </div>
         )}
       </div>
    </div>
  );
};

export default Rides;
