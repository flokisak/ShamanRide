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

// Push event - handle incoming push notifications
self.addEventListener('push', (event) => {
  console.log('Push received:', event);

  let data = {};
  if (event.data) {
    data = event.data.json();
  }

  const options = {
    body: data.body || 'You have a new notification',
    icon: '/pwa-192x192.svg',
    badge: '/pwa-192x192.svg',
    vibrate: data.vibrate || [200, 100, 200],
    requireInteraction: true,
    silent: false,
    tag: data.tag || 'default',
    data: data.data || {}
  };

  // Play sound if supported (limited in service workers)
  // Note: Web Audio API is not available in service workers
  // Sound will be handled by the system notification settings

  event.waitUntil(
    self.registration.showNotification(data.title || 'ShamanRide Driver', options)
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

// Background sync for offline functionality (optional)
self.addEventListener('sync', (event) => {
  console.log('Background sync triggered:', event.tag);

  if (event.tag === 'background-sync') {
    event.waitUntil(doBackgroundSync());
  }
});

async function doBackgroundSync() {
  // Implement background sync logic here if needed
  console.log('Performing background sync');
}