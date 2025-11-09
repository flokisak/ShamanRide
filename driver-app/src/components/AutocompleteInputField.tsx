import React, { useCallback, useState, useEffect, useRef } from 'react';

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
  const [suggestions, setSuggestions] = useState<{ text: string; placeId?: string }[]>([]);
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
    if (!query || query.trim().length < 3) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    try {
      // Use Nominatim via a simple CORS proxy to avoid browser CORS issues
      const proxy = 'https://corsproxy.io/?';
      const url = `${proxy}https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&addressdetails=0&limit=6`;
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
