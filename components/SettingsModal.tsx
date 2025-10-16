import React from 'react';
import { CloseIcon, UploadIcon, DownloadIcon, CsvIcon, UndoIcon, TrashIcon } from './icons';
import { useTranslation } from '../contexts/LanguageContext';
import type { WidgetId, MessagingApp, FuelPrices, CompanyInfo } from '../types';
import { MessagingApp as AppType, FuelType } from '../types';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  messagingApp: MessagingApp;
  onMessagingAppChange: (app: MessagingApp) => void;
  isEditMode: boolean;
  onToggleEditMode: () => void;
  onResetLayout: () => void;
  onSaveData: () => void;
  onLoadData: () => void;
  onExportCsv: () => void;
  onClearRideHistory: () => void;
  widgetVisibility: Record<WidgetId, boolean>;
  onWidgetVisibilityChange: (widgetId: WidgetId, isVisible: boolean) => void;
    fuelPrices: FuelPrices;
    onFuelPricesChange: (prices: FuelPrices) => void;
    companyInfo: CompanyInfo;
    onCompanyInfoChange: (info: CompanyInfo) => void;
    smsGateConfig: { server: string; username: string; password: string };
    onSmsGateConfigChange: (config: { server: string; username: string; password: string }) => void;
   user: any;
   onSyncToSupabase: () => void;
   onLoadFromSupabase: () => void;
   onSyncAllDataToSupabase: () => void;
  preferredNav?: 'google' | 'waze';
  onPreferredNavChange?: (nav: 'google' | 'waze') => void;
}

const VisibilityToggle: React.FC<{
  label: string;
  isChecked: boolean;
  onToggle: () => void;
}> = ({ label, isChecked, onToggle }) => (
  <div className="flex justify-between items-center bg-slate-700 p-3 rounded-lg">
    <label className="text-gray-200 cursor-pointer" onClick={onToggle}>{label}</label>
    <button
      onClick={onToggle}
      type="button"
      className={`${isChecked ? 'bg-cyan-600' : 'bg-slate-600'} relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-offset-2 focus:ring-offset-slate-800`}
      role="switch"
      aria-checked={isChecked}
    >
      <span aria-hidden="true" className={`${isChecked ? 'translate-x-5' : 'translate-x-0'} pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out`} />
    </button>
  </div>
);

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen, onClose, messagingApp, onMessagingAppChange,
  isEditMode, onToggleEditMode, onResetLayout, onSaveData, onLoadData, onExportCsv, onClearRideHistory,
  widgetVisibility, onWidgetVisibilityChange, fuelPrices, onFuelPricesChange, companyInfo, onCompanyInfoChange, smsGateConfig, onSmsGateConfigChange,
  user, onSyncToSupabase, onLoadFromSupabase, onSyncAllDataToSupabase, preferredNav, onPreferredNavChange
}) => {
  const { t, language, changeLanguage } = useTranslation();

  if (!isOpen) return null;
  
  const widgetIds: WidgetId[] = ['dispatch', 'vehicles', 'map', 'rideLog', 'smsGate'];

  const handleFuelPriceChange = (fuelType: keyof FuelPrices, value: string) => {
    const newPrices = {
      ...fuelPrices,
      [fuelType]: parseFloat(value) || 0,
    };
    onFuelPricesChange(newPrices);
    // Save to localStorage immediately to prevent resetting
    localStorage.setItem('fuel-prices', JSON.stringify(newPrices));
  };

  return (
    <div
      className="fixed inset-0 bg-black/70 z-50 flex justify-center items-center p-4 animate-fade-in"
      aria-labelledby="settings-title"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-slate-800 rounded-lg shadow-2xl w-full max-w-2xl relative">
        <header className="flex justify-between items-center p-6 border-b border-slate-700">
          <h2 id="settings-title" className="text-xl font-semibold text-white">{t('settings.title')}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white" aria-label={t('general.close')}>
            <CloseIcon />
          </button>
        </header>

        <main className="p-6 space-y-8 max-h-[70vh] overflow-y-auto">
          {/* General Settings */}
          <section>
            <h3 className="text-lg font-medium text-cyan-400 mb-4">{t('settings.general.title')}</h3>
            <div className="space-y-4">
               <div className="flex justify-between items-center bg-slate-700 p-3 rounded-lg">
                 <label htmlFor="language-select" className="text-gray-200">{t('settings.general.language')}</label>
                 <select
                   id="language-select"
                   value={language}
                   onChange={(e) => changeLanguage(e.target.value)}
                   className="bg-slate-700 border-0 rounded-md py-1 px-3 text-white"
                 >
                  <option value="cs">Čeština</option>
                  <option value="en">English</option>
                  <option value="de">Deutsch</option>
                </select>
               </div>
            </div>
          </section>
          
          {/* Communication Settings */}
          <section>
            <h3 className="text-lg font-medium text-cyan-400 mb-4">{t('settings.communication.title')}</h3>
            <div className="space-y-4">
  <div className="flex justify-between items-center bg-slate-700 p-3 rounded-lg">
                <label htmlFor="messaging-app-select" className="text-gray-200">{t('settings.communication.preferredApp')}</label>
                 <select
                   id="messaging-app-select"
                   value={messagingApp}
                   onChange={(e) => onMessagingAppChange(e.target.value as MessagingApp)}
                   className="bg-slate-700 border-0 rounded-md py-1 px-3 text-white"
                 >
                  {Object.values(AppType).map(app => (
                    <option key={app} value={app}>{app}</option>
                  ))}
                </select>
              </div>
              <div className="flex justify-between items-center bg-slate-700 p-3 rounded-lg">
                <label htmlFor="preferred-nav-select" className="text-gray-200">{t('settings.communication.preferredNav')}</label>
                 <select
                   id="preferred-nav-select"
                   value={preferredNav}
                   onChange={(e) => onPreferredNavChange?.(e.target.value as 'google' | 'waze')}
                   className="bg-slate-700 border-0 rounded-md py-1 px-3 text-white"
                 >
                  <option value="google">Google Maps</option>
                  <option value="waze">Waze</option>
                </select>
              </div>
            </div>
          </section>

          {/* Fuel Price Settings */}
          <section>
            <h3 className="text-lg font-medium text-cyan-400 mb-4">{t('settings.fuel.title')}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-slate-700 p-3 rounded-lg">
                <label htmlFor="diesel-price" className="block text-sm font-medium text-gray-300 mb-1">{t('settings.fuel.diesel')}</label>
                <div className="relative">
                  <input type="number" step="0.1" id="diesel-price" value={fuelPrices.DIESEL} onChange={(e) => handleFuelPriceChange('DIESEL', e.target.value)} className="w-full bg-slate-700 border-0 rounded-md py-1 pl-3 pr-12 text-white" />
                  <span className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400">Kč/L</span>
                </div>
              </div>
              <div className="bg-slate-700 p-3 rounded-lg">
                <label htmlFor="petrol-price" className="block text-sm font-medium text-gray-300 mb-1">{t('settings.fuel.petrol')}</label>
                <div className="relative">
                  <input type="number" step="0.1" id="petrol-price" value={fuelPrices.PETROL} onChange={(e) => handleFuelPriceChange('PETROL', e.target.value)} className="w-full bg-slate-700 border-0 rounded-md py-1 pl-3 pr-12 text-white" />
                  <span className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400">Kč/L</span>
                </div>
              </div>
            </div>
           </section>

           {/* SMS Gate Configuration */}
           <section>
             <h3 className="text-lg font-medium text-cyan-400 mb-4">SMS Gate Configuration</h3>
             <div className="space-y-4">
               <div className="bg-slate-700 p-3 rounded-lg">
                 <label htmlFor="sms-server" className="block text-sm font-medium text-gray-300 mb-1">Server Address</label>
                 <input type="text" id="sms-server" value={smsGateConfig.server} onChange={(e) => onSmsGateConfigChange({ ...smsGateConfig, server: e.target.value })} className="w-full bg-slate-800 border-0 rounded-md py-2 px-3 text-white" placeholder="e.g., api.sms-gate.app:443" />
               </div>
               <div className="bg-slate-700 p-3 rounded-lg">
                 <label htmlFor="sms-username" className="block text-sm font-medium text-gray-300 mb-1">Username</label>
                 <input type="text" id="sms-username" value={smsGateConfig.username} onChange={(e) => onSmsGateConfigChange({ ...smsGateConfig, username: e.target.value })} className="w-full bg-slate-800 border-0 rounded-md py-2 px-3 text-white" />
               </div>
               <div className="bg-slate-700 p-3 rounded-lg">
                 <label htmlFor="sms-password" className="block text-sm font-medium text-gray-300 mb-1">Password</label>
                 <input type="password" id="sms-password" value={smsGateConfig.password} onChange={(e) => onSmsGateConfigChange({ ...smsGateConfig, password: e.target.value })} className="w-full bg-slate-800 border-0 rounded-md py-2 px-3 text-white" />
               </div>
             </div>
           </section>

           {/* Visibility Settings */}
          <section>
            <h3 className="text-lg font-medium text-cyan-400 mb-4">{t('settings.visibility.title')}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {widgetIds.map(id => (
                 <VisibilityToggle 
                    key={id}
                    label={t(`settings.visibility.${id}`)}
                    isChecked={widgetVisibility[id]}
                    onToggle={() => onWidgetVisibilityChange(id, !widgetVisibility[id])}
                 />
              ))}
            </div>
          </section>

          {/* Layout Settings */}
          <section>
            <h3 className="text-lg font-medium text-cyan-400 mb-4">{t('settings.layout.title')}</h3>
            <div className="flex flex-wrap gap-4">
              <button
                onClick={onToggleEditMode}
                className={`flex-1 px-4 py-2 text-sm font-medium rounded-md shadow-sm transition-colors ${
                  isEditMode ? 'bg-cyan-600 text-white' : 'bg-slate-700 hover:bg-slate-600'
                }`}
              >
                {isEditMode ? t('settings.layout.finishEditing') : t('settings.layout.editLayout')}
              </button>
              <button
                onClick={onResetLayout}
                className="flex items-center space-x-2 flex-1 px-4 py-2 text-sm font-medium rounded-md shadow-sm bg-slate-700 hover:bg-slate-600 transition-colors"
              >
                <UndoIcon size={16} />
                <span>{t('settings.layout.resetLayout')}</span>
              </button>
            </div>
          </section>

           {/* Cloud Synchronization */}
           {user && (
             <section>
               <h3 className="text-lg font-medium text-cyan-400 mb-4">Synchronizace s cloudem</h3>
               <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                 <button
                   onClick={onSyncToSupabase}
                   className="flex items-center justify-center space-x-2 px-3 py-2 text-sm font-medium rounded-md shadow-sm bg-green-700 hover:bg-green-600 transition-colors"
                 >
                   <UploadIcon />
                   <span>Uložit nastavení</span>
                 </button>
                 <button
                   onClick={onLoadFromSupabase}
                   className="flex items-center justify-center space-x-2 px-3 py-2 text-sm font-medium rounded-md shadow-sm bg-blue-700 hover:bg-blue-600 transition-colors"
                 >
                   <DownloadIcon />
                   <span>Načíst nastavení</span>
                 </button>
                  <button
                    onClick={() => { onSaveData(); onSyncAllDataToSupabase(); }}
                    className="flex items-center justify-center space-x-2 px-3 py-2 text-sm font-medium rounded-md shadow-sm bg-green-700 hover:bg-green-600 transition-colors"
                  >
                    <UploadIcon />
                    <span>Uložit vše</span>
                  </button>
               </div>
               <p className="text-sm text-gray-400 mt-2">
                 Synchronizujte svá nastavení nebo všechna data (kontakty, vozidla, historie jízd) s cloudem pro přístup z jakéhokoliv zařízení.
               </p>
             </section>
           )}

           {/* Data Management */}
           <section>
             <h3 className="text-lg font-medium text-cyan-400 mb-4">{t('settings.data.title')}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <button
                onClick={onSaveData}
                className="flex items-center justify-center space-x-2 px-3 py-2 text-sm font-medium rounded-md shadow-sm bg-slate-700 hover:bg-slate-600 transition-colors"
              >
                <DownloadIcon />
                <span>{t('settings.data.save')}</span>
              </button>
              <button
                onClick={onLoadData}
                className="flex items-center justify-center space-x-2 px-3 py-2 text-sm font-medium rounded-md shadow-sm bg-slate-700 hover:bg-slate-600 transition-colors"
              >
                <UploadIcon />
                <span>{t('settings.data.load')}</span>
              </button>
              <button
                onClick={onExportCsv}
                className="flex items-center justify-center space-x-2 px-3 py-2 text-sm font-medium rounded-md shadow-sm bg-slate-700 hover:bg-slate-600 transition-colors"
              >
                <CsvIcon />
                <span>{t('settings.data.exportCsv')}</span>
              </button>
              <button
                onClick={onClearRideHistory}
                className="col-span-1 sm:col-span-3 flex items-center justify-center space-x-2 px-3 py-2 text-sm font-medium rounded-md shadow-sm bg-red-800 text-red-100 hover:bg-red-700 transition-colors"
              >
                <TrashIcon />
                <span>{t('settings.data.clearHistory')}</span>
              </button>
            </div>
           </section>

           {/* Company Information */}
           <section>
             <h3 className="text-lg font-medium text-cyan-400 mb-4">Údaje o firmě</h3>
             <div className="space-y-4">
               <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                 <div>
                   <label htmlFor="company-name" className="block text-sm font-medium text-gray-300 mb-1">
                     Název firmy
                   </label>
                   <input
                     type="text"
                     id="company-name"
                     value={companyInfo.name}
                     onChange={(e) => onCompanyInfoChange({ ...companyInfo, name: e.target.value })}
                      className="w-full bg-slate-700 border-0 rounded-md shadow-sm py-2 px-3 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                   />
                 </div>
                 <div>
                   <label htmlFor="company-address" className="block text-sm font-medium text-gray-300 mb-1">
                     Adresa
                   </label>
                   <input
                     type="text"
                     id="company-address"
                     value={companyInfo.address}
                     onChange={(e) => onCompanyInfoChange({ ...companyInfo, address: e.target.value })}
                      className="w-full bg-slate-700 border-0 rounded-md shadow-sm py-2 px-3 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                   />
                 </div>
               </div>

               <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                 <div>
                   <label htmlFor="company-phone" className="block text-sm font-medium text-gray-300 mb-1">
                     Telefon
                   </label>
                   <input
                     type="tel"
                     id="company-phone"
                     value={companyInfo.phone}
                     onChange={(e) => onCompanyInfoChange({ ...companyInfo, phone: e.target.value })}
                      className="w-full bg-slate-700 border-0 rounded-md shadow-sm py-2 px-3 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                   />
                 </div>
                 <div>
                   <label htmlFor="company-email" className="block text-sm font-medium text-gray-300 mb-1">
                     Email
                   </label>
                   <input
                     type="email"
                     id="company-email"
                     value={companyInfo.email}
                     onChange={(e) => onCompanyInfoChange({ ...companyInfo, email: e.target.value })}
                      className="w-full bg-slate-700 border-0 rounded-md shadow-sm py-2 px-3 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                   />
                 </div>
               </div>

               <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                 <div>
                   <label htmlFor="company-ico" className="block text-sm font-medium text-gray-300 mb-1">
                     IČO
                   </label>
                   <input
                     type="text"
                     id="company-ico"
                     value={companyInfo.ico}
                     onChange={(e) => onCompanyInfoChange({ ...companyInfo, ico: e.target.value })}
                      className="w-full bg-slate-700 border-0 rounded-md shadow-sm py-2 px-3 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                   />
                 </div>
                 <div>
                   <label htmlFor="company-dic" className="block text-sm font-medium text-gray-300 mb-1">
                     DIČ
                   </label>
                   <input
                     type="text"
                     id="company-dic"
                     value={companyInfo.dic}
                     onChange={(e) => onCompanyInfoChange({ ...companyInfo, dic: e.target.value })}
                      className="w-full bg-slate-700 border-0 rounded-md shadow-sm py-2 px-3 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                   />
                 </div>
               </div>

               <div>
                 <label className="block text-sm font-medium text-gray-300 mb-1">
                   Logo firmy
                 </label>
                 <div className="flex items-center space-x-4">
                   {companyInfo.logoUrl && (
                     <img
                       src={companyInfo.logoUrl}
                       alt="Company logo"
                       className="w-16 h-16 object-contain bg-white rounded"
                     />
                   )}
                   <input
                     type="file"
                     accept="image/*"
                     onChange={(e) => {
                       const file = e.target.files?.[0];
                       if (file) {
                         const reader = new FileReader();
                         reader.onload = (e) => {
                           const logoUrl = e.target?.result as string;
                           onCompanyInfoChange({ ...companyInfo, logoUrl });
                         };
                         reader.readAsDataURL(file);
                       }
                     }}
                     className="text-sm text-gray-300 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-cyan-600 file:text-white hover:file:bg-cyan-700"
                   />
                   {companyInfo.logoUrl && (
                     <button
                       onClick={() => onCompanyInfoChange({ ...companyInfo, logoUrl: undefined })}
                       className="text-red-400 hover:text-red-300 text-sm"
                     >
                       Odebrat logo
                     </button>
                   )}
                 </div>
               </div>
             </div>
           </section>
         </main>

        <footer className="p-6 bg-slate-900 border-t border-slate-700 flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2 text-sm font-medium rounded-md shadow-sm text-white bg-cyan-600 hover:bg-cyan-700"
          >
            {t('general.close')}
          </button>
        </footer>
      </div>
    </div>
  );
};