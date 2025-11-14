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

    // Check if driver is already selected
    const driverId = localStorage.getItem('selectedDriverId');
    setSelectedDriver(!!driverId);
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