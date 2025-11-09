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
  private syncInProgress = false;
  private statusCallback: SyncStatusCallback | null = null;

  setStatusCallback(callback: SyncStatusCallback): void {
    this.statusCallback = callback;
  }

  private startPeriodicDirectSync(): void {
    // Perform sync every 5 minutes
    setInterval(() => {
      if (!this.syncInProgress && navigator.onLine) {
        this.performDirectSync('background-sync').catch(error => {
          console.error('Periodic sync failed:', error);
        });
      }
    }, 5 * 60 * 1000); // 5 minutes
  }

  async initialize(): Promise<void> {
    console.log('Background sync initialized (direct sync only)');

    // Listen for online/offline events
    this.setupNetworkListeners();

    // Start periodic sync using direct sync instead of service workers
    this.startPeriodicDirectSync();
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
    if (this.syncInProgress) return;

    try {
      this.syncInProgress = true;
      this.statusCallback?.onSyncStart?.(tag);

      // Perform sync directly
      await this.performDirectSync(tag);
      this.statusCallback?.onSyncSuccess?.(tag);
    } catch (error) {
      console.error(`Background sync failed: ${tag}`, error);
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
          // Note: Location data is now handled by socket reconnection logic
          // This background sync is kept for compatibility but location sync
          // is primarily handled when socket reconnects
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