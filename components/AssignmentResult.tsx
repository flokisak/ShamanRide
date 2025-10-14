import React, { useState, useMemo } from 'react';
import type { AssignmentResultData, ErrorResult, Person, AssignmentAlternative, MessagingApp, FuelPrices } from '../types';
import { CarIcon, AlertTriangleIcon, CheckCircleIcon, ClipboardIcon, ShareIcon, NavigationIcon, FuelIcon } from './icons';
import { VehicleType } from '../types';
import { useTranslation } from '../contexts/LanguageContext';
import { generateSms, generateShareLink } from '../services/dispatchService';

interface AssignmentResultProps {
  result: AssignmentResultData | null;
  error: ErrorResult | null;
  onClear: () => void;
  onConfirm: (option: AssignmentAlternative) => void;
  isAiMode: boolean;
  people: Person[];
  messagingApp: MessagingApp;
  className?: string;
  fuelPrices: FuelPrices;
}

const VehicleOption: React.FC<{
    option: AssignmentAlternative,
    isRecommended: boolean,
    onConfirm: (option: AssignmentAlternative) => void;
    isAiMode: boolean;
    people: Person[];
    rideDistance?: number;
    fuelPrices: FuelPrices;
}> = ({ option, isRecommended, onConfirm, isAiMode, people, rideDistance, fuelPrices }) => {
    const { t } = useTranslation();
    const { vehicle, eta, waitTime, estimatedPrice } = option;
    const driver = people.find(p => p.id === vehicle.driverId);
    
    const estimatedFuelCost = useMemo(() => {
        if (vehicle.fuelType && vehicle.fuelConsumption && vehicle.fuelConsumption > 0 && rideDistance) {
            const price = fuelPrices[vehicle.fuelType];
            const cost = (rideDistance / 100) * vehicle.fuelConsumption * price;
            return Math.round(cost);
        }
        return null;
    }, [vehicle, rideDistance, fuelPrices]);

    return (
          <div className={`p-4 rounded-lg flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-3 sm:space-y-0 ${isRecommended && isAiMode ? 'bg-cyan-900 border border-cyan-700' : 'bg-slate-700'}`}>
            <div className="flex items-center space-x-4">
              <div className={vehicle.type === VehicleType.Car ? "text-cyan-400" : "text-gray-200"}>
                <CarIcon size={40} />
              </div>
              <div>
                <p className="font-bold text-lg text-white">{vehicle.name}</p>
                <p className="text-gray-300 text-sm">{driver?.name || <span className="italic text-gray-500">{t('general.unassigned')}</span>}</p>
                {driver?.phone && <p className="text-teal-400 text-xs font-mono">{driver.phone}</p>}
                {isRecommended && isAiMode && <span className="text-xs font-bold text-cyan-300 uppercase tracking-wider mt-1 inline-block">{t('assignment.recommended')}</span>}
              </div>
            </div>
            <div className="flex items-center justify-between sm:justify-end sm:space-x-6">
                {estimatedFuelCost !== null && (
                    <div className="text-center" title={t('assignment.fuelCost')}>
                        <p className="text-sm text-gray-400 flex items-center justify-center gap-1"><FuelIcon size={14} /> {t('assignment.cost')}</p>
                        <p className="text-xl font-bold text-red-400">{estimatedFuelCost} Kč</p>
                    </div>
                )}
                <div className="text-center">
                    <p className="text-sm text-gray-400">{t('assignment.price')}</p>
                    <p className="text-xl font-bold text-white">{estimatedPrice > 0 ? `${estimatedPrice} Kč` : t('general.notApplicable')}</p>
                </div>
                 <div className="text-center">
                    <p className="text-sm text-gray-400">{t('assignment.route')}</p>
                    <p className="text-xl font-bold text-white">{rideDistance ? `${rideDistance.toFixed(1)} km` : '...'}</p>
                </div>
                <div className="text-center sm:text-right">
                    <p className="text-sm text-gray-400">{t('assignment.eta')}</p>
                    <p className="text-xl font-bold text-white">{eta > 0 ? `${eta} min` : '?'}</p>
                    {waitTime && waitTime > 0 && (
                        <p className="text-xs text-yellow-400">({t('assignment.wait')} {waitTime} min)</p>
                    )}
                </div>
                 <button
                    onClick={() => onConfirm(option)}
                    className="px-4 py-2 text-sm font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 focus:ring-offset-slate-800 transition-colors"
                >
                    {t('assignment.assign')}
                </button>
            </div>
        </div>
    )
};

export const AssignmentResult: React.FC<AssignmentResultProps> = ({ result, error, onClear, onConfirm, isAiMode, people, messagingApp, className, fuelPrices }) => {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  
  const smsText = result?.sms || '';
  const navigationUrl = result?.navigationUrl || 'https://maps.google.com';
  const driver = result ? people.find(p => p.id === result.vehicle.driverId) : null;
  const phoneNumber = result?.vehicle.phone || driver?.phone?.replace(/\s/g, '');
  const shareLink = generateShareLink(messagingApp, phoneNumber || '', smsText);
  
  const handleCopy = () => {
    if (smsText) {
      navigator.clipboard.writeText(smsText).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    }
  };

  if (error) {
    const errorMessage = error.message ? `${t(error.messageKey)}: ${error.message}` : t(error.messageKey);
    return (
      <div className={`bg-red-900 border border-red-700 text-red-200 p-6 rounded-lg shadow-2xl animate-fade-in ${className || ''}`}>
        <div className="flex items-start space-x-4">
            <AlertTriangleIcon />
            <div>
                <h3 className="text-xl font-bold mb-2">{t('assignment.errorTitle')}</h3>
                <p className="text-red-200 mb-4">{errorMessage}</p>
                 <button
                    onClick={onClear}
                    className="mt-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 px-4 py-2 rounded-md transition-colors"
                    >
                    {t('general.close')}
                </button>
            </div>
        </div>
      </div>
    );
  }

  if (!result) return null;

  const { vehicle, eta, waitTime, alternatives, estimatedPrice, rideDistance, optimizedStops } = result;
  
  const allOptions = [{ vehicle, eta, waitTime, estimatedPrice }, ...alternatives];
    
  return (
    <div className={`bg-slate-800 p-6 rounded-lg shadow-2xl animate-fade-in space-y-6 ${className || ''}`}>
        <div className="flex items-center justify-between border-b border-slate-700 pb-4">
            <div className="flex items-center space-x-3">
                 <div className="bg-cyan-500 p-2 rounded-full">
                    <CheckCircleIcon />
                </div>
                <h2 className="text-2xl font-semibold">{isAiMode ? t('assignment.titleAI') : t('assignment.titleManual')}</h2>
            </div>
             <button
                onClick={onClear}
                className="text-sm font-medium text-gray-400 hover:text-white"
                >
                {t('general.cancel')}
            </button>
        </div>

        {optimizedStops && (
            <div className="bg-slate-700 p-4 rounded-lg">
                <h3 className="text-md font-semibold text-cyan-400 mb-2">{t('assignment.optimizedRoute')}</h3>
                <ol className="list-decimal list-inside text-gray-200 space-y-1">
                    {optimizedStops.map((stop, index) => (
                        <li key={index}>
                            <span className={index === 0 ? 'font-bold' : ''}>{stop}</span>
                        </li>
                    ))}
                </ol>
            </div>
        )}
      
        <div className="space-y-4">
            {allOptions.map((opt, index) => (
                <VehicleOption 
                    key={opt.vehicle.id} 
                    option={opt} 
                    isRecommended={index === 0 && isAiMode} 
                    onConfirm={onConfirm}
                    isAiMode={isAiMode}
                    people={people}
                    rideDistance={rideDistance}
                    fuelPrices={fuelPrices}
                />
            ))}
        </div>


      {/* Communication - Only shown in AI mode */}
      {isAiMode && smsText && (
        <div>
            <h4 className="text-sm text-gray-400 font-medium mb-2">{t('assignment.communication')}</h4>
            <div className="relative bg-slate-900 p-4 rounded-lg border border-slate-700">
            <p className="text-gray-200 whitespace-pre-wrap font-mono text-sm">{smsText}</p>
            <div className="absolute top-2 right-2 flex items-center space-x-2">
                <a
                  href={navigationUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2 rounded-md bg-slate-700 text-gray-300 transition-colors enabled:hover:bg-slate-600 enabled:hover:text-white"
                  title={t('assignment.openNavigation')}
                >
                  <NavigationIcon className="w-5 h-5" />
                </a>
                <a
                  href={shareLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2 rounded-md bg-slate-700 text-gray-300 transition-colors enabled:hover:bg-slate-600 enabled:hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
                  title={phoneNumber ? t('assignment.sendVia', { app: messagingApp }) : t('assignment.noPhoneNumber')}
                  onClick={(e) => !phoneNumber && e.preventDefault()}
                >
                  <ShareIcon className="w-5 h-5"/>
                </a>
                <button
                    onClick={handleCopy}
                    className="p-2 rounded-md bg-slate-700 hover:bg-slate-600 text-gray-300 hover:text-white transition-colors"
                    title={t('assignment.copyText')}
                >
                    {copied ? <CheckCircleIcon className="w-5 h-5 text-green-400" /> : <ClipboardIcon className="w-5 h-5"/>}
                </button>
            </div>
            </div>
        </div>
      )}
    </div>
  );
};