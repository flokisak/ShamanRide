import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';

// Define the shape of the context
interface LanguageContextType {
  language: string;
  changeLanguage: (lang: string) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}

// Create the context with a default value
const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

// Define available languages
const availableLanguages = ['cs', 'en'];

// Static translations object
const staticTranslations = {
  cs: {
    "login": {
      "title": "Přihlášení řidiče",
      "email": "Email",
      "password": "Heslo",
      "confirmPassword": "Potvrdit heslo",
      "signIn": "Přihlásit se",
      "signingIn": "Přihlašování...",
      "register": "Registrovat",
      "registering": "Registrace...",
      "loginTab": "Přihlášení",
      "registerTab": "Registrace",
      "passwordMismatch": "Hesla se neshodují",
      "passwordTooShort": "Heslo musí mít alespoň 6 znaků",
      "registrationSuccess": "Registrace úspěšná! Nyní se můžete přihlásit.",
      "error": "Chyba"
    },
    "dashboard": {
      "title": "Driver Dashboard",
      "welcome": "Welcome",
      "noRides": "No active rides",
      "currentRide": "Current Ride",
      "rideDetails": "Ride Details",
      "customer": "Customer",
      "pickup": "Pickup",
      "destination": "Destination",
      "status": "Status",
      "actions": "Actions",
      "startRide": "Start Ride",
      "completeRide": "Complete Ride",
      "cancelRide": "Cancel Ride",
      "navigation": "Navigation",
      "callCustomer": "Call Customer",
      "sendSms": "Send SMS",
      "logout": "Logout",
      "available": "Available",
      "onRide": "On Ride",
      "pause": "Pause",
      "refueling": "Refueling",
      "offline": "Offline",
      "acceptRide": "Accept Ride",
      "navigate": "Navigate",
      "messages": "Messages",
      "typeMessage": "Type message...",
      "send": "Send",
      "recentRides": "Recent Rides",
      "noCompletedRides": "No completed rides yet",
      "currentLocation": "Current Location",
      "locationNotAvailable": "Not available"
    },
    "general": {
      "loading": "Načítání...",
      "error": "Chyba",
      "success": "Úspěch",
      "cancel": "Zrušit",
      "confirm": "Potvrdit",
      "yes": "Ano",
      "no": "Ne"
    }
  },
  en: {
    "login": {
      "title": "Driver Login",
      "email": "Email",
      "password": "Password",
      "confirmPassword": "Confirm Password",
      "signIn": "Sign In",
      "signingIn": "Signing in...",
      "register": "Register",
      "registering": "Registering...",
      "loginTab": "Login",
      "registerTab": "Register",
      "passwordMismatch": "Passwords do not match",
      "passwordTooShort": "Password must be at least 6 characters",
      "registrationSuccess": "Registration successful! You can now log in.",
      "error": "Error"
    },
    "dashboard": {
      "title": "Řídicí panel řidiče",
      "welcome": "Vítejte",
      "noRides": "Žádné aktivní jízdy",
      "currentRide": "Aktuální jízda",
      "rideDetails": "Detaily jízdy",
      "customer": "Zákazník",
      "pickup": "Vyzvednutí",
      "destination": "Cíl",
      "status": "Status",
      "actions": "Akce",
      "startRide": "Začít jízdu",
      "completeRide": "Dokončit jízdu",
      "cancelRide": "Zrušit jízdu",
      "navigation": "Navigace",
      "callCustomer": "Zavolat zákazníkovi",
      "sendSms": "Odeslat SMS",
      "logout": "Odhlásit se",
      "available": "Dostupný",
      "onRide": "Na jízdě",
      "pause": "Pauza",
      "refueling": "Tankování",
      "offline": "Offline",
      "acceptRide": "Přijmout jízdu",
      "navigate": "Navigovat",
      "messages": "Zprávy",
      "typeMessage": "Napište zprávu...",
      "send": "Odeslat",
      "recentRides": "Nedávné jízdy",
      "noCompletedRides": "Žádné dokončené jízdy",
      "currentLocation": "Aktuální poloha",
      "locationNotAvailable": "Poloha není k dispozici"
    },
    "general": {
      "loading": "Loading...",
      "error": "Error",
      "success": "Success",
      "cancel": "Cancel",
      "confirm": "Confirm",
      "yes": "Yes",
      "no": "No"
    }
  }
};

// Provider component that wraps the app
export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguage] = useState<string>(() => {
    const savedLang = localStorage.getItem('driver-app-language');
    return savedLang && availableLanguages.includes(savedLang) ? savedLang : 'cs';
  });

  const [translations, setTranslations] = useState<Record<string, any>>({});

  // Fix: Define the changeLanguage function that was missing.
  const changeLanguage = useCallback((lang: string) => {
    if (availableLanguages.includes(lang)) {
      setLanguage(lang);
      localStorage.setItem('driver-app-language', lang);
    }
  }, []);

  useEffect(() => {
    try {
      const translations = staticTranslations[language as keyof typeof staticTranslations] || staticTranslations.cs;
      setTranslations(translations);
    } catch (error) {
      console.error('Failed to load translations:', error);
      setTranslations(staticTranslations.cs); // Fallback to Czech
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