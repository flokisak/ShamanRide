// Notification utilities for dispatcher app

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

// Show system notification (non-focus-stealing)
export const showSystemNotification = (title: string, options: NotificationOptions = {}) => {
  try {
    if (Notification.permission === 'granted') {
      const notification = new Notification(title, {
        icon: '/favicon.svg',
        badge: '/favicon.svg',
        requireInteraction: false, // Don't steal focus
        silent: true, // Don't play system sound
        ...options
      });

      // Auto-close after 3 seconds (shorter for non-intrusive)
      setTimeout(() => {
        notification.close();
      }, 3000);

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
  focusStealing?: boolean;
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
        title: 'Nová jízda od řidiče!',
        body: 'Řidič přidal novou jízdu - zkontrolujte a přiřaďte'
      };
      break;
    case 'message':
      options = {
        ...defaults,
        vibrationPattern: [100, 50, 100], // Short buzzes for messages
        title: 'Nová zpráva od řidiče',
        body: 'Máte novou zprávu v chatu'
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

  // Play sound (softer for non-focus-stealing notifications)
  if (finalOptions.sound) {
    if (finalOptions.focusStealing === false) {
      // Softer sound for non-focus-stealing notifications
      if (type === 'ride') {
        playNotificationSound(800, 0.15);
      } else if (type === 'message') {
        playNotificationSound(500, 0.1);
      } else {
        playNotificationSound(600, 0.1);
      }
    } else {
      // Normal sound for focus-stealing notifications
      if (type === 'ride') {
        playNotificationSound(1000, 0.3);
      } else if (type === 'message') {
        playNotificationSound(600, 0.2);
      } else {
        playNotificationSound(800, 0.2);
      }
    }
  }

  // Vibrate
  if (finalOptions.vibration) {
    vibrateDevice(finalOptions.vibrationPattern);
  }

  // Show system notification (only if not disabled for focus stealing)
  if (finalOptions.systemNotification && finalOptions.title && !finalOptions.focusStealing) {
    showSystemNotification(finalOptions.title, {
      body: finalOptions.body,
      icon: '/favicon.svg',
      badge: '/favicon.svg'
    });
  }
};

// Initialize notifications on app start
export const initializeNotifications = async () => {
  const permissionGranted = await requestNotificationPermission();
  if (permissionGranted) {
    console.log('Notification permissions granted for dispatcher app');
  } else {
    console.warn('Notification permissions not granted for dispatcher app');
  }
};