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

// Initialize notifications on app start
export const initializeNotifications = async () => {
  const permissionGranted = await requestNotificationPermission();
  if (permissionGranted) {
    console.log('Notification permissions granted');
  } else {
    console.warn('Notification permissions not granted');
  }
};