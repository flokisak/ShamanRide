import { supabaseService } from './supabaseClient';

// Centralized sync helpers: prefer socket emit via window.dispatcherSocket, fallback to supabaseService

async function sendRidePushFallback(rideData: any, eventType = 'assigned') {
  const vehicleNumber = rideData?.vehicleId ?? rideData?.vehicle_id;
  const status = String(rideData?.status || '').toLowerCase();
  const shouldNotify =
    vehicleNumber &&
    (eventType === 'cancelled' || status === 'pending' || status === 'accepted' || status === 'cancelled');

  if (!shouldNotify) return;

  try {
    await fetch('/api/send-push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vehicleNumber,
        ride: rideData,
        eventType: status === 'cancelled' ? 'cancelled' : eventType
      })
    });
  } catch (error) {
    console.warn('Ride push fallback failed:', error);
  }
}

export async function persistRide(rideData: any) {
  try {
    const socket = (window as any).dispatcherSocket;
    if (socket) {
      socket.emit('ride_update', { shiftId: 'dispatcher_shift', rideData });
      return { via: 'socket' };
    } else {
      await supabaseService.addRideLog(rideData);
      await sendRidePushFallback(rideData);
      return { via: 'supabase' };
    }
  } catch (err) {
    // Fallback to supabase if emit or other fails
    try {
      await supabaseService.addRideLog(rideData);
      await sendRidePushFallback(rideData);
      return { via: 'supabase', error: err };
    } catch (err2) {
      return { via: 'failed', error: err2 };
    }
  }
}

export async function updateVehicles(updatedVehicles: any[], options?: any) {
  try {
    const socket = (window as any).dispatcherSocket;
    if (socket) {
      socket.emit('vehicles_update', { shiftId: 'dispatcher_shift', vehicles: updatedVehicles, options });
      return { via: 'socket' };
    } else {
      await supabaseService.updateVehicles(updatedVehicles, options);
      return { via: 'supabase' };
    }
  } catch (err) {
    try {
      await supabaseService.updateVehicles(updatedVehicles, options);
      return { via: 'supabase', error: err };
    } catch (err2) {
      return { via: 'failed', error: err2 };
    }
  }
}

export async function deleteVehicle(vehicleId: number) {
  try {
    const socket = (window as any).dispatcherSocket;
    if (socket) {
      socket.emit('vehicle_deleted', { shiftId: 'dispatcher_shift', vehicleId });
      return { via: 'socket' };
    } else {
      await supabaseService.deleteVehicle(vehicleId);
      return { via: 'supabase' };
    }
  } catch (err) {
    try {
      await supabaseService.deleteVehicle(vehicleId);
      return { via: 'supabase', error: err };
    } catch (err2) {
      return { via: 'failed', error: err2 };
    }
  }
}

export async function updatePeople(updatedPeople: any[]) {
  try {
    const socket = (window as any).dispatcherSocket;
    if (socket) {
      socket.emit('people_update', { shiftId: 'dispatcher_shift', people: updatedPeople });
      return { via: 'socket' };
    } else {
      await supabaseService.updatePeople(updatedPeople);
      return { via: 'supabase' };
    }
  } catch (err) {
    try {
      await supabaseService.updatePeople(updatedPeople);
      return { via: 'supabase', error: err };
    } catch (err2) {
      return { via: 'failed', error: err2 };
    }
  }
}

export async function deletePerson(personId: number) {
  try {
    const socket = (window as any).dispatcherSocket;
    if (socket) {
      socket.emit('person_deleted', { shiftId: 'dispatcher_shift', personId });
      return { via: 'socket' };
    } else {
      await supabaseService.deletePerson(personId);
      return { via: 'supabase' };
    }
  } catch (err) {
    try {
      await supabaseService.deletePerson(personId);
      return { via: 'supabase', error: err };
    } catch (err2) {
      return { via: 'failed', error: err2 };
    }
  }
}

export async function deleteRideLog(rideLogId: string) {
  try {
    const socket = (window as any).dispatcherSocket;
    if (socket) {
      socket.emit('ride_deleted', { shiftId: 'dispatcher_shift', rideId: rideLogId });
      return { via: 'socket' };
    } else {
      await supabaseService.deleteRideLog(rideLogId);
      return { via: 'supabase' };
    }
  } catch (err) {
    try {
      await supabaseService.deleteRideLog(rideLogId);
      return { via: 'supabase', error: err };
    } catch (err2) {
      return { via: 'failed', error: err2 };
    }
  }
}

// Persist chat/driver message: prefer emitting via dispatcher socket when available,
// otherwise fall back to Supabase client.
export async function persistMessage(message: any) {
  try {
    const socket = (window as any).dispatcherSocket;
    // If caller provided room/senderId/receiverId, prefer emitting (server will persist)
    if (socket && (message.room || message.senderId)) {
      socket.emit('message', message);
      return { via: 'socket' };
    }

    // Normalize to DB shape if necessary
    const dbMessage = message.sender_id ? message : {
      sender_id: message.senderId || 'dispatcher',
      receiver_id: message.receiverId || message.receiver || 'general',
      message: message.message || message.text || '',
      read: message.read || false,
      timestamp: message.timestamp || new Date().toISOString()
    };

    await supabaseService.addDriverMessage(dbMessage);
    return { via: 'supabase' };
  } catch (err) {
    try {
      const dbMessage = message.sender_id ? message : {
        sender_id: message.senderId || 'dispatcher',
        receiver_id: message.receiverId || message.receiver || 'general',
        message: message.message || message.text || '',
        read: message.read || false,
        timestamp: message.timestamp || new Date().toISOString()
      };
      await supabaseService.addDriverMessage(dbMessage);
      return { via: 'supabase', error: err };
    } catch (err2) {
      return { via: 'failed', error: err2 };
    }
  }
}
