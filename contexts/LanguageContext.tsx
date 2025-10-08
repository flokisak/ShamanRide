import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import { LoadingSpinner } from '../components/LoadingSpinner';
import csTranslations from '../locales/cs.json';
import enTranslations from '../locales/en.json';
import deTranslations from '../locales/de.json';

// Define the shape of the context
interface LanguageContextType {
  language: string;
  changeLanguage: (lang: string) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}

// Create the context with a default value
const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

// Define available languages
const availableLanguages = ['cs', 'en', 'de'];

// Static translations object
const staticTranslations = {
  cs: csTranslations,
  en: enTranslations,
  de: deTranslations,
};

// Provider component that wraps the app
export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguage] = useState<string>(() => {
    const savedLang = localStorage.getItem('app-language');
    return savedLang && availableLanguages.includes(savedLang) ? savedLang : 'cs';
  });

  const [translations, setTranslations] = useState<Record<string, any>>({});
  const [isLoading, setIsLoading] = useState(true);

  // Fix: Define the changeLanguage function that was missing.
  const changeLanguage = useCallback((lang: string) => {
    if (availableLanguages.includes(lang)) {
      setLanguage(lang);
      localStorage.setItem('app-language', lang);
    }
  }, []);

  useEffect(() => {
    setIsLoading(true);
    try {
      const translations = staticTranslations[language as keyof typeof staticTranslations] || staticTranslations.en;
      setTranslations(translations);
    } catch (error) {
      console.error('Failed to load translations:', error);
      setTranslations(staticTranslations.en); // Fallback to English
    } finally {
      setIsLoading(false);
    }
  }, [language]);

  const t = useCallback((key: string, params?: Record<string, string | number>): string => {
    const keys = key.split('.');
    let result = keys.reduce((acc, currentKey) => {
      return acc && acc[currentKey] !== undefined ? acc[currentKey] : undefined;
    }, translations);

    if (result === undefined) {
      console.warn(`Translation key not found: "${key}"`);
      return key; // Return the key itself as a fallback
    }

    if (params && typeof result === 'string') {
      Object.keys(params).forEach(paramKey => {
        result = result.replace(`{${paramKey}}`, String(params[paramKey]));
      });
    }

    return result;
  }, [translations]);
  
  if (isLoading) {
      return (
          <div className="flex items-center justify-center h-screen w-screen bg-slate-900">
              <LoadingSpinner text="Loading application..." />
          </div>
      );
  }

  return (
    <LanguageContext.Provider value={{ language, changeLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

// Custom hook to use the language context
export const useTranslation = (): LanguageContextType => {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useTranslation must be used within a LanguageProvider');
  }
  return context;
};
