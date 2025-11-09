import React, { useEffect } from 'react';
import { startAuthKeepAlive } from './supabaseClient';
import { AuthProvider, useAuth } from './AuthContext';
import { LanguageProvider } from './contexts/LanguageContext';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import { initializeBackgroundSync } from './utils/backgroundSync';

function AppContent() {
  const { user, loading } = useAuth();

  useEffect(() => {
    // Initialize background sync
    initializeBackgroundSync();

    // Start auth keep-alive to proactively refresh tokens and avoid
    // short-lived session expiries when the app is idle. This helps keep
    // drivers logged in for longer periods (refresh runs every 5 minutes).
    try {
      startAuthKeepAlive(5 * 60 * 1000);
    } catch (err) {
      console.warn('Failed to start auth keep-alive from App:', err);
    }
  }, []);

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      {user ? <Dashboard /> : <Login />}
    </div>
  );
}

function App() {
  return (
    <LanguageProvider>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </LanguageProvider>
  );
}

export default App;