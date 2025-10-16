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
const availableLanguages = ['cs'];

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
      "title": "Řídicí panel řidiče",
      "welcome": "Vítejte",
      "noRides": "Žádné aktivní jízdy",
      "currentRide": "Aktuální jízda",
      "rideDetails": "Detaily jízdy",
      "customer": "Zákazník",
      "phone": "Telefon",
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
      "break": "Pauza",
      "break10": "Pauza 10 min",
      "break20": "Pauza 20 min",
      "break30": "Pauza 30 min",
      "break60": "Pauza 1 hod",
      "pause": "Pauza",
      "refueling": "Tankování",
      "offline": "Offline",
       "acceptRide": "Přijmout jízdu",
       "navigate": "Navigovat",
       "navigateWith": "Navigovat s",
       "messages": "Zprávy",
      "typeMessage": "Napište zprávu...",
      "send": "Odeslat",
      "recentRides": "Nedávné jízdy",
      "noCompletedRides": "Žádné dokončené jízdy",
      "currentLocation": "Aktuální poloha",
      "locationNotAvailable": "Poloha není k dispozici",
      "breakEndsIn": "Pauza končí za"
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
  }
};

// Provider component that wraps the app
export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguage] = useState<string>('cs'); // Always Czech for drivers

  const [translations, setTranslations] = useState<Record<string, any>>({});

  // Language is always Czech for drivers
  const changeLanguage = useCallback((lang: string) => {
    // Do nothing - always Czech
  }, []);

  useEffect(() => {
    // Always use Czech translations for drivers
    setTranslations(staticTranslations.cs);
  }, []);

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