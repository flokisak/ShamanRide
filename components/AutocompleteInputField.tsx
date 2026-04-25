import React, { useState, useEffect, useRef, useCallback } from 'react';
import { getAddressSuggestions } from '../services/dispatchService';
import { getPOIAutocomplete, POIResult } from '../services/poiService';
import { useTranslation } from '../contexts/LanguageContext';

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
}> = ({ id, value, onChange, suggestionMode, localSuggestions = [], error, hint, placeholder, isFirst, poiTypes, userLocation, onSelectPlaceId }) => {
  const { language } = useTranslation();
  const [suggestions, setSuggestions] = useState<{text: string, placeId?: string}[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const debounceTimeout = useRef<number | null>(null);

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
    if (query.trim().length < 3) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    const results = await getAddressSuggestions(query, language);
    setSuggestions(results);
    setShowSuggestions(results.length > 0);
  }, [language]);

  const fetchPOISuggestions = useCallback(async (query: string) => {
    if (query.trim().length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    try {
      const results = await getPOIAutocomplete(
        query,
        userLocation,
        10000, // 10km radius
        poiTypes,
        language
      );

      const suggestions = results.map(result => ({
        text: result.text,
        placeId: result.placeId
      }));

      setSuggestions(suggestions);
      setShowSuggestions(suggestions.length > 0);
    } catch (error) {
      console.error('Error fetching POI suggestions:', error);
      setSuggestions([]);
      setShowSuggestions(false);
    }
  }, [userLocation, poiTypes, language]);

  const debouncedFetch = useCallback((query: string) => {
    if (debounceTimeout.current) {
      clearTimeout(debounceTimeout.current);
    }
    debounceTimeout.current = window.setTimeout(() => {
      fetchRemoteSuggestions(query);
    }, 400); // 400ms debounce delay
  }, [fetchRemoteSuggestions]);

  const debouncedPOIFetch = useCallback((query: string) => {
    if (debounceTimeout.current) {
      clearTimeout(debounceTimeout.current);
    }
    debounceTimeout.current = window.setTimeout(() => {
      fetchPOISuggestions(query);
    }, 300); // 300ms debounce for POI (faster response)
  }, [fetchPOISuggestions]);

  const filterLocalSuggestions = useCallback((userInput: string) => {
    if (!userInput) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    const filtered = localSuggestions.filter(
      suggestion => suggestion.toLowerCase().includes(userInput.toLowerCase())
    ).map(suggestion => ({ text: suggestion }));
    setSuggestions(prev => {
      // Only update if suggestions actually changed
      if (prev.length !== filtered.length || !prev.every((s, i) => s.text === filtered[i].text)) {
        return filtered;
      }
      return prev;
    });
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
      debouncedPOIFetch(userInput);
    } else {
      filterLocalSuggestions(userInput);
    }
  }, [onChange, suggestionMode, debouncedFetch, debouncedPOIFetch, filterLocalSuggestions]);

  const onSuggestionClick = useCallback((suggestion: {text: string, placeId?: string}) => {
    // Set only the human-readable address into the input value.
    onChange(suggestion.text);
    // Surface the placeId separately so callers can use it for geocoding without polluting the visible value.
  try { onSelectPlaceId && onSelectPlaceId(suggestion.placeId); } catch (err) { /* noop */ }
    setShowSuggestions(false);
    setSuggestions([]);
  }, [onChange, onSelectPlaceId]);
  
  const onFocus = useCallback(() => {
    // Don't show suggestions on focus for local mode to prevent focus loss
    if (suggestionMode === 'remote' && value) {
      debouncedFetch(value);
    } else if (suggestionMode === 'poi' && value) {
      debouncedPOIFetch(value);
    }
  }, [suggestionMode, value, debouncedFetch, debouncedPOIFetch]);
  
  return (
    <div className="relative flex-grow" ref={wrapperRef}>
      <label htmlFor={id} className="sr-only">{isFirst ? 'Pickup' : 'Destination'}</label>
      <input
        type="text"
        id={id}
        name={id}
        value={value}
        onChange={handleChange}
        onFocus={onFocus}
        className={`w-full bg-slate-700 border ${error ? 'border-red-500' : 'border-slate-600'} rounded-md shadow-sm py-2 px-3 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500`}
        autoComplete="off"
        placeholder={placeholder}
      />
      {hint && !error && <p className="mt-1 text-xs text-gray-500">{hint}</p>}
      {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
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
                {suggestionMode === 'poi' && (
                  <div className="text-xs text-gray-400 mt-0.5">📍 Point of Interest</div>
                )}
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
