import React, { useState } from 'react';
import { supabase } from '../supabaseClient';
import { useTranslation } from '../contexts/LanguageContext';

const Login: React.FC = () => {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isRegister, setIsRegister] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (isRegister) {
      if (password !== confirmPassword) {
        setError(t('login.passwordMismatch'));
        setLoading(false);
        return;
      }
      if (password.length < 6) {
        setError(t('login.passwordTooShort'));
        setLoading(false);
        return;
      }
      try {
        const { error } = await supabase.auth.signUp({
          email,
          password,
        });
        if (error) throw error;
        alert(t('login.registrationSuccess'));
        setIsRegister(false);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    } else {
      try {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
  };



  return (
    <div className="flex items-center justify-center min-h-screen bg-slate-900">
      <div className="glass card-hover p-8 rounded-2xl shadow-frost w-full max-w-md border border-slate-700/50">
        <h1 className="text-2xl font-bold text-center mb-6">
          {t('login.title')}
        </h1>

        <div className="flex justify-center mb-4">
          <button
            onClick={() => setIsRegister(false)}
            className={`px-4 py-2 rounded-l-md ${!isRegister ? 'bg-blue-600' : 'bg-slate-700'} text-white`}
          >
            {t('login.loginTab')}
          </button>
          <button
            onClick={() => setIsRegister(true)}
            className={`px-4 py-2 rounded-r-md ${isRegister ? 'bg-blue-600' : 'bg-slate-700'} text-white`}
          >
            {t('login.registerTab')}
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">{t('login.email')}</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">{t('login.password')}</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white"
              required
            />
          </div>

          {isRegister && (
            <div>
              <label className="block text-sm font-medium mb-1">{t('login.confirmPassword')}</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white"
                required
              />
            </div>
          )}

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 py-2 rounded-md font-medium"
          >
            {loading ? (isRegister ? t('login.registering') : t('login.signingIn')) : (isRegister ? t('login.register') : t('login.signIn'))}
          </button>
        </form>
      </div>
    </div>
  );
};

export default Login;