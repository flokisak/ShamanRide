import React, { useState, useEffect, useRef, useCallback } from 'react';
import { getAddressSuggestions } from '../services/dispatchService';
import { useTranslation } from '../contexts/LanguageContext';

export const AutocompleteInputField: React.FC<{
  id: string;
  value: string;
  onChange: (value: string) => void;
  suggestionMode: 'local' | 'remote';
  localSuggestions?: string[];
  error?: string;
  hint?: string;
  placeholder?: string;
  isFirst?: boolean;
}> = ({ id, value, onChange, suggestionMode, localSuggestions = [], error, hint, placeholder, isFirst }) => {
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

  const debouncedFetch = useCallback((query: string) => {
    if (debounceTimeout.current) {
      clearTimeout(debounceTimeout.current);
    }
    debounceTimeout.current = window.setTimeout(() => {
      fetchRemoteSuggestions(query);
    }, 400); // 400ms debounce delay
  }, [fetchRemoteSuggestions]);

  const filterLocalSuggestions = useCallback((userInput: string) => {
    if (!userInput) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    const filtered = localSuggestions.filter(
      suggestion => suggestion.toLowerCase().includes(userInput.toLowerCase())
    );
    setSuggestions(prev => {
      // Only update if suggestions actually changed
      if (prev.length !== filtered.length || !prev.every((s, i) => s === filtered[i])) {
        return filtered;
      }
      return prev;
    });
    setShowSuggestions(filtered.length > 0);
  }, [localSuggestions]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const userInput = e.target.value;
    onChange(userInput);

    if (suggestionMode === 'remote') {
      debouncedFetch(userInput);
    } else {
      filterLocalSuggestions(userInput);
    }
  }, [onChange, suggestionMode, debouncedFetch, filterLocalSuggestions]);

  const onSuggestionClick = useCallback((suggestion: {text: string, placeId?: string}) => {
    const value = suggestion.placeId ? `${suggestion.text}|${suggestion.placeId}` : suggestion.text;
    onChange(value);
    setShowSuggestions(false);
    setSuggestions([]);
  }, [onChange]);
  
  const onFocus = useCallback(() => {
    // Don't show suggestions on focus for local mode to prevent focus loss
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
              className="px-3 py-2 text-sm text-gray-200 cursor-pointer hover:bg-slate-700"
            >
              {suggestion.text}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
