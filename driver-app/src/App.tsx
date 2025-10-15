import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { AuthContext } from './AuthContext';
import { LanguageProvider } from './contexts/LanguageContext';
import Login from './components/Login';
import Dashboard from './components/Dashboard';

function App() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? null);
        setLoading(false);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }

  return (
    <LanguageProvider>
      <AuthContext.Provider value={{ user, signOut: () => supabase.auth.signOut() }}>
        <div className="min-h-screen bg-slate-900 text-white">
          {user ? <Dashboard /> : <Login />}
        </div>
      </AuthContext.Provider>
    </LanguageProvider>
  );
}

export default App;