// Custom service worker for push notifications
const CACHE_NAME = 'shamanride-driver-v1';

// Install event - cache resources
self.addEventListener('install', (event) => {
  console.log('Service worker installing');
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('Service worker activating');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      return self.clients.claim();
    })
  );
});

// Play notification sound in service worker (limited capabilities)
async function playNotificationSoundInSW(frequency = 800, duration = 0.2) {
  // Note: Web Audio API is not available in service workers
  // We can only rely on the system notification sound
  // The main app will handle sound when it's active
  console.log('SW: Sound requested but Web Audio API not available in service worker');
}

// Vibrate device from service worker
function vibrateDeviceInSW(pattern = [200, 100, 200]) {
  // Vibration API is available in service workers on mobile
  if ('vibrate' in navigator) {
    try {
      navigator.vibrate(pattern);
      console.log('SW: Vibration triggered:', pattern);
    } catch (error) {
      console.warn('SW: Vibration failed:', error);
    }
  } else {
    console.warn('SW: Vibration API not supported');
  }
}

// Push event - handle incoming push notifications with Android Chrome optimizations
self.addEventListener('push', (event) => {
  console.log('Push received:', event);

  let data = {};
  if (event.data) {
    data = event.data.json();
  }

  // Android Chrome specific notification options
  const isAndroidChrome = navigator.userAgent.includes('Android') && navigator.userAgent.includes('Chrome') && !navigator.userAgent.includes('Edg');

  const options = {
    body: data.body || 'You have a new notification',
    icon: isAndroidChrome ? '/android-launchericon-192-192.png' : '/pwa-192x192.svg',
    badge: isAndroidChrome ? '/android-launchericon-96-96.png' : '/pwa-192x192.svg',
    vibrate: data.vibrate || [200, 100, 200],
    requireInteraction: data.type === 'ride', // Keep ride notifications visible
    silent: isAndroidChrome ? true : false, // Android Chrome handles sound better when silent
    tag: data.tag || `push-${Date.now()}`,
    data: data.data || {}
  };

  // Enhanced vibration patterns for Android Chrome
  if (isAndroidChrome) {
    if (data.type === 'ride') {
      options.vibrate = [400, 200, 400, 200, 400]; // Stronger, longer buzzes for rides
    } else if (data.type === 'message') {
      options.vibrate = [150, 100, 150]; // Clearer pattern for messages
    } else {
      options.vibrate = [250, 150, 250];
    }
  }

  // Trigger vibration from service worker
  vibrateDeviceInSW(options.vibrate);

  // Android Chrome specific handling
  if (isAndroidChrome) {
    console.log('Android Chrome push notification:', data.title, options);
  }

  // Try to wake up the app if it's in background
  event.waitUntil(
    Promise.all([
      self.registration.showNotification(data.title || 'Need For Taxi', options),
      // Send message to main thread to trigger sound if app is running
      self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
        clients.forEach(client => {
          client.postMessage({
            type: 'NOTIFICATION_RECEIVED',
            notificationType: data.type || 'general',
            title: data.title,
            body: data.body,
            isAndroidChrome: isAndroidChrome
          });
        });
      })
    ])
  );
});

// Notification click event - handle when user clicks on notification
self.addEventListener('notificationclick', (event) => {
  console.log('Notification click received:', event);

  event.notification.close();

  // Focus existing window or open new one
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      const url = event.notification.data?.url || '/';

      for (let i = 0; i < clientList.length; i++) {
        const client = clientList[i];
        if (client.url === url && 'focus' in client) {
          return client.focus();
        }
      }

      if (clients.openWindow) {
        return clients.openWindow(url);
      }
    })
  );
});

// Background sync for offline functionality
self.addEventListener('sync', (event) => {
  console.log('Background sync triggered:', event.tag);

  if (event.tag === 'background-sync') {
    event.waitUntil(doBackgroundSync());
  } else if (event.tag === 'location-sync') {
    event.waitUntil(syncLocationData());
  } else if (event.tag === 'message-sync') {
    event.waitUntil(syncPendingMessages());
  }
});

// Periodic background sync (if supported)
self.addEventListener('periodicsync', (event) => {
  console.log('Periodic background sync triggered:', event.tag);

  if (event.tag === 'location-update') {
    event.waitUntil(periodicLocationUpdate());
  } else if (event.tag === 'data-sync') {
    event.waitUntil(periodicDataSync());
  }
});

async function doBackgroundSync() {
  console.log('Performing general background sync');

  try {
    // Sync all pending data when coming back online
    await Promise.all([
      syncLocationData(),
      syncPendingMessages(),
      syncRideUpdates()
    ]);

    console.log('Background sync completed successfully');
  } catch (error) {
    console.error('Background sync failed:', error);
    throw error; // Re-throw to mark sync as failed
  }
}

async function syncLocationData() {
  console.log('Syncing location data');

  try {
    // Get cached location data from IndexedDB or localStorage
    const cachedLocations = await getCachedLocationData();

    if (cachedLocations && cachedLocations.length > 0) {
      // Send cached locations to server
      const response = await fetch('/api/sync-locations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ locations: cachedLocations })
      });

      if (response.ok) {
        console.log('Location data synced successfully');
        // Clear cached data
        await clearCachedLocationData();
      } else {
        throw new Error('Failed to sync location data');
      }
    }
  } catch (error) {
    console.error('Location sync failed:', error);
    throw error;
  }
}

async function syncPendingMessages() {
  console.log('Syncing pending messages');

  try {
    const pendingMessages = await getPendingMessages();

    if (pendingMessages && pendingMessages.length > 0) {
      const response = await fetch('/api/sync-messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ messages: pendingMessages })
      });

      if (response.ok) {
        console.log('Messages synced successfully');
        await clearPendingMessages();
      } else {
        throw new Error('Failed to sync messages');
      }
    }
  } catch (error) {
    console.error('Message sync failed:', error);
    throw error;
  }
}

async function syncRideUpdates() {
  console.log('Syncing ride updates');

  try {
    const pendingUpdates = await getPendingRideUpdates();

    if (pendingUpdates && pendingUpdates.length > 0) {
      const response = await fetch('/api/sync-ride-updates', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ updates: pendingUpdates })
      });

      if (response.ok) {
        console.log('Ride updates synced successfully');
        await clearPendingRideUpdates();
      } else {
        throw new Error('Failed to sync ride updates');
      }
    }
  } catch (error) {
    console.error('Ride update sync failed:', error);
    throw error;
  }
}

async function periodicLocationUpdate() {
  console.log('Performing periodic location update');

  // This would typically be triggered by the periodic sync
  // For now, we'll just log that it happened
  // In a real implementation, this might wake up the app or perform minimal tasks

  try {
    // Check if we need to perform any maintenance tasks
    await performMaintenanceTasks();
  } catch (error) {
    console.error('Periodic location update failed:', error);
  }
}

async function periodicDataSync() {
  console.log('Performing periodic data sync');

  try {
    // Perform lightweight data sync operations
    await Promise.all([
      checkForNewRides(),
      syncAppSettings(),
      updateDriverStatus()
    ]);
  } catch (error) {
    console.error('Periodic data sync failed:', error);
  }
}

// Helper functions for data persistence (simplified - would use IndexedDB in production)
async function getCachedLocationData() {
  // In a real implementation, this would query IndexedDB
  const data = localStorage.getItem('cached-locations');
  return data ? JSON.parse(data) : [];
}

async function clearCachedLocationData() {
  localStorage.removeItem('cached-locations');
}

async function getPendingMessages() {
  const data = localStorage.getItem('pending-messages');
  return data ? JSON.parse(data) : [];
}

async function clearPendingMessages() {
  localStorage.removeItem('pending-messages');
}

async function getPendingRideUpdates() {
  const data = localStorage.getItem('pending-ride-updates');
  return data ? JSON.parse(data) : [];
}

async function clearPendingRideUpdates() {
  localStorage.removeItem('pending-ride-updates');
}

async function performMaintenanceTasks() {
  // Clean up old cached data, check app health, etc.
  console.log('Performing maintenance tasks');
}

async function checkForNewRides() {
  // Check for new ride assignments
  console.log('Checking for new rides');
}

async function syncAppSettings() {
  // Sync app settings with server
  console.log('Syncing app settings');
}

async function updateDriverStatus() {
  // Update driver online status
  console.log('Updating driver status');
}