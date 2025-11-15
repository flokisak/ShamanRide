import React, { useEffect, useState } from 'react';
import { LanguageProvider } from './contexts/LanguageContext';
import DriverSelection from './components/DriverSelection';
import Dashboard from './components/Dashboard';
import { initializeBackgroundSync } from './utils/backgroundSync';

function App() {
  const [selectedDriver, setSelectedDriver] = useState<boolean>(false);

  useEffect(() => {
    // Initialize background sync
    initializeBackgroundSync();

    // Check if driver shift is active
    const checkShiftStatus = () => {
      const driverId = localStorage.getItem('selectedDriverId');
      const isShiftActive = localStorage.getItem('isShiftActive') === 'true';
      setSelectedDriver(!!driverId && isShiftActive);
    };

    checkShiftStatus();

    // Listen for storage changes to detect when shift starts
    const handleStorageChange = () => {
      checkShiftStatus();
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  return (
    <LanguageProvider>
      <div className="min-h-screen bg-slate-900 text-white">
        {selectedDriver ? <Dashboard /> : <DriverSelection />}
      </div>
    </LanguageProvider>
  );
}

export default App;