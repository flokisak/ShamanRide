import { useState, useRef, useCallback } from 'react';

export interface VoiceRecognitionState {
  isListening: boolean;
  isSupported: boolean;
  hasPermission: boolean | null;
  error: string | null;
}

export interface UseVoiceRecognitionReturn extends VoiceRecognitionState {
  startListening: () => Promise<void>;
  stopListening: () => void;
  resetError: () => void;
}

declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  onstart: ((this: SpeechRecognition, ev: Event) => any) | null;
  onresult: ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => any) | null;
  onerror: ((this: SpeechRecognition, ev: SpeechRecognitionErrorEvent) => any) | null;
  onend: ((this: SpeechRecognition, ev: Event) => any) | null;
}

interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message?: string;
}

interface SpeechRecognitionResultList {
  readonly length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  readonly length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
  isFinal: boolean;
}

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

export const useVoiceRecognition = (
  onResult: (transcript: string) => void,
  onError?: (error: string) => void,
  language: string = 'cs-CZ'
): UseVoiceRecognitionReturn => {
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  // Check if Speech Recognition API is supported
  const isSupported = typeof window !== 'undefined' &&
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);

  const resetError = useCallback(() => {
    setError(null);
  }, []);

  const checkMicrophonePermission = useCallback(async (): Promise<boolean> => {
    try {
      if (!navigator.permissions) {
        // Fallback for browsers without permissions API
        return true;
      }

      const permission = await navigator.permissions.query({ name: 'microphone' as PermissionName });
      setHasPermission(permission.state === 'granted');

      if (permission.state === 'denied') {
        throw new Error('Microphone permission denied');
      }

      return permission.state === 'granted';
    } catch (err) {
      console.warn('Could not check microphone permission:', err);
      setHasPermission(false);
      return false;
    }
  }, []);

  const requestMicrophonePermission = useCallback(async (): Promise<boolean> => {
    try {
      // Try to access microphone to trigger permission request
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(track => track.stop()); // Stop immediately
      setHasPermission(true);
      return true;
    } catch (err) {
      console.error('Microphone permission request failed:', err);
      setHasPermission(false);
      return false;
    }
  }, []);

  const initializeRecognition = useCallback(() => {
    if (!isSupported) {
      const errorMsg = 'Speech recognition is not supported in this browser';
      setError(errorMsg);
      onError?.(errorMsg);
      return null;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();

    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = language;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setIsListening(true);
      setError(null);
    };

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      if (transcript && transcript.trim()) {
        onResult(transcript.trim());
      }
    };

    recognition.onerror = (event) => {
      let errorMessage = 'Speech recognition error';

      switch (event.error) {
        case 'no-speech':
          errorMessage = 'No speech detected. Please try again.';
          break;
        case 'audio-capture':
          errorMessage = 'No microphone found or microphone access denied.';
          break;
        case 'not-allowed':
          errorMessage = 'Microphone access denied. Please allow microphone access and try again.';
          setHasPermission(false);
          break;
        case 'network':
          errorMessage = 'Network error occurred during speech recognition.';
          break;
        case 'service-not-allowed':
          errorMessage = 'Speech recognition service not allowed.';
          break;
        default:
          errorMessage = `Speech recognition error: ${event.error}`;
      }

      setError(errorMessage);
      setIsListening(false);
      onError?.(errorMessage);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    return recognition;
  }, [isSupported, language, onResult, onError]);

  const startListening = useCallback(async () => {
    if (!isSupported) {
      const errorMsg = 'Speech recognition is not supported in this browser';
      setError(errorMsg);
      onError?.(errorMsg);
      return;
    }

    try {
      // Check permission first
      let permissionGranted = hasPermission;
      if (permissionGranted === null) {
        permissionGranted = await checkMicrophonePermission();
      }

      if (!permissionGranted) {
        permissionGranted = await requestMicrophonePermission();
      }

      if (!permissionGranted) {
        const errorMsg = 'Microphone access is required for voice input';
        setError(errorMsg);
        onError?.(errorMsg);
        return;
      }

      // Stop any existing recognition
      if (recognitionRef.current && isListening) {
        recognitionRef.current.stop();
      }

      // Initialize and start new recognition
      const recognition = initializeRecognition();
      if (recognition) {
        recognitionRef.current = recognition;
        recognition.start();
      }
    } catch (err) {
      const errorMsg = 'Failed to start voice recognition';
      setError(errorMsg);
      onError?.(errorMsg);
      console.error('Voice recognition start error:', err);
    }
  }, [isSupported, hasPermission, isListening, checkMicrophonePermission, requestMicrophonePermission, initializeRecognition, onError]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current && isListening) {
      recognitionRef.current.stop();
    }
    setIsListening(false);
  }, [isListening]);

  return {
    isListening,
    isSupported,
    hasPermission,
    error,
    startListening,
    stopListening,
    resetError,
  };
};