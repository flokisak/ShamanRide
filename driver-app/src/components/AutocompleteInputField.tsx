import React, { useCallback, useState, useEffect, useRef } from 'react';
import { useVoiceRecognition } from '../utils/useVoiceRecognition';
import { useTranslation } from '../contexts/LanguageContext';
import { MicrophoneIcon } from '../icons';

export type SuggestionMode = 'local' | 'remote' | 'poi';

export const AutocompleteInputField: React.FC<{
  id: string;
  value: string;
  onChange: (value: string) => void;
  /** Optional callback to receive a placeId when a suggestion with a placeId is selected. If user types manually, this will be called with undefined. */
  onSelectPlaceId?: (placeId?: string) => void;
  suggestionMode: SuggestionMode;
  localSuggestions?: string[];
  error?: string;
  hint?: string;
  placeholder?: string;
  isFirst?: boolean;
  poiTypes?: string[];
  userLocation?: { lat: number; lng: number };
  enableVoiceInput?: boolean;
}> = ({ id, value, onChange, suggestionMode, localSuggestions = [], error, hint, placeholder, isFirst, poiTypes, userLocation, onSelectPlaceId, enableVoiceInput = true }) => {
  const [suggestions, setSuggestions] = useState<{ text: string; placeId?: string }[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const debounceTimeout = useRef<number | null>(null);
  const { t } = useTranslation();

  // Voice recognition
  const handleVoiceResult = useCallback((transcript: string) => {
    onChange(transcript);
    // Clear any previously selected placeId since this is voice input
    try { onSelectPlaceId && onSelectPlaceId(undefined); } catch (err) { /* noop */ }
    // Trigger suggestions for the voice input
    if (suggestionMode === 'remote') {
      debouncedFetch(transcript);
    } else if (suggestionMode === 'poi') {
      debouncedFetch(transcript);
    } else {
      filterLocalSuggestions(transcript);
    }
  }, [onChange, onSelectPlaceId, suggestionMode]);

  const handleVoiceError = useCallback((error: string) => {
    console.warn('Voice recognition error:', error);
    // Could show a toast notification here if needed
  }, []);

  const {
    isListening,
    isSupported,
    error: voiceError,
    startListening,
    stopListening,
    resetError: resetVoiceError
  } = useVoiceRecognition(handleVoiceResult, handleVoiceError, 'cs-CZ');

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchRemoteSuggestions = useCallback(async (query: string) => {
    if (!query || query.trim().length < 3) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    try {
      // Use Nominatim directly (no CORS issues with OSM)
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&addressdetails=0&limit=6`;
      const res = await fetch(url);
      if (!res.ok) {
        setSuggestions([]);
        setShowSuggestions(false);
        return;
      }
      const data = await res.json();
      const mapped = (data || []).map((item: any) => ({ text: item.display_name, placeId: String(item.place_id) }));
      setSuggestions(mapped);
      setShowSuggestions(mapped.length > 0);
    } catch (err) {
      console.error('Autocomplete fetch error:', err);
      setSuggestions([]);
      setShowSuggestions(false);
    }
  }, []);

  const debouncedFetch = useCallback((query: string) => {
    if (debounceTimeout.current) clearTimeout(debounceTimeout.current);
    debounceTimeout.current = window.setTimeout(() => {
      fetchRemoteSuggestions(query);
    }, 300) as unknown as number;
  }, [fetchRemoteSuggestions]);

  const filterLocalSuggestions = useCallback((userInput: string) => {
    if (!userInput) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    const filtered = localSuggestions.filter(s => s.toLowerCase().includes(userInput.toLowerCase()));
    setSuggestions(filtered.map(s => ({ text: s })));
    setShowSuggestions(filtered.length > 0);
  }, [localSuggestions]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const userInput = e.target.value;
    onChange(userInput);
    // User typed manually, clear any previously selected placeId
    try { onSelectPlaceId && onSelectPlaceId(undefined); } catch (err) { /* noop */ }

    if (suggestionMode === 'remote') {
      debouncedFetch(userInput);
    } else if (suggestionMode === 'poi') {
      // POI suggestions not implemented in driver-app minimal version; fall back to remote
      debouncedFetch(userInput);
    } else {
      filterLocalSuggestions(userInput);
    }
  }, [onChange, suggestionMode, debouncedFetch, filterLocalSuggestions, onSelectPlaceId]);

  const onSuggestionClick = useCallback((suggestion: { text: string; placeId?: string }) => {
    onChange(suggestion.text);
    try { onSelectPlaceId && onSelectPlaceId(suggestion.placeId); } catch (err) { /* noop */ }
    setShowSuggestions(false);
    setSuggestions([]);
  }, [onChange, onSelectPlaceId]);

  const onFocus = useCallback(() => {
    if (suggestionMode === 'remote' && value) {
      debouncedFetch(value);
    }
  }, [suggestionMode, value, debouncedFetch]);

  return (
    <div className="relative flex-grow" ref={wrapperRef}>
      <label htmlFor={id} className="sr-only">{isFirst ? 'Pickup' : 'Destination'}</label>
      <div className="relative">
        <input
          type="text"
          id={id}
          name={id}
          value={value}
          onChange={handleChange}
          onFocus={onFocus}
          className={`w-full bg-slate-700 border ${error ? 'border-red-500' : 'border-slate-600'} rounded-md shadow-sm py-2 px-3 pr-10 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500`}
          autoComplete="off"
          placeholder={placeholder}
        />
        {enableVoiceInput && isSupported && (
          <button
            type="button"
            onClick={isListening ? stopListening : startListening}
            className={`absolute right-2 top-1/2 transform -translate-y-1/2 p-1 rounded-md transition-colors ${
              isListening
                ? 'text-red-400 animate-pulse'
                : voiceError
                ? 'text-red-400 hover:text-red-300'
                : 'text-gray-400 hover:text-cyan-400'
            }`}
            title={isListening ? t('voice.stopListening') : t('voice.startListening')}
            aria-label={isListening ? t('voice.stopListening') : t('voice.startListening')}
          >
            <MicrophoneIcon size={16} />
          </button>
        )}
      </div>
      {hint && !error && !voiceError && <p className="mt-1 text-xs text-gray-500">{hint}</p>}
      {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
      {voiceError && <p className="mt-1 text-xs text-red-400">{voiceError}</p>}
      {isListening && (
        <p className="mt-1 text-xs text-cyan-400 animate-pulse">
          {t('voice.listening')}...
        </p>
      )}
      {showSuggestions && suggestions.length > 0 && (
        <ul className="absolute z-10 w-full bg-slate-800 border border-slate-600 rounded-md mt-1 max-h-40 overflow-y-auto shadow-lg">
          {suggestions.map((suggestion, index) => (
            <li
              key={index}
              onClick={() => onSuggestionClick(suggestion)}
              className="px-3 py-2 text-sm text-gray-200 cursor-pointer hover:bg-slate-700 flex items-center justify-between"
            >
              <div className="flex-1">
                <div className="font-medium">{suggestion.text}</div>
                {/* no extra subtitle here */}
              </div>
              {suggestion.placeId && (
                <div className="text-xs text-cyan-400 ml-2">✓</div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
