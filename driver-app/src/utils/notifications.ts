// Enhanced notification utilities optimized for Native Android APK

// Detect Android platform
const isAndroid = (): boolean => {
  return /Android/i.test(navigator.userAgent);
};

// Request notification permissions for native Android
export const requestNotificationPermission = async (): Promise<boolean> => {
  try {
    if (!('Notification' in window)) {
      console.warn('This platform does not support notifications');
      return false;
    }

    if (Notification.permission === 'granted') {
      return true;
    }

    if (Notification.permission === 'denied') {
      console.warn('Notification permission was denied');
      return false;
    }

    // For native Android, request permission directly
    const permission = await Notification.requestPermission();
    return permission === 'granted';
  } catch (error) {
    console.error('Error requesting notification permission:', error);
    return false;
  }
};

// Show system notification optimized for native Android
export const showSystemNotification = (title: string, options: NotificationOptions = {}) => {
  try {
    if (Notification.permission === 'granted') {
      // Native Android notification options
      const androidOptions: NotificationOptions = {
        icon: '/android-launchericon-192-192.png',
        badge: '/android-launchericon-96-96.png',
        requireInteraction: false,
        silent: false, // Let system handle sound for native Android
        ...options
      };

      // For native Android, use system sounds and optimize for mobile
      if (isAndroid()) {
        androidOptions.requireInteraction = options.requireInteraction || false;
        androidOptions.silent = false; // Enable system sound for better reliability
        androidOptions.tag = options.tag || `notification-${Date.now()}`;

        console.log('Native Android notification:', title, androidOptions);
      }

      const notification = new Notification(title, androidOptions);

      // Auto-close timing for native Android
      const autoCloseDelay = 6000; // Standard timing for mobile notifications
      setTimeout(() => {
        try {
          notification.close();
        } catch (closeError) {
          // Ignore close errors
        }
      }, autoCloseDelay);

      return notification;
    }
  } catch (error) {
    console.error('Error showing system notification:', error);
  }
  return null;
};

// Global audio context optimized for Android Chrome
let globalAudioContext: AudioContext | null = null;
let audioContextInitialized = false;

// Initialize audio context for native Android
export const initializeAudioContext = async (): Promise<boolean> => {
  try {
    if (!window.AudioContext && !(window as any).webkitAudioContext) {
      console.warn('Web Audio API not supported');
      return false;
    }

    if (audioContextInitialized && globalAudioContext) {
      return true;
    }

    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;

    // For native Android, create context with standard settings
    globalAudioContext = new AudioContextClass({
      latencyHint: 'interactive',
      sampleRate: 44100
    });

    // Resume context immediately if suspended
    if (globalAudioContext.state === 'suspended') {
      try {
        await globalAudioContext.resume();
        console.log('Audio context resumed successfully');
      } catch (resumeError) {
        console.warn('Failed to resume audio context:', resumeError);
        return false;
      }
    }

    audioContextInitialized = true;
    return true;
  } catch (error) {
    console.error('Error initializing audio context:', error);
    return false;
  }
};

// Play notification sound optimized for native Android
export const playNotificationSound = async (frequency: number = 800, duration: number = 0.2): Promise<void> => {
  try {
    // Initialize audio context if needed
    if (!globalAudioContext || !audioContextInitialized) {
      const initialized = await initializeAudioContext();
      if (!initialized) {
        // Fallback to vibration
        if ('vibrate' in navigator) {
          navigator.vibrate([100, 50, 100]);
        }
        return;
      }
    }

    if (!globalAudioContext) {
      throw new Error('Audio context not available');
    }

    // Ensure context is running with user interaction fallback
    if (globalAudioContext.state === 'suspended') {
      try {
        await globalAudioContext.resume();
        console.log('Audio context resumed for notification');
      } catch (resumeError) {
        console.warn('Could not resume audio context:', resumeError);
        // Try to create a new context
        try {
          const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
          globalAudioContext = new AudioContextClass();
          audioContextInitialized = true;
          await globalAudioContext.resume();
        } catch (contextError) {
          console.warn('Failed to create new audio context:', contextError);
          if ('vibrate' in navigator) {
            navigator.vibrate([200, 100, 200]);
          }
          return;
        }
      }
    }

    // Final check if context is running
    if (globalAudioContext.state !== 'running') {
      console.warn('Audio context not in running state:', globalAudioContext.state);
      if ('vibrate' in navigator) {
        navigator.vibrate([200, 100, 200]);
      }
      return;
    }

    // Create and play sound with immediate execution
    const oscillator = globalAudioContext.createOscillator();
    const gainNode = globalAudioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(globalAudioContext.destination);

    // Configure beep sound for better mobile audibility
    oscillator.frequency.setValueAtTime(frequency, globalAudioContext.currentTime);
    oscillator.type = 'square'; // Square wave for better penetration on mobile

    // Volume settings optimized for mobile
    const baseVolume = document.hidden ? 0.8 : 0.6;
    const volume = Math.min(baseVolume, 0.9);

    gainNode.gain.setValueAtTime(volume, globalAudioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, globalAudioContext.currentTime + duration);

    oscillator.start(globalAudioContext.currentTime);
    oscillator.stop(globalAudioContext.currentTime + duration);

    // Clean up after sound ends
    setTimeout(() => {
      try {
        oscillator.disconnect();
        gainNode.disconnect();
      } catch (cleanupError) {
        // Ignore cleanup errors
      }
    }, (duration + 0.1) * 1000);

    console.log(`Notification sound played: ${frequency}Hz, ${duration}s, volume: ${volume}`);

    // For Android, add a second attempt for reliability
    if (isAndroid() && document.hidden) {
      setTimeout(() => {
        if (globalAudioContext?.state === 'running') {
          playNotificationSound(frequency * 0.8, duration * 0.8); // Slightly different pitch
        }
      }, 150);
    }

  } catch (error) {
    console.error('Error in playNotificationSound:', error);
    // Final fallback to vibration
    if ('vibrate' in navigator) {
      navigator.vibrate([200, 100, 200, 100, 200]);
    }
  }
};

// Vibrate device for native Android
export const vibrateDevice = (pattern: number | number[] = [200, 100, 200]) => {
  try {
    if (!('vibrate' in navigator)) {
      console.warn('Vibration API not supported');
      return;
    }

    // For native Android, use vibration patterns directly
    if (isAndroid()) {
      let androidPattern: number[];

      if (Array.isArray(pattern)) {
        // Use pattern as-is for native Android (more reliable)
        androidPattern = pattern;
      } else {
        // Single number - create a simple pattern
        androidPattern = [pattern, 100, pattern];
      }

      navigator.vibrate(androidPattern);
      console.log('Native Android vibration:', androidPattern);
    } else {
      // Standard vibration for other platforms
      navigator.vibrate(pattern);
    }
  } catch (error) {
    console.error('Error vibrating device:', error);
  }
};

// Get notification settings from localStorage
const getNotificationSettings = () => {
  try {
    const saved = localStorage.getItem('notification-settings');
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (error) {
    console.warn('Error loading notification settings:', error);
  }
  return null;
};

// Enhanced notification function optimized for native Android
export const notifyUser = async (type: 'ride' | 'message' | 'general' = 'general', customOptions?: {
  sound?: boolean;
  vibration?: boolean;
  systemNotification?: boolean;
  title?: string;
  body?: string;
}): Promise<void> => {
  console.log(`🔔 notifyUser called: type=${type}, customOptions=`, customOptions);
  
  const settings = getNotificationSettings();
  console.log(`📱 Notification settings for ${type}:`, {
    sound: settings ? settings[`${type}Sound`] : true,
    vibration: settings ? settings[`${type}Vibration`] : true,
    systemNotification: settings ? settings[`${type}SystemNotification`] : true
  });

  const defaults = {
    sound: settings ? settings[`${type}Sound`] : true,
    vibration: settings ? settings[`${type}Vibration`] : true,
    systemNotification: settings ? settings[`${type}SystemNotification`] : true
  };

  let options;
  switch (type) {
    case 'ride':
      options = {
        ...defaults,
        vibrationPattern: [400, 200, 400, 200, 400], // Strong vibration for rides
        title: 'Nová jízda!',
        body: 'Byla vám přiřazena nová jízda'
      };
      break;
    case 'message':
      options = {
        ...defaults,
        vibrationPattern: [150, 100, 150], // Clear pattern for messages
        title: 'Nová zpráva',
        body: 'Máte novou zprávu od dispečera'
      };
      break;
    default:
      options = {
        ...defaults,
        vibrationPattern: [250, 150, 250],
        title: 'Upozornění',
        body: 'Máte nové upozornění'
      };
  }

  const finalOptions = { ...options, ...customOptions };
  console.log(`🔔 Final notification options for ${type}:`, finalOptions);

  // Log notification for native Android
  if (isAndroid()) {
    console.log(`🤖 Native Android notification: ${type}`, finalOptions);
  }

  // Play sound optimized for native Android
  if (finalOptions.sound) {
    console.log(`🔊 Playing notification sound for ${type}`);
    const playSound = async () => {
      try {
        if (type === 'ride') {
          // Different sound for rides (higher pitch, longer)
          await playNotificationSound(1200, 0.6);
        } else if (type === 'message') {
          // Different sound for messages (lower pitch, clearer)
          await playNotificationSound(700, 0.4);
        } else {
          await playNotificationSound(900, 0.4);
        }
        console.log(`✅ Sound played successfully for ${type}`);
      } catch (error) {
        console.error(`❌ Error playing notification sound for ${type}:`, error);
      }
    };

    // Play sound immediately and await it
    await playSound();

    // For native Android, add extra sound attempts for reliability
    if (isAndroid() && document.hidden) {
      setTimeout(() => {
        console.log(`🔄 Playing additional sound for ${type} (app in background)`);
        playSound();
      }, 300);
    }
  } else {
    console.log(`🔇 Sound disabled for ${type}`);
  }

  // Vibrate with native Android patterns
  if (finalOptions.vibration) {
    console.log(`📳 Vibrating for ${type} with pattern:`, finalOptions.vibrationPattern);
    vibrateDevice(finalOptions.vibrationPattern);
  } else {
    console.log(`📵 Vibration disabled for ${type}`);
  }

  // Show system notification optimized for native Android
  if (finalOptions.systemNotification && finalOptions.title) {
    console.log(`📱 Showing system notification for ${type}:`, finalOptions.title);
    const notificationOptions = {
      body: finalOptions.body,
      icon: '/android-launchericon-192-192.png',
      badge: '/android-launchericon-96-96.png',
      requireInteraction: type === 'ride', // Keep ride notifications visible
      silent: false, // Enable system sound for native Android
      tag: type === 'ride' ? 'new-ride' : `notification-${Date.now()}`, // Group ride notifications
    };

    const notification = showSystemNotification(finalOptions.title, notificationOptions);
    if (notification) {
      console.log(`✅ System notification shown for ${type}`);
    } else {
      console.log(`❌ Failed to show system notification for ${type}`);
    }
  } else {
    console.log(`🔕 System notification disabled for ${type}`);
  }
  
  console.log(`🔔 Notification processing completed for ${type}`);
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
    const payload = {
      vehicleNumber: userId,
      subscription: {
        endpoint: subscription.endpoint,
        expirationTime: subscription.expirationTime,
        keys: {
          p256dh: arrayBufferToBase64(subscription.getKey('p256dh')!),
          auth: arrayBufferToBase64(subscription.getKey('auth')!)
        }
      },
      userAgent: navigator.userAgent
    };

    const response = await fetch('/api/push-subscription', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Push subscription API failed: ${response.status} ${errorText}`);
    }

    console.log('Push subscription sent to server:', await response.json());

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

// Screen Wake Lock management for native Android
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

    // For native Android, request wake lock directly
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

// Initialize notifications optimized for native Android
export const initializeNotifications = async (userId?: string, vapidPublicKey?: string) => {
  if (isAndroid()) {
    console.log('Native Android detected - initializing with mobile optimizations');
  }

  // Set up user interaction listener for audio context initialization
  const setupAudioOnUserInteraction = () => {
    const initializeAudioOnInteraction = async () => {
      if (!audioContextInitialized) {
        const audioInitialized = await initializeAudioContext();
        if (audioInitialized) {
          console.log('Audio context initialized on user interaction');
        }
      }
    };

    // Set up one-time listeners for user interaction
    const events = ['click', 'touchstart', 'keydown'];
    events.forEach(event => {
      document.addEventListener(event, initializeAudioOnInteraction, { once: true });
    });
  };

  setupAudioOnUserInteraction();

  // For native Android, request permissions directly
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

  // Request wake lock for native Android
  const wakeLockGranted = await requestWakeLock();
  if (wakeLockGranted) {
    console.log('Screen wake lock enabled - display will stay on while app is active');
  } else {
    console.warn('Screen wake lock not available - display may turn off');
  }

  // Set up visibility change listener for audio context management
  document.addEventListener('visibilitychange', async () => {
    if (!document.hidden && globalAudioContext?.state === 'suspended') {
      try {
        await globalAudioContext.resume();
        console.log('Audio context resumed on visibility change');
      } catch (error) {
        console.warn('Failed to resume audio context on visibility change');
      }
    }
  });
};
