const express = require('express');
require('dotenv').config();
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');
const CryptoJS = require('crypto-js');

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
// Prefer service key on the server (has elevated privileges). Fall back to anon key if service key not provided.
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('CRITICAL: Missing Supabase credentials. Please check SUPABASE_URL and SUPABASE_SERVICE_KEY (or SUPABASE_ANON_KEY) in .env file');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);
if (process.env.SUPABASE_SERVICE_KEY) {
  console.log('Using Supabase service key for server-side database operations');
} else {
  console.log('Using Supabase anon key for server-side database operations (consider setting SUPABASE_SERVICE_KEY for full privileges)');
}

const app = express();
const server = http.createServer(app);

// Configure Socket.io with CORS for Vite development
const io = socketIo(server, {
  cors: {
    origin: [
      "http://localhost:5173", "http://localhost:5174", "http://localhost:5175", "http://localhost:5176", "http://localhost:5177",
      "*", // Allow all origins for now to test
    ],
    methods: ["GET", "POST"],
    credentials: true
  }
});

app.use(cors());
app.use(express.json());

// JWT authentication middleware for socket connections
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth.token;
    if (!token) {
      return next(new Error('Authentication error: No token provided'));
    }

    // Verify JWT with Supabase
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) {
      return next(new Error('Authentication error: Invalid token'));
    }

    socket.user = user;
    socket.userId = user.id;
    socket.userEmail = user.email;
    next();
  } catch (err) {
    next(new Error('Authentication error'));
  }
});

// Track user presence
const userPresence = new Map();

// Encryption utilities
const generateRoomKey = (roomName, salt = 'shamanride_chat_salt') => {
  return CryptoJS.PBKDF2(roomName, salt, {
    keySize: 256 / 32,
    iterations: 1000
  }).toString();
};

const encryptMessage = (message, key) => {
  return CryptoJS.AES.encrypt(message, key).toString();
};

const decryptMessage = (encryptedMessage, key) => {
  const bytes = CryptoJS.AES.decrypt(encryptedMessage, key);
  return bytes.toString(CryptoJS.enc.Utf8);
};

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.userEmail} (${socket.userId})`);

  // Update presence
  userPresence.set(socket.userId, {
    id: socket.userId,
    email: socket.userEmail,
    status: 'online',
    lastSeen: new Date()
  });

  // Broadcast presence update
  socket.broadcast.emit('presence_update', {
    userId: socket.userId,
    status: 'online'
  });

  // Join shift room for ride updates
socket.on('join_shift', (shiftId) => {
  socket.join(`shift:${shiftId}`);
  console.log(`User joined shift: ${shiftId}`);
});

  // Join dispatcher-driver chat room
  socket.on('join_chat_dispatcher_driver', ({ dispatcherId, driverId }) => {
    const roomName = `chat:D${dispatcherId}_R${driverId}`;
    socket.join(roomName);
    console.log(`User ${socket.userEmail} joined ${roomName}`);
  });

  // Join driver-driver chat room
  socket.on('join_chat_driver_driver', ({ driverId1, driverId2 }) => {
    const roomName = `chat:R${driverId1}_R${driverId2}`;
    socket.join(roomName);
    console.log(`User ${socket.userEmail} joined ${roomName}`);
  });

  // Join group chat for shift
  socket.on('join_group_chat', (shiftId) => {
    const roomName = `shift_chat:${shiftId}`;
    socket.join(roomName);
    console.log(`User ${socket.userEmail} joined ${roomName}`);
  });

  // Handle chat messages
  socket.on('message', async (data) => {
    try {
      const { room, message, senderId, receiverId, type, temp_id } = data;

      if (!room || !message || !senderId) {
        console.warn('Invalid message payload, missing room/message/senderId');
        return;
      }

      // Generate room-specific encryption key
      const encryptionKey = generateRoomKey(room);

      // Encrypt the message content for storage
      const encryptedMessage = encryptMessage(message, encryptionKey);

      // Prepare DB row to persist (server is authoritative)
      const toSave = {
        sender_id: senderId,
        receiver_id: receiverId || room,
        message: encryptedMessage,
        timestamp: new Date().toISOString(),
        read: false,
        type: type || 'private',
        encrypted: true
      };

      // Persist message to Supabase and return inserted row
      const { data: savedRows, error: saveError } = await supabase
        .from('driver_messages')
        .insert(toSave)
        .select('*');

      if (saveError) {
        console.error('Failed to save message to Supabase:', saveError);
        socket.emit('message_error', { temp_id: temp_id || null, error: saveError.message || String(saveError) });
        return;
      }

      const saved = Array.isArray(savedRows) && savedRows[0] ? savedRows[0] : savedRows;

      // Decrypt payload for broadcasting so clients receive readable text
      const decryptedMessage = decryptMessage(saved.message, encryptionKey);

      // Include temp_id so sender can reconcile optimistic UI
      const broadcastPayload = {
        ...saved,
        message: decryptedMessage,
        encrypted: false,
        temp_id: temp_id || null
      };

      // Broadcast to other sockets in the room
      socket.to(room).emit('new_message', broadcastPayload);

      // Acknowledge sender with fully persisted record
      socket.emit('message_saved', broadcastPayload);

      // Also emit a lightweight delivery/done event that some clients listen for
      socket.emit('message_delivered', { messageId: saved.id, temp_id: temp_id || null });

      console.log('Message persisted and broadcasted:', saved.id);

    } catch (err) {
      console.error('Error handling message:', err);
      socket.emit('message_error', { temp_id: data?.temp_id || null, error: String(err) });
    }
  });

  // Handle ride updates
  socket.on('ride_update', async (data) => {
    const { shiftId, rideData } = data;

    // Persist ride update to Supabase (server-authoritative) and broadcast canonical row
    const dbRideData = {
      id: rideData.id,
      timestamp: rideData.timestamp || Date.now(),
      vehicle_name: rideData.vehicleName,
      vehicle_license_plate: rideData.vehicleLicensePlate,
      driver_name: rideData.driverName,
      vehicle_type: rideData.vehicleType,
      customer_name: rideData.customerName,
      ride_type: rideData.rideType?.toLowerCase() || 'business',
      customer_phone: rideData.customerPhone,
      stops: rideData.stops,
      passengers: rideData.passengers,
      pickup_time: rideData.pickupTime,
      status: rideData.status?.toLowerCase() || 'pending',
      vehicle_id: rideData.vehicleId,
      notes: rideData.notes,
      estimated_price: rideData.estimatedPrice,
      estimated_pickup_timestamp: rideData.estimatedPickupTimestamp,
      estimated_completion_timestamp: rideData.estimatedCompletionTimestamp,
      fuel_cost: rideData.fuelCost,
      distance: rideData.distance,
      accepted_at: rideData.acceptedAt,
      started_at: rideData.startedAt,
      completed_at: rideData.completedAt
    };

    const { data: savedRows, error: upsertErr } = await supabase
      .from('ride_logs')
      .upsert(dbRideData, { onConflict: 'id' })
      .select('*');

    if (upsertErr) {
      console.error('Failed to save ride update to Supabase:', upsertErr);
    } else {
      const saved = Array.isArray(savedRows) && savedRows[0] ? savedRows[0] : savedRows;

      // Broadcast canonical ride row (include temp_id if provided so clients can reconcile)
      const broadcastRide = {
        ...saved,
        // add camelCase aliases for clients that expect those properties
        vehicleName: saved.vehicle_name,
        vehicleLicensePlate: saved.vehicle_license_plate,
        driverName: saved.driver_name,
        vehicleType: saved.vehicle_type,
        customerName: saved.customer_name,
        rideType: saved.ride_type,
        customerPhone: saved.customer_phone,
        stops: saved.stops,
        pickupTime: saved.pickup_time,
        estimatedPickupTimestamp: saved.estimated_pickup_timestamp,
        estimatedCompletionTimestamp: saved.estimated_completion_timestamp,
        acceptedAt: saved.accepted_at,
        startedAt: saved.started_at,
        completedAt: saved.completed_at,
        fuelCost: saved.fuel_cost,
        distance: saved.distance,
        temp_id: rideData.temp_id || null
      };

      socket.to(`shift:${shiftId}`).emit('ride_updated', broadcastRide);

      // ACK to sender with canonical ride row
      socket.emit('ride_saved', broadcastRide);

      console.log('Ride update saved to Supabase and broadcasted:', saved.id);
    }
  });

  // Handle vehicle status changes
  socket.on('vehicle_status_changed', async (data) => {
    const { vehicleId, status, driverStatus, timestamp } = data;

    console.log(`Vehicle ${vehicleId} status changed to ${status} by driver`);

    // Update vehicle status in Supabase
    const { error } = await supabase
      .from('vehicles')
      .update({ vehicle_status: status, updated_at: new Date().toISOString() })
      .eq('id', vehicleId);

    if (error) {
      console.error('Error updating vehicle status in database:', error);
      console.error('Supabase URL:', process.env.SUPABASE_URL ? 'SET' : 'NOT SET');
      console.error('Service Key:', process.env.SUPABASE_SERVICE_KEY ? 'SET (length: ' + process.env.SUPABASE_SERVICE_KEY.length + ')' : 'NOT SET');
      socket.emit('vehicle_status_error', { vehicleId, error: error.message });
      return;
    }

    console.log(`Vehicle ${vehicleId} status updated to ${status} in database`);

    // Broadcast to all connected clients (dispatchers and other drivers)
    console.log(`Broadcasting vehicle_status_updated for vehicle ${vehicleId} with status ${status}`);
    socket.broadcast.emit('vehicle_status_updated', {
      vehicleId: parseInt(vehicleId),
      status,
      driverStatus,
      timestamp
    });
  });

  // Handle bulk vehicle updates (from dispatcher UI)
  socket.on('vehicles_update', async (data) => {
    try {
      const { shiftId, vehicles, options } = data;
      console.log('Received vehicles_update from dispatcher:', Array.isArray(vehicles) ? vehicles.length : 0);

      if (!Array.isArray(vehicles) || vehicles.length === 0) {
        socket.emit('vehicles_saved', { success: false, message: 'No vehicles provided' });
        return;
      }

      // Map vehicles to DB shape (snake_case)
      const dbRows = vehicles.map(v => ({
        id: v.id,
        name: v.name,
        driver_id: v.driverId ?? null,
        license_plate: v.licensePlate ?? null,
        type: v.type ?? null,
        status: v.status ?? null,
        location: v.location ?? null,
        capacity: v.capacity ?? null,
        mileage: v.mileage ?? null,
        free_at: v.freeAt ?? null,
        service_interval: v.serviceInterval ?? null,
        last_service_mileage: v.lastServiceMileage ?? null,
        technical_inspection_expiry: v.technicalInspectionExpiry ?? null,
        vignette_expiry: v.vignetteExpiry ?? null,
        fuel_type: v.fuelType ? String(v.fuelType).charAt(0).toUpperCase() + String(v.fuelType).slice(1).toLowerCase() : null,
        fuel_consumption: v.fuelConsumption ?? null,
        phone: v.phone ?? null,
        email: v.email ?? null,
        shift_start: v.shiftStart ?? null,
        shift_end: v.shiftEnd ?? null,
        shift_start_odo: v.shiftStartOdo ?? null,
        shift_end_odo: v.shiftEndOdo ?? null,
      }));

      // Upsert into vehicles table
      const { error } = await supabase.from('vehicles').upsert(dbRows, { onConflict: 'id' });
      if (error) {
        console.error('Failed to upsert vehicles in Supabase:', error);
        socket.emit('vehicles_saved', { success: false, error });
        return;
      }

      console.log('Vehicles upserted successfully (dispatcher update)');

      // Broadcast updated vehicles to other connected clients so they can refresh
      socket.broadcast.emit('vehicles_updated', { vehicles });

      // Acknowledge the dispatcher who sent the update
      socket.emit('vehicles_saved', { success: true, vehicles });
    } catch (err) {
      console.error('Error handling vehicles_update:', err);
      socket.emit('vehicles_saved', { success: false, error: String(err) });
    }
  });

  // Handle ride deletions
  socket.on('ride_deleted', async (data) => {
    try {
      const { rideId, shiftId } = data;

      console.log(`Ride ${rideId} deleted`);

      // Broadcast to shift room
      socket.to(`shift:${shiftId}`).emit('ride_deleted', {
        rideId
      });

    } catch (err) {
      console.error('Error handling ride deletion:', err);
    }
  });

  // Handle status changes
  socket.on('status_change', async (data) => {
    try {
      const { shiftId, rideId, newStatus, driverId } = data;

      // Broadcast to shift room
      socket.to(`shift:${shiftId}`).emit('status_changed', {
        rideId,
        newStatus,
        driverId,
        timestamp: Date.now()
      });

      // Update ride status in Supabase
      supabase.from('ride_logs')
        .update({
          status: newStatus.toLowerCase(),
          [newStatus === 'accepted' ? 'accepted_at' :
           newStatus === 'in_progress' ? 'started_at' :
           newStatus === 'completed' ? 'completed_at' : null]: new Date().toISOString()
        })
        .eq('id', rideId)
        .then(({ error }) => {
          if (error) {
            console.error('Failed to update ride status in Supabase:', error);
          } else {
            console.log('Ride status updated in Supabase');
          }
        });

    } catch (err) {
      console.error('Error handling status change:', err);
    }
  });

  // Handle ride cancellations
  socket.on('ride_cancelled', async (data) => {
    try {
      const { shiftId, rideId } = data;

      // Broadcast to shift room
      socket.to(`shift:${shiftId}`).emit('ride_cancelled', { rideId });

      // Update ride status in Supabase
      supabase.from('ride_logs')
        .update({ status: 'cancelled', completed_at: new Date().toISOString() })
        .eq('id', rideId)
        .then(({ error }) => {
          if (error) {
            console.error('Failed to cancel ride in Supabase:', error);
          } else {
            console.log('Ride cancelled in Supabase');
          }
        });

    } catch (err) {
      console.error('Error handling ride cancellation:', err);
    }
  });

  // Handle position updates
  socket.on('position_update', async (data) => {
    try {
      const { shiftId, vehicleId, latitude, longitude } = data;

      // Broadcast to shift room (dispatcher can track driver positions)
      socket.to(`shift:${shiftId}`).emit('position_updated', {
        vehicleId,
        latitude,
        longitude,
        timestamp: Date.now()
      });

      // Save location to Supabase
      const locationData = {
        vehicle_id: vehicleId,
        latitude,
        longitude,
        timestamp: new Date().toISOString()
      };

      supabase.from('locations').insert(locationData).then(({ error }) => {
        if (error) {
          console.error('Failed to save location to Supabase:', error);
        }
      });

    } catch (err) {
      console.error('Error handling position update:', err);
    }
  });

  // Handle typing indicators
  socket.on('typing_start', (data) => {
    socket.to(data.room).emit('user_typing', {
      userId: socket.userId,
      room: data.room
    });
  });

  socket.on('typing_stop', (data) => {
    socket.to(data.room).emit('user_stopped_typing', {
      userId: socket.userId,
      room: data.room
    });
  });

  // Handle read receipts
  socket.on('mark_as_read', async (data) => {
    try {
      const { messageId, room } = data;

      // Update message as read in Supabase
      const { error } = await supabase
        .from('driver_messages')
        .update({ read: true, read_at: new Date().toISOString() })
        .eq('id', messageId);

      if (error) {
        console.error('Failed to mark message as read:', error);
      } else {
        // Notify sender that message was read
        socket.to(room).emit('message_read', {
          messageId,
          readBy: socket.userId,
          readAt: new Date().toISOString()
        });
      }
    } catch (err) {
      console.error('Error marking message as read:', err);
    }
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.userEmail}`);

    // Update presence to offline
    if (userPresence.has(socket.userId)) {
      userPresence.set(socket.userId, {
        ...userPresence.get(socket.userId),
        status: 'offline',
        lastSeen: new Date()
      });

      // Broadcast presence update
      socket.broadcast.emit('presence_update', {
        userId: socket.userId,
        status: 'offline',
        lastSeen: new Date()
      });
    }

    // Clean up user presence after a delay to prevent flickering
    setTimeout(() => {
      if (userPresence.has(socket.userId) && userPresence.get(socket.userId).status === 'offline') {
        userPresence.delete(socket.userId);
        console.log(`Cleaned up presence for disconnected user: ${socket.userEmail}`);
      }
    }, 30000); // 30 seconds delay
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Real-time server running on port ${PORT}`);
});
