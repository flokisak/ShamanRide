import React, { useState, useEffect } from 'react';
import { useTranslation } from '../contexts/LanguageContext';

interface NotificationSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface NotificationSettings {
  rideSound: boolean;
  rideVibration: boolean;
  rideSystemNotification: boolean;
  messageSound: boolean;
  messageVibration: boolean;
  messageSystemNotification: boolean;
  generalSound: boolean;
  generalVibration: boolean;
  generalSystemNotification: boolean;
  wakeLockEnabled: boolean;
}

const DEFAULT_SETTINGS: NotificationSettings = {
  rideSound: true,
  rideVibration: true,
  rideSystemNotification: true,
  messageSound: true,
  messageVibration: true,
  messageSystemNotification: true,
  generalSound: true,
  generalVibration: true,
  generalSystemNotification: true,
  wakeLockEnabled: true
};

export const NotificationSettingsModal: React.FC<NotificationSettingsModalProps> = ({
  isOpen,
  onClose
}) => {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<NotificationSettings>(DEFAULT_SETTINGS);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadSettings();
    }
  }, [isOpen]);

  const loadSettings = () => {
    try {
      const saved = localStorage.getItem('notification-settings');
      if (saved) {
        const parsedSettings = JSON.parse(saved);
        setSettings({ ...DEFAULT_SETTINGS, ...parsedSettings });
      }
    } catch (error) {
      console.warn('Error loading notification settings:', error);
    }
  };

  const saveSettings = async () => {
    setSaving(true);
    try {
      localStorage.setItem('notification-settings', JSON.stringify(settings));
      // Apply wake lock setting immediately
      if (settings.wakeLockEnabled) {
        // Wake lock will be managed by the Dashboard component
        console.log('Wake lock enabled in settings');
      }
      onClose();
    } catch (error) {
      console.error('Error saving notification settings:', error);
    } finally {
      setSaving(false);
    }
  };

  const updateSetting = (key: keyof NotificationSettings, value: boolean) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const resetToDefaults = () => {
    setSettings(DEFAULT_SETTINGS);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-800 rounded-2xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-white">Nastavení notifikací</h2>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white transition-colors"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="space-y-6">
            {/* Ride Notifications */}
            <div className="space-y-3">
              <h3 className="text-lg font-semibold text-white flex items-center">
                <div className="w-8 h-8 bg-green-500/20 rounded-lg flex items-center justify-center mr-3">
                  <svg className="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                Nové jízdy
              </h3>
              <div className="ml-11 space-y-2">
                <label className="flex items-center space-x-3">
                  <input
                    type="checkbox"
                    checked={settings.rideSound}
                    onChange={(e) => updateSetting('rideSound', e.target.checked)}
                    className="w-4 h-4 text-green-600 bg-slate-700 border-slate-600 rounded focus:ring-green-500"
                  />
                  <span className="text-slate-300">Zvuk</span>
                </label>
                <label className="flex items-center space-x-3">
                  <input
                    type="checkbox"
                    checked={settings.rideVibration}
                    onChange={(e) => updateSetting('rideVibration', e.target.checked)}
                    className="w-4 h-4 text-green-600 bg-slate-700 border-slate-600 rounded focus:ring-green-500"
                  />
                  <span className="text-slate-300">Vibrace</span>
                </label>
                <label className="flex items-center space-x-3">
                  <input
                    type="checkbox"
                    checked={settings.rideSystemNotification}
                    onChange={(e) => updateSetting('rideSystemNotification', e.target.checked)}
                    className="w-4 h-4 text-green-600 bg-slate-700 border-slate-600 rounded focus:ring-green-500"
                  />
                  <span className="text-slate-300">Systémová notifikace</span>
                </label>
              </div>
            </div>

            {/* Message Notifications */}
            <div className="space-y-3">
              <h3 className="text-lg font-semibold text-white flex items-center">
                <div className="w-8 h-8 bg-blue-500/20 rounded-lg flex items-center justify-center mr-3">
                  <svg className="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                </div>
                Zprávy
              </h3>
              <div className="ml-11 space-y-2">
                <label className="flex items-center space-x-3">
                  <input
                    type="checkbox"
                    checked={settings.messageSound}
                    onChange={(e) => updateSetting('messageSound', e.target.checked)}
                    className="w-4 h-4 text-blue-600 bg-slate-700 border-slate-600 rounded focus:ring-blue-500"
                  />
                  <span className="text-slate-300">Zvuk</span>
                </label>
                <label className="flex items-center space-x-3">
                  <input
                    type="checkbox"
                    checked={settings.messageVibration}
                    onChange={(e) => updateSetting('messageVibration', e.target.checked)}
                    className="w-4 h-4 text-blue-600 bg-slate-700 border-slate-600 rounded focus:ring-blue-500"
                  />
                  <span className="text-slate-300">Vibrace</span>
                </label>
                <label className="flex items-center space-x-3">
                  <input
                    type="checkbox"
                    checked={settings.messageSystemNotification}
                    onChange={(e) => updateSetting('messageSystemNotification', e.target.checked)}
                    className="w-4 h-4 text-blue-600 bg-slate-700 border-slate-600 rounded focus:ring-blue-500"
                  />
                  <span className="text-slate-300">Systémová notifikace</span>
                </label>
              </div>
            </div>

            {/* General Notifications */}
            <div className="space-y-3">
              <h3 className="text-lg font-semibold text-white flex items-center">
                <div className="w-8 h-8 bg-slate-500/20 rounded-lg flex items-center justify-center mr-3">
                  <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-5 5v-5zM4.868 12.683A17.925 17.925 0 012 21h13.78a3.08 3.08 0 01-.46-1.61c0-1.77.73-3.4 1.94-4.59L4.868 12.683z" />
                  </svg>
                </div>
                Obecné notifikace
              </h3>
              <div className="ml-11 space-y-2">
                <label className="flex items-center space-x-3">
                  <input
                    type="checkbox"
                    checked={settings.generalSound}
                    onChange={(e) => updateSetting('generalSound', e.target.checked)}
                    className="w-4 h-4 text-slate-600 bg-slate-700 border-slate-600 rounded focus:ring-slate-500"
                  />
                  <span className="text-slate-300">Zvuk</span>
                </label>
                <label className="flex items-center space-x-3">
                  <input
                    type="checkbox"
                    checked={settings.generalVibration}
                    onChange={(e) => updateSetting('generalVibration', e.target.checked)}
                    className="w-4 h-4 text-slate-600 bg-slate-700 border-slate-600 rounded focus:ring-slate-500"
                  />
                  <span className="text-slate-300">Vibrace</span>
                </label>
                <label className="flex items-center space-x-3">
                  <input
                    type="checkbox"
                    checked={settings.generalSystemNotification}
                    onChange={(e) => updateSetting('generalSystemNotification', e.target.checked)}
                    className="w-4 h-4 text-slate-600 bg-slate-700 border-slate-600 rounded focus:ring-slate-500"
                  />
                  <span className="text-slate-300">Systémová notifikace</span>
                </label>
              </div>
            </div>

            {/* Wake Lock */}
            <div className="space-y-3">
              <h3 className="text-lg font-semibold text-white flex items-center">
                <div className="w-8 h-8 bg-yellow-500/20 rounded-lg flex items-center justify-center mr-3">
                  <svg className="w-4 h-4 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                </div>
                Obrazovka
              </h3>
              <div className="ml-11">
                <label className="flex items-center space-x-3">
                  <input
                    type="checkbox"
                    checked={settings.wakeLockEnabled}
                    onChange={(e) => updateSetting('wakeLockEnabled', e.target.checked)}
                    className="w-4 h-4 text-yellow-600 bg-slate-700 border-slate-600 rounded focus:ring-yellow-500"
                  />
                  <span className="text-slate-300">Zabránit vypnutí obrazovky během jízdy</span>
                </label>
                <p className="text-xs text-slate-500 mt-1 ml-7">
                  Obrazovka zůstane zapnutá když máte aktivní jízdu nebo jste k dispozici
                </p>
              </div>
            </div>
          </div>

          <div className="flex space-x-3 mt-8">
            <button
              onClick={resetToDefaults}
              className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg transition-colors"
            >
              Obnovit výchozí
            </button>
            <button
              onClick={saveSettings}
              disabled={saving}
              className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-600 text-white rounded-lg transition-colors"
            >
              {saving ? 'Ukládání...' : 'Uložit'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};