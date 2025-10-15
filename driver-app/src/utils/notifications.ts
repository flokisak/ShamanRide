// Notification utilities for sound and vibration

// Play a notification sound using Web Audio API
export const playNotificationSound = () => {
  try {
    // Check if Web Audio API is supported
    if (!window.AudioContext && !(window as any).webkitAudioContext) {
      console.warn('Web Audio API not supported');
      return;
    }

    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    const audioContext = new AudioContext();

    // Create oscillator for beep sound
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    // Configure beep sound (800Hz, 200ms duration)
    oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
    oscillator.type = 'sine';

    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);

    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.2);
  } catch (error) {
    console.error('Error playing notification sound:', error);
  }
};

// Vibrate the device
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

// Combined notification function
export const notifyUser = (options: {
  sound?: boolean;
  vibration?: boolean;
  vibrationPattern?: number | number[];
} = {}) => {
  const { sound = true, vibration = true, vibrationPattern = [200, 100, 200] } = options;

  if (sound) {
    playNotificationSound();
  }

  if (vibration) {
    vibrateDevice(vibrationPattern);
  }
};