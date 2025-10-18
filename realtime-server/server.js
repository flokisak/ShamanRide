const express = require('express');
require('dotenv').config();
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');
const CryptoJS = require('crypto-js');

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL || 'https://dmxkqofoecqdjbigxoon.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

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
    console.log(`User ${socket.userEmail} joined shift:${shiftId}`);
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
      const { room, message, senderId, receiverId, type } = data;

      // Generate room-specific encryption key
      const encryptionKey = generateRoomKey(room);

      // Encrypt the message content
      const encryptedMessage = encryptMessage(message, encryptionKey);

      // Create message object with encrypted content
      const messageData = {
        id: crypto.randomUUID(),
        sender_id: senderId,
        receiver_id: receiverId || room,
        message: encryptedMessage, // Store encrypted message
        timestamp: new Date().toISOString(),
        read: false,
        type: type || 'private',
        encrypted: true // Flag to indicate message is encrypted
      };

      // Decrypt message for broadcasting (clients will handle encryption)
      const decryptedMessage = {
        ...messageData,
        message: decryptMessage(encryptedMessage, encryptionKey)
      };

      // Broadcast decrypted message to room
      socket.to(room).emit('new_message', decryptedMessage);

      // Persist encrypted message to Supabase asynchronously with retry logic
      const saveMessageWithRetry = async (messageData, retries = 3) => {
        for (let i = 0; i < retries; i++) {
          try {
            const { error } = await supabase.from('driver_messages').insert(messageData);
            if (!error) {
              console.log('Encrypted message saved to Supabase');
              // Emit delivery confirmation
              socket.emit('message_delivered', { messageId: messageData.id });
              return;
            } else {
              console.error(`Failed to save encrypted message to Supabase (attempt ${i + 1}):`, error);
              if (i === retries - 1) {
                // Emit error after all retries failed
                socket.emit('message_error', {
                  messageId: messageData.id,
                  error: 'Failed to save message'
                });
              }
            }
          } catch (err) {
            console.error(`Error saving encrypted message (attempt ${i + 1}):`, err);
            if (i === retries - 1) {
              socket.emit('message_error', {
                messageId: messageData.id,
                error: 'Failed to save message'
              });
            }
          }
          // Wait before retry
          if (i < retries - 1) {
            await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
          }
        }
      };

      saveMessageWithRetry(messageData);

    } catch (err) {
      console.error('Error handling encrypted message:', err);
    }
  });

  // Handle ride updates
  socket.on('ride_update', async (data) => {
    try {
      const { shiftId, rideData } = data;

      // Broadcast to shift room
      socket.to(`shift:${shiftId}`).emit('ride_updated', rideData);

      // Persist ride update to Supabase
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

      supabase.from('ride_logs').upsert(dbRideData, { onConflict: 'id' }).then(({ error }) => {
        if (error) {
          console.error('Failed to save ride update to Supabase:', error);
        } else {
          console.log('Ride update saved to Supabase');
        }
      });

    } catch (err) {
      console.error('Error handling ride update:', err);
    }
  });

  // Handle vehicle status changes
  socket.on('vehicle_status_changed', async (data) => {
    try {
      const { vehicleId, status, driverStatus, timestamp } = data;

      console.log(`Vehicle ${vehicleId} status changed to ${status} by driver`);

      // Update vehicle status in Supabase
      const { error } = await supabase
        .from('vehicles')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', vehicleId);

      if (error) {
        console.error('Failed to update vehicle status in Supabase:', error);
      } else {
        console.log(`Vehicle ${vehicleId} status updated to ${status} in database`);
      }

      // Broadcast to all connected clients (dispatchers and other drivers)
      socket.broadcast.emit('vehicle_status_updated', {
        vehicleId: parseInt(vehicleId),
        status,
        driverStatus,
        timestamp
      });

    } catch (err) {
      console.error('Error handling vehicle status change:', err);
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
