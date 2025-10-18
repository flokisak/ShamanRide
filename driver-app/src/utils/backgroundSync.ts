// Background sync utilities for PWA
export interface BackgroundSyncOptions {
  minInterval?: number; // Minimum interval in minutes
  maxInterval?: number; // Maximum interval in minutes
  retryOnFailure?: boolean;
}

export interface SyncStatusCallback {
  onSyncStart?: (tag: string) => void;
  onSyncSuccess?: (tag: string) => void;
  onSyncError?: (tag: string, error: Error) => void;
}

class BackgroundSyncManager {
  private registration: ServiceWorkerRegistration | null = null;
  private syncInProgress = false;
  private statusCallback: SyncStatusCallback | null = null;

  setStatusCallback(callback: SyncStatusCallback): void {
    this.statusCallback = callback;
  }

  async initialize(): Promise<void> {
    if ('serviceWorker' in navigator) {
      try {
        this.registration = await navigator.serviceWorker.ready;
        console.log('Background sync initialized');

        // Register for periodic sync if supported
        if ('periodicSync' in this.registration) {
          await this.registerPeriodicSync();
        }

        // Listen for online/offline events
        this.setupNetworkListeners();

      } catch (error) {
        console.error('Failed to initialize background sync:', error);
      }
    } else {
      console.warn('Service workers not supported');
    }
  }

  private async registerPeriodicSync(): Promise<void> {
    if (!this.registration || !('periodicSync' in this.registration)) return;

    try {
      const periodicSync = (this.registration as any).periodicSync;
      if (!periodicSync) return;

      // Register periodic sync for location updates (every 30 minutes to save battery)
      await periodicSync.register('location-update', {
        minInterval: 30 * 60 * 1000, // 30 minutes
      });

      // Register periodic sync for data sync (every 60 minutes)
      await periodicSync.register('data-sync', {
        minInterval: 60 * 60 * 1000, // 60 minutes
      });

      console.log('Periodic background sync registered');
    } catch (error) {
      console.error('Failed to register periodic sync:', error);
    }
  }

  private setupNetworkListeners(): void {
    window.addEventListener('online', () => {
      console.log('Network online - triggering background sync');
      this.requestSync('background-sync');
    });

    window.addEventListener('offline', () => {
      console.log('Network offline - queuing data for later sync');
    });
  }

  async requestSync(tag: string): Promise<void> {
    if (!this.registration || this.syncInProgress) return;

    try {
      this.syncInProgress = true;
      this.statusCallback?.onSyncStart?.(tag);

      if ('sync' in this.registration && this.registration.sync) {
        await this.registration.sync.register(tag);
        console.log(`Background sync requested: ${tag}`);
      } else {
        // Fallback: perform sync directly
        await this.performDirectSync(tag);
      }

      this.statusCallback?.onSyncSuccess?.(tag);
    } catch (error) {
      console.error('Failed to request background sync:', error);
      this.statusCallback?.onSyncError?.(tag, error as Error);
    } finally {
      this.syncInProgress = false;
    }
  }

  private async performDirectSync(tag: string): Promise<void> {
    console.log(`Performing direct sync: ${tag}`);

    try {
      // Implement direct sync logic here
      // This would be similar to the service worker sync handlers
      switch (tag) {
        case 'background-sync':
          await this.syncAllData();
          break;
        case 'location-sync':
          await this.syncLocationData();
          break;
        case 'message-sync':
          await this.syncMessageData();
          break;
      }

      this.statusCallback?.onSyncSuccess?.(tag);
    } catch (error) {
      console.error(`Direct sync failed for ${tag}:`, error);
      this.statusCallback?.onSyncError?.(tag, error as Error);
      throw error;
    }
  }

  private async syncAllData(): Promise<void> {
    await Promise.all([
      this.syncLocationData(),
      this.syncMessageData(),
      this.syncRideData()
    ]);
  }

  private async syncLocationData(): Promise<void> {
    try {
      const cachedLocations = localStorage.getItem('cached-locations');
      if (cachedLocations) {
        const locations = JSON.parse(cachedLocations);
        if (locations.length > 0) {
          console.log('Syncing cached locations:', locations.length);
          // Here you would send to your API
          // await fetch('/api/sync-locations', { ... })
          localStorage.removeItem('cached-locations');
        }
      }
    } catch (error) {
      console.error('Failed to sync location data:', error);
    }
  }

  private async syncMessageData(): Promise<void> {
    try {
      const pendingMessages = localStorage.getItem('pending-messages');
      if (pendingMessages) {
        const messages = JSON.parse(pendingMessages);
        if (messages.length > 0) {
          console.log('Syncing pending messages:', messages.length);
          // Here you would send to your API
          // await fetch('/api/sync-messages', { ... })
          localStorage.removeItem('pending-messages');
        }
      }
    } catch (error) {
      console.error('Failed to sync message data:', error);
    }
  }

  private async syncRideData(): Promise<void> {
    try {
      const pendingUpdates = localStorage.getItem('pending-ride-updates');
      if (pendingUpdates) {
        const updates = JSON.parse(pendingUpdates);
        if (updates.length > 0) {
          console.log('Syncing pending ride updates:', updates.length);
          // Here you would send to your API
          // await fetch('/api/sync-ride-updates', { ... })
          localStorage.removeItem('pending-ride-updates');
        }
      }
    } catch (error) {
      console.error('Failed to sync ride data:', error);
    }
  }

  // Public methods for manual sync requests
  async syncNow(): Promise<void> {
    await this.requestSync('background-sync');
  }

  async syncLocations(): Promise<void> {
    await this.requestSync('location-sync');
  }

  async syncMessages(): Promise<void> {
    await this.requestSync('message-sync');
  }

  // Queue data for later sync when offline
  queueLocationData(data: any): void {
    const existing = localStorage.getItem('cached-locations');
    const locations = existing ? JSON.parse(existing) : [];
    locations.push({ ...data, timestamp: Date.now() });
    localStorage.setItem('cached-locations', JSON.stringify(locations));
  }

  queueMessage(data: any): void {
    const existing = localStorage.getItem('pending-messages');
    const messages = existing ? JSON.parse(existing) : [];
    messages.push({ ...data, timestamp: Date.now() });
    localStorage.setItem('pending-messages', JSON.stringify(messages));
  }

  queueRideUpdate(data: any): void {
    const existing = localStorage.getItem('pending-ride-updates');
    const updates = existing ? JSON.parse(existing) : [];
    updates.push({ ...data, timestamp: Date.now() });
    localStorage.setItem('pending-ride-updates', JSON.stringify(updates));
  }
}

// Singleton instance
const backgroundSyncManager = new BackgroundSyncManager();

export const initializeBackgroundSync = async (): Promise<void> => {
  await backgroundSyncManager.initialize();
};

export const requestBackgroundSync = (tag: string = 'background-sync'): Promise<void> => {
  return backgroundSyncManager.requestSync(tag);
};

export const syncNow = (): Promise<void> => {
  return backgroundSyncManager.syncNow();
};

export const queueLocationData = (data: any): void => {
  backgroundSyncManager.queueLocationData(data);
};

export const queueMessage = (data: any): void => {
  backgroundSyncManager.queueMessage(data);
};

export const queueRideUpdate = (data: any): void => {
  backgroundSyncManager.queueRideUpdate(data);
};

export { backgroundSyncManager };

export default backgroundSyncManager;