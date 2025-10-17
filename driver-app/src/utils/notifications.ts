// Enhanced notification utilities for mobile PWA

// Request notification permissions
export const requestNotificationPermission = async (): Promise<boolean> => {
  try {
    if (!('Notification' in window)) {
      console.warn('This browser does not support notifications');
      return false;
    }

    if (Notification.permission === 'granted') {
      return true;
    }

    if (Notification.permission === 'denied') {
      console.warn('Notification permission was denied');
      return false;
    }

    const permission = await Notification.requestPermission();
    return permission === 'granted';
  } catch (error) {
    console.error('Error requesting notification permission:', error);
    return false;
  }
};

// Show system notification
export const showSystemNotification = (title: string, options: NotificationOptions = {}) => {
  try {
    if (Notification.permission === 'granted') {
      const notification = new Notification(title, {
        icon: '/pwa-192x192.svg',
        badge: '/pwa-192x192.svg',
        requireInteraction: false,
        silent: false,
        ...options
      });

      // Auto-close after 5 seconds
      setTimeout(() => {
        notification.close();
      }, 5000);

      return notification;
    }
  } catch (error) {
    console.error('Error showing system notification:', error);
  }
  return null;
};

// Play a notification sound using Web Audio API
export const playNotificationSound = (frequency: number = 800, duration: number = 0.2) => {
  try {
    // Check if Web Audio API is supported
    if (!window.AudioContext && !(window as any).webkitAudioContext) {
      console.warn('Web Audio API not supported');
      return;
    }

    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    const audioContext = new AudioContext();

    // Resume audio context if suspended (required by some browsers)
    if (audioContext.state === 'suspended') {
      audioContext.resume();
    }

    // Create oscillator for beep sound
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    // Configure beep sound
    oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);
    oscillator.type = 'sine';

    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + duration);

    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + duration);
  } catch (error) {
    console.error('Error playing notification sound:', error);
  }
};

// Vibrate the device with different patterns
export const vibrateDevice = (pattern: number | number[] = [200, 100, 200]) => {
  try {
    if ('vibrate' in navigator) {
      navigator.vibrate(pattern);
    } else {
      console.warn('Vibration API not supported');
    }
  } catch (error) {
    console.error('Error vibrating device:', error);
  }
};

// Enhanced notification function with different types
export const notifyUser = (type: 'ride' | 'message' | 'general' = 'general', customOptions?: {
  sound?: boolean;
  vibration?: boolean;
  systemNotification?: boolean;
  title?: string;
  body?: string;
}) => {
  const defaults = {
    sound: true,
    vibration: true,
    systemNotification: true
  };

  let options;
  switch (type) {
    case 'ride':
      options = {
        ...defaults,
        vibrationPattern: [300, 100, 300, 100, 300], // Long buzzes for rides
        title: 'Nová jízda!',
        body: 'Byla vám přiřazena nová jízda'
      };
      break;
    case 'message':
      options = {
        ...defaults,
        vibrationPattern: [100, 50, 100], // Short buzzes for messages
        title: 'Nová zpráva',
        body: 'Máte novou zprávu od dispečera'
      };
      break;
    default:
      options = {
        ...defaults,
        vibrationPattern: [200, 100, 200],
        title: 'Upozornění',
        body: 'Máte nové upozornění'
      };
  }

  const finalOptions = { ...options, ...customOptions };

  // Play sound
  if (finalOptions.sound) {
    if (type === 'ride') {
      // Different sound for rides (higher pitch)
      playNotificationSound(1000, 0.3);
    } else if (type === 'message') {
      // Different sound for messages (lower pitch)
      playNotificationSound(600, 0.2);
    } else {
      playNotificationSound(800, 0.2);
    }
  }

  // Vibrate
  if (finalOptions.vibration) {
    vibrateDevice(finalOptions.vibrationPattern);
  }

  // Show system notification
  if (finalOptions.systemNotification && finalOptions.title) {
    showSystemNotification(finalOptions.title, {
      body: finalOptions.body,
      icon: '/pwa-192x192.svg',
      badge: '/pwa-192x192.svg'
    });
  }
};

// Register for push notifications
export const registerPushNotifications = async (vapidPublicKey?: string) => {
  try {
    if (!('serviceWorker' in navigator)) {
      console.warn('Service workers not supported');
      return null;
    }

    if (!('PushManager' in window)) {
      console.warn('Push messaging not supported');
      return null;
    }

    const registration = await navigator.serviceWorker.ready;

    // Check if already subscribed
    let subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      // Subscribe to push notifications
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: vapidPublicKey ? urlBase64ToUint8Array(vapidPublicKey) : undefined
      });

      console.log('Push notification subscription created:', subscription);
    } else {
      console.log('Already subscribed to push notifications');
    }

    return subscription;
  } catch (error) {
    console.error('Error registering push notifications:', error);
    return null;
  }
};

// Convert VAPID key to Uint8Array
function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

// Send subscription to server
export const sendSubscriptionToServer = async (subscription: PushSubscription, userId: string) => {
  try {
    // This would typically send the subscription to your backend
    // For now, we'll just log it
    console.log('Subscription to send to server:', {
      userId,
      endpoint: subscription.endpoint,
      keys: {
        p256dh: arrayBufferToBase64(subscription.getKey('p256dh')!),
        auth: arrayBufferToBase64(subscription.getKey('auth')!)
      }
    });

    // TODO: Send to your backend API
    // await fetch('/api/push-subscription', {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify({
    //     userId,
    //     subscription: {
    //       endpoint: subscription.endpoint,
    //       keys: {
    //         p256dh: arrayBufferToBase64(subscription.getKey('p256dh')!),
    //         auth: arrayBufferToBase64(subscription.getKey('auth')!)
    //       }
    //     }
    //   })
    // });

  } catch (error) {
    console.error('Error sending subscription to server:', error);
  }
};

// Helper function to convert ArrayBuffer to base64
function arrayBufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

// Screen Wake Lock management
let wakeLock: WakeLockSentinel | null = null;

export const requestWakeLock = async (): Promise<boolean> => {
  try {
    if (!('wakeLock' in navigator)) {
      console.warn('Screen Wake Lock API not supported');
      return false;
    }

    if (wakeLock) {
      console.log('Wake lock already active');
      return true;
    }

    wakeLock = await navigator.wakeLock.request('screen');
    console.log('Screen wake lock acquired');

    wakeLock.addEventListener('release', () => {
      console.log('Screen wake lock released');
      wakeLock = null;
    });

    return true;
  } catch (error) {
    console.error('Error requesting wake lock:', error);
    return false;
  }
};

export const releaseWakeLock = async (): Promise<void> => {
  if (wakeLock) {
    await wakeLock.release();
    wakeLock = null;
    console.log('Wake lock manually released');
  }
};

export const isWakeLockSupported = (): boolean => {
  return 'wakeLock' in navigator;
};

// Initialize notifications on app start
export const initializeNotifications = async (userId?: string, vapidPublicKey?: string) => {
  const permissionGranted = await requestNotificationPermission();
  if (permissionGranted) {
    console.log('Notification permissions granted');

    // Register for push notifications
    const subscription = await registerPushNotifications(vapidPublicKey);
    if (subscription && userId) {
      await sendSubscriptionToServer(subscription, userId);
    }
  } else {
    console.warn('Notification permissions not granted');
  }

  // Request wake lock to keep screen on
  const wakeLockGranted = await requestWakeLock();
  if (wakeLockGranted) {
    console.log('Screen wake lock enabled - display will stay on while app is active');
  } else {
    console.warn('Screen wake lock not available - display may turn off');
  }
};