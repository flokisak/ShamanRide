// Enhanced notification utilities optimized for Chrome Android PWA

// Detect Android Chrome specifically
const isAndroidChrome = (): boolean => {
  const ua = navigator.userAgent;
  return /Android/i.test(ua) && /Chrome/i.test(ua) && !/Edg/i.test(ua);
};

// Request notification permissions with Android Chrome optimizations
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

    // On Android Chrome, we need to ensure we're in a user gesture context
    if (isAndroidChrome()) {
      console.log('Android Chrome detected - requesting notification permission');

      // Add a small delay to ensure user gesture context
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    const permission = await Notification.requestPermission();

    if (isAndroidChrome() && permission === 'default') {
      console.warn('Android Chrome: Permission request was dismissed, will try again on next user interaction');
      return false;
    }

    return permission === 'granted';
  } catch (error) {
    console.error('Error requesting notification permission:', error);
    return false;
  }
};

// Show system notification optimized for Android Chrome
export const showSystemNotification = (title: string, options: NotificationOptions = {}) => {
  try {
    if (Notification.permission === 'granted') {
      // Android Chrome specific notification options
      const androidOptions: NotificationOptions = {
        icon: '/android-launchericon-192-192.png', // Use PNG for better Android compatibility
        badge: '/android-launchericon-96-96.png',
        requireInteraction: false,
        silent: false, // Let system handle sound to avoid conflicts
        ...options
      };

      // On Android Chrome, ensure proper notification behavior
      if (isAndroidChrome()) {
        // Android Chrome works better with these settings
        androidOptions.requireInteraction = options.requireInteraction || false;
        androidOptions.silent = true; // Disable system sound to avoid conflicts with our custom sound
        androidOptions.tag = options.tag || `notification-${Date.now()}`;

        console.log('Android Chrome notification:', title, androidOptions);
      }

      const notification = new Notification(title, androidOptions);

      // Auto-close timing optimized for Android Chrome
      const autoCloseDelay = isAndroidChrome() ? 8000 : 5000; // Longer on Android for better visibility
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

// Initialize audio context with Android Chrome optimizations
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

    // On Android Chrome, create context with specific options for better compatibility
    if (isAndroidChrome()) {
      try {
        // Try with latency hint for better mobile performance
        globalAudioContext = new AudioContextClass({
          latencyHint: 'interactive',
          sampleRate: 44100 // Standard sample rate for Android
        });
        console.log('Android Chrome: Audio context created with mobile optimizations');
      } catch (androidError) {
        console.warn('Android Chrome: Failed to create optimized audio context, falling back to default');
        globalAudioContext = new AudioContextClass();
      }
    } else {
      globalAudioContext = new AudioContextClass();
    }

    // Resume context immediately if suspended (critical on mobile)
    if (globalAudioContext.state === 'suspended') {
      try {
        await globalAudioContext.resume();
        console.log('Audio context resumed successfully');
      } catch (resumeError) {
        console.warn('Failed to resume audio context:', resumeError);

        // On Android Chrome, sometimes we need to wait for user interaction
        if (isAndroidChrome()) {
          console.log('Android Chrome: Will retry audio context resume on next user interaction');
          return false;
        }
      }
    }

    audioContextInitialized = true;
    return true;
  } catch (error) {
    console.error('Error initializing audio context:', error);
    return false;
  }
};

// Play notification sound optimized for Android Chrome PWA
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

    // Android Chrome specific handling
    if (isAndroidChrome()) {
      // Check if we need to resume context (very common on Android Chrome)
      if (globalAudioContext.state === 'suspended') {
        try {
          await globalAudioContext.resume();
          console.log('Android Chrome: Audio context resumed for notification');
        } catch (resumeError) {
          console.warn('Android Chrome: Could not resume audio context, will retry on next user interaction');
          // Don't play sound now, wait for user interaction
          if ('vibrate' in navigator) {
            navigator.vibrate([200, 100, 200]);
          }
          return;
        }
      }

      // On Android Chrome, sometimes the context becomes suspended even after resume
      // Add a small delay to ensure it's stable
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    // Ensure context is still running
    if (globalAudioContext.state !== 'running') {
      console.warn('Audio context not in running state:', globalAudioContext.state);
      if ('vibrate' in navigator) {
        navigator.vibrate([200, 100, 200]);
      }
      return;
    }

    // Create and play sound with Android Chrome optimizations
    const playSound = () => {
      try {
        // Create oscillator for beep sound
        const oscillator = globalAudioContext!.createOscillator();
        const gainNode = globalAudioContext!.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(globalAudioContext!.destination);

        // Configure beep sound
        oscillator.frequency.setValueAtTime(frequency, globalAudioContext!.currentTime);
        oscillator.type = 'sine';

        // Android Chrome specific volume adjustments
        let baseVolume = document.hidden ? 0.7 : 0.5; // Louder for background on Android

        if (isAndroidChrome()) {
          // Android Chrome often needs higher volume
          baseVolume = Math.min(baseVolume * 1.8, 0.9);
          // Use square wave for better audibility on Android speakers
          oscillator.type = 'square';
        }

        const volume = Math.min(baseVolume, 0.9); // Cap at 90% to avoid distortion

        gainNode.gain.setValueAtTime(volume, globalAudioContext!.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, globalAudioContext!.currentTime + duration);

        oscillator.start(globalAudioContext!.currentTime);
        oscillator.stop(globalAudioContext!.currentTime + duration);

        // Clean up after sound ends
        setTimeout(() => {
          try {
            oscillator.disconnect();
            gainNode.disconnect();
          } catch (cleanupError) {
            // Ignore cleanup errors
          }
        }, (duration + 0.1) * 1000);

        console.log(`Android Chrome notification sound: ${frequency}Hz, ${duration}s, volume: ${volume}, type: ${oscillator.type}`);
      } catch (error) {
        console.error('Error creating sound:', error);
        // Fallback to vibration
        if ('vibrate' in navigator) {
          navigator.vibrate([200, 100, 200, 100, 200]);
        }
      }
    };

    // Play the sound
    playSound();

    // On Android Chrome, add extra attempts for background playback
    if (document.hidden && isAndroidChrome()) {
      setTimeout(() => {
        if (globalAudioContext?.state === 'running') {
          playSound();
        }
      }, 300);
    }

  } catch (error) {
    console.error('Error in playNotificationSound:', error);
    // Final fallback to vibration
    if ('vibrate' in navigator) {
      navigator.vibrate([200, 100, 200, 100, 200, 100, 200]);
    }
  }
};

// Vibrate device with Android Chrome optimizations
export const vibrateDevice = (pattern: number | number[] = [200, 100, 200]) => {
  try {
    if (!('vibrate' in navigator)) {
      console.warn('Vibration API not supported');
      return;
    }

    // Android Chrome specific vibration handling
    if (isAndroidChrome()) {
      // Android Chrome has limitations on vibration patterns
      // Convert complex patterns to simpler ones that work reliably
      let androidPattern: number[];

      if (Array.isArray(pattern)) {
        if (pattern.length > 6) {
          // Simplify long patterns for Android Chrome
          androidPattern = [300, 150, 300, 150, 300];
        } else {
          androidPattern = pattern;
        }
      } else {
        // Single number - create a simple pattern
        androidPattern = [pattern, 100, pattern];
      }

      // Ensure pattern doesn't exceed Android Chrome limits
      const totalDuration = androidPattern.reduce((sum, duration) => sum + duration, 0);
      if (totalDuration > 10000) { // 10 second limit
        androidPattern = [300, 150, 300, 150, 300];
      }

      navigator.vibrate(androidPattern);
      console.log('Android Chrome vibration:', androidPattern);
    } else {
      // Standard vibration for other browsers
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

// Enhanced notification function optimized for Android Chrome PWA
export const notifyUser = async (type: 'ride' | 'message' | 'general' = 'general', customOptions?: {
  sound?: boolean;
  vibration?: boolean;
  systemNotification?: boolean;
  title?: string;
  body?: string;
}): Promise<void> => {
  const settings = getNotificationSettings();

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
        vibrationPattern: isAndroidChrome() ? [400, 200, 400, 200, 400] : [300, 100, 300, 100, 300], // Stronger vibration for Android
        title: 'Nová jízda!',
        body: 'Byla vám přiřazena nová jízda'
      };
      break;
    case 'message':
      options = {
        ...defaults,
        vibrationPattern: isAndroidChrome() ? [150, 100, 150] : [100, 50, 100], // Clearer pattern for Android
        title: 'Nová zpráva',
        body: 'Máte novou zprávu od dispečera'
      };
      break;
    default:
      options = {
        ...defaults,
        vibrationPattern: isAndroidChrome() ? [250, 150, 250] : [200, 100, 200],
        title: 'Upozornění',
        body: 'Máte nové upozornění'
      };
  }

  const finalOptions = { ...options, ...customOptions };

  // Android Chrome specific notification handling
  if (isAndroidChrome()) {
    console.log(`Android Chrome notification: ${type}`, finalOptions);
  }

  // Play sound with Android Chrome optimizations
  if (finalOptions.sound) {
    const playSound = async () => {
      try {
        if (type === 'ride') {
          // Different sound for rides (higher pitch, longer for Android)
          await playNotificationSound(isAndroidChrome() ? 1200 : 1000, isAndroidChrome() ? 0.6 : 0.5);
        } else if (type === 'message') {
          // Different sound for messages (lower pitch, clearer for Android)
          await playNotificationSound(isAndroidChrome() ? 700 : 600, isAndroidChrome() ? 0.4 : 0.3);
        } else {
          await playNotificationSound(isAndroidChrome() ? 900 : 800, isAndroidChrome() ? 0.4 : 0.3);
        }
      } catch (error) {
        console.error('Error playing notification sound:', error);
      }
    };

    // Play sound immediately and await it
    await playSound();

    // On Android Chrome, add extra sound attempts for reliability
    if (isAndroidChrome() && document.hidden) {
      setTimeout(() => playSound(), 500);
    }
  }

  // Vibrate with Android optimizations
  if (finalOptions.vibration) {
    vibrateDevice(finalOptions.vibrationPattern);
  }

  // Show system notification with Android Chrome optimizations
  if (finalOptions.systemNotification && finalOptions.title) {
    const notificationOptions = {
      body: finalOptions.body,
      icon: isAndroidChrome() ? '/android-launchericon-192-192.png' : '/pwa-192x192.svg',
      badge: isAndroidChrome() ? '/android-launchericon-96-96.png' : '/pwa-192x192.svg',
      requireInteraction: type === 'ride', // Keep ride notifications visible until clicked
      silent: isAndroidChrome() ? true : false, // Android Chrome handles sound better when silent=true
      tag: type === 'ride' ? 'new-ride' : `notification-${Date.now()}`, // Group ride notifications
    };

    showSystemNotification(finalOptions.title, notificationOptions);
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

// Screen Wake Lock management optimized for Android Chrome
let wakeLock: WakeLockSentinel | null = null;
let wakeLockRetryCount = 0;
const MAX_WAKE_LOCK_RETRIES = 3;

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

    // Android Chrome specific wake lock handling
    if (isAndroidChrome()) {
      console.log('Android Chrome: Requesting wake lock with mobile optimizations');

      // On Android Chrome, wake locks can be unreliable, so we add retry logic
      let attempts = 0;
      while (attempts < MAX_WAKE_LOCK_RETRIES) {
        try {
          wakeLock = await navigator.wakeLock.request('screen');
          console.log('Android Chrome: Screen wake lock acquired on attempt', attempts + 1);

          wakeLock.addEventListener('release', () => {
            console.log('Android Chrome: Screen wake lock released');
            wakeLock = null;
            wakeLockRetryCount = 0;
          });

          wakeLockRetryCount = 0;
          return true;
        } catch (error) {
          attempts++;
          console.warn(`Android Chrome: Wake lock attempt ${attempts} failed:`, error);

          if (attempts < MAX_WAKE_LOCK_RETRIES) {
            // Wait before retrying
            await new Promise(resolve => setTimeout(resolve, 1000 * attempts));
          }
        }
      }

      console.error('Android Chrome: Failed to acquire wake lock after all retries');
      return false;
    } else {
      // Standard wake lock for other browsers
      wakeLock = await navigator.wakeLock.request('screen');
      console.log('Screen wake lock acquired');

      wakeLock.addEventListener('release', () => {
        console.log('Screen wake lock released');
        wakeLock = null;
      });

      return true;
    }
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

// Initialize notifications optimized for Android Chrome PWA
export const initializeNotifications = async (userId?: string, vapidPublicKey?: string) => {
  if (isAndroidChrome()) {
    console.log('Android Chrome PWA detected - initializing with mobile optimizations');
  }

  // Initialize audio context early for better mobile support
  const audioInitialized = await initializeAudioContext();
  if (audioInitialized) {
    console.log('Audio context initialized for notifications');
  } else {
    console.warn('Audio context initialization failed - will retry on user interaction');
  }

  // On Android Chrome, we need to be more careful with permission requests
  if (isAndroidChrome()) {
    // Delay permission request slightly to ensure proper context
    setTimeout(async () => {
      const permissionGranted = await requestNotificationPermission();
      if (permissionGranted) {
        console.log('Android Chrome: Notification permissions granted');

        // Register for push notifications with Android-specific handling
        const subscription = await registerPushNotifications(vapidPublicKey);
        if (subscription && userId) {
          await sendSubscriptionToServer(subscription, userId);
        }
      } else {
        console.warn('Android Chrome: Notification permissions not granted');
      }
    }, 200);
  } else {
    // Standard initialization for other browsers
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
  }

  // Request wake lock with Android Chrome optimizations
  const wakeLockGranted = await requestWakeLock();
  if (wakeLockGranted) {
    console.log('Screen wake lock enabled - display will stay on while app is active');
  } else {
    console.warn('Screen wake lock not available - display may turn off');
  }

  // Android Chrome specific: Set up visibility change listener for audio context management
  if (isAndroidChrome()) {
    document.addEventListener('visibilitychange', async () => {
      if (!document.hidden && globalAudioContext?.state === 'suspended') {
        try {
          await globalAudioContext.resume();
          console.log('Android Chrome: Audio context resumed on visibility change');
        } catch (error) {
          console.warn('Android Chrome: Failed to resume audio context on visibility change');
        }
      }
    });
  }
};