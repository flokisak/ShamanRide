// Enhanced service worker for APK-ready PWA
const CACHE_NAME = 'shamanride-driver-v2.0.0';
const STATIC_CACHE = 'shamanride-static-v2.0.0';
const DYNAMIC_CACHE = 'shamanride-dynamic-v2.0.0';

// Resources to cache immediately
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/android-launchericon-192-192.png',
  '/android-launchericon-512-512.png',
  '/favicon.svg'
];

// Install event - cache essential resources for offline functionality
self.addEventListener('install', (event) => {
  console.log('Service worker installing - caching static assets');
  event.waitUntil(
    Promise.all([
      caches.open(STATIC_CACHE).then(cache => {
        console.log('Caching static assets');
        return cache.addAll(STATIC_ASSETS);
      }),
      self.skipWaiting()
    ])
  );
});

// Activate event - clean up old caches and take control
self.addEventListener('activate', (event) => {
  console.log('Service worker activating - cleaning caches');
  event.waitUntil(
    Promise.all([
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (!cacheName.includes('shamanride')) {
              console.log('Deleting non-ShamanRide cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      }),
      self.clients.claim()
    ])
  );
});

// Fetch event - handle caching and offline functionality
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests and external requests
  if (request.method !== 'GET' || !url.origin.includes(self.location.origin)) {
    return;
  }

  // Skip service worker handling for static assets to avoid caching issues
  if (url.pathname.startsWith('/assets/')) {
    return;
  }

  // Cache-first strategy for static assets
  if (STATIC_ASSETS.some(asset => url.pathname.endsWith(asset))) {
    event.respondWith(
      caches.match(request).then(response => {
        return response || fetch(request).then(fetchResponse => {
          return caches.open(STATIC_CACHE).then(cache => {
            cache.put(request, fetchResponse.clone());
            return fetchResponse;
          });
        });
      })
    );
    return;
  }

  // Network-first strategy for API calls (with cache fallback)
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request)
        .then(response => {
          // Cache successful API responses
          if (response.ok) {
            const responseClone = response.clone();
            caches.open(DYNAMIC_CACHE).then(cache => {
              cache.put(request, responseClone);
            });
          }
          return response;
        })
        .catch(() => {
          // Return cached version if network fails
          return caches.match(request);
        })
    );
    return;
  }

  // Handle navigation requests with offline fallback
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          // Cache successful navigation responses
          if (response.ok) {
            caches.open(DYNAMIC_CACHE).then(cache => {
              cache.put(request, response.clone());
            });
          }
          return response;
        })
        .catch(() => {
          // Return cached page or offline fallback
          return caches.match(request).then(cachedResponse => {
            return cachedResponse || caches.match('/').then(rootResponse => {
              return rootResponse || new Response(
                '<html><body><h1>You are offline</h1><p>The app will work when connection is restored.</p></body></html>',
                { headers: { 'Content-Type': 'text/html' } }
              );
            });
          });
        })
    );
    return;
  }

  // Stale-while-revalidate for other requests
  event.respondWith(
    caches.match(request).then(cachedResponse => {
      const fetchPromise = fetch(request).then(networkResponse => {
        if (networkResponse.ok) {
          caches.open(DYNAMIC_CACHE).then(cache => {
            cache.put(request, networkResponse.clone());
          });
        }
        return networkResponse;
      });

      return cachedResponse || fetchPromise;
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

// Push event - handle incoming push notifications for native Android APK
self.addEventListener('push', (event) => {
  console.log('Push notification received:', event);

  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      console.warn('Failed to parse push data:', e);
      data = { title: 'Notification', body: event.data.text() };
    }
  }

  const options = {
    body: data.body || 'You have a new notification',
    icon: '/android-launchericon-192-192.png',
    badge: '/android-launchericon-96-96.png',
    vibrate: data.vibrate || [200, 100, 200],
    requireInteraction: data.type === 'ride' || data.type === 'urgent', // Keep important notifications visible
    silent: false, // Enable system sound for native Android
    tag: data.tag || `shamanride-${data.type || 'general'}-${Date.now()}`,
    data: {
      url: data.url || '/',
      type: data.type || 'general',
      ...data.data
    },
    // Notification actions for native Android
    actions: data.type === 'ride' ? [
      {
        action: 'accept',
        title: 'Přijmout',
        icon: '/android-launchericon-96-96.png'
      },
      {
        action: 'decline',
        title: 'Odmítnout',
        icon: '/android-launchericon-96-96.png'
      }
    ] : []
  };

  // Native Android specific optimizations
  if (data.type === 'ride') {
    options.vibrate = [400, 200, 400, 200, 400]; // Strong pattern for rides
  } else if (data.type === 'message') {
    options.vibrate = [150, 100, 150]; // Quick pattern for messages
  }

  // Trigger vibration
  vibrateDeviceInSW(options.vibrate);

  event.waitUntil(
    Promise.all([
      // Show the notification
      self.registration.showNotification(data.title || 'ShamanRide Driver', options),

      // Send message to main thread for additional handling
      self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
        const message = {
          type: 'NOTIFICATION_RECEIVED',
          notificationType: data.type || 'general',
          title: data.title,
          body: data.body,
          data: data.data
        };

        clients.forEach(client => {
          client.postMessage(message);
        });

        // If no clients are open, open the app
        if (clients.length === 0 && data.type === 'ride') {
          return self.clients.openWindow('/');
        }
      })
    ])
  );
});

// Notification click event - handle when user clicks on notification or actions
self.addEventListener('notificationclick', (event) => {
  console.log('Notification click received:', event);
  console.log('Action:', event.action);
  console.log('Notification data:', event.notification.data);

  event.notification.close();

  // Handle notification actions
  if (event.action) {
    event.waitUntil(
      handleNotificationAction(event.action, event.notification.data)
    );
    return;
  }

  // Default click behavior - focus existing window or open new one
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      const url = event.notification.data?.url || '/';

      for (let i = 0; i < clientList.length; i++) {
        const client = clientList[i];
        if ('focus' in client) {
          return client.focus();
        }
      }

      if (clients.openWindow) {
        return clients.openWindow(url);
      }
    })
  );
});

// Handle notification actions (like accept/decline ride)
async function handleNotificationAction(action, notificationData) {
  console.log('Handling notification action:', action, notificationData);

  try {
    // Send action to server
    const response = await fetch('/api/notification-action', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action,
        notificationData,
        timestamp: Date.now()
      })
    });

    if (response.ok) {
      console.log('Notification action processed successfully');
    } else {
      console.warn('Failed to process notification action');
    }
  } catch (error) {
    console.error('Error processing notification action:', error);
  }

  // Open the app
  const clientList = await clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (let client of clientList) {
    if ('focus' in client) {
      return client.focus();
    }
  }

  if (clients.openWindow) {
    return clients.openWindow('/');
  }
}

// Message event - handle messages from main thread
self.addEventListener('message', (event) => {
  console.log('Service worker received message:', event.data);

  if (event.data && event.data.type) {
    switch (event.data.type) {
      case 'SKIP_WAITING':
        self.skipWaiting();
        break;
      case 'GET_VERSION':
        event.ports[0].postMessage({ version: '2.0.0' });
        break;
      case 'CACHE_DATA':
        // Cache data for offline use
        if (event.data.key && event.data.data) {
          caches.open(DYNAMIC_CACHE).then(cache => {
            const response = new Response(JSON.stringify(event.data.data));
            cache.put(`/api/${event.data.key}`, response);
          });
        }
        break;
      default:
        console.log('Unknown message type:', event.data.type);
    }
  }
});

// Background sync for offline functionality
self.addEventListener('sync', (event) => {
  console.log('Background sync triggered:', event.tag);

  switch (event.tag) {
    case 'background-sync':
      event.waitUntil(doBackgroundSync());
      break;
    case 'location-sync':
      event.waitUntil(syncLocationData());
      break;
    case 'message-sync':
      event.waitUntil(syncPendingMessages());
      break;
    case 'ride-sync':
      event.waitUntil(syncRideUpdates());
      break;
    default:
      console.log('Unknown sync tag:', event.tag);
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
      const response = await fetch('/api/sync?type=locations', {
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
      const response = await fetch('/api/sync?type=messages', {
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
      const response = await fetch('/api/sync?type=ride-updates', {
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