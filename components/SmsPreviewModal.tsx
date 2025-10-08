import React, { useState } from 'react';
import { CloseIcon, ClipboardIcon, CheckCircleIcon, ShareIcon, NavigationIcon } from './icons';
import { useTranslation } from '../contexts/LanguageContext';
import { MessagingApp } from '../types';
import { generateShareLink } from '../services/dispatchService';

interface SmsPreviewModalProps {
  sms: string;
  driverPhone?: string;
  navigationUrl: string;
  messagingApp: MessagingApp;
  onClose: () => void;
  onConfirm?: () => void;
  onSendViaGateway?: () => Promise<void> | void;
}

export const SmsPreviewModal: React.FC<SmsPreviewModalProps> = ({ sms, driverPhone, navigationUrl, messagingApp, onClose, onConfirm, onSendViaGateway }) => {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const cleanDriverPhone = driverPhone?.replace(/\s/g, '');
  
  const shareLink = generateShareLink(messagingApp, cleanDriverPhone || '', sms);
  // Try to derive a Waze link from the provided navigationUrl (which is usually a Google Maps ?api=1 URL)
  const deriveWazeUrl = (nav: string) => {
    try {
      const u = new URL(nav);
      // Google maps directions use 'destination' param for our generator
      const dest = u.searchParams.get('destination');
      if (dest) {
        // dest may be 'lat,lon' or an address; prefer lat,lon
        const coordMatch = dest.match(/(-?\d+\.\d+),\s*(-?\d+\.\d+)/);
        if (coordMatch) {
          const lat = coordMatch[1];
          const lon = coordMatch[2];
          return `https://waze.com/ul?ll=${lat},${lon}&navigate=yes`;
        }
      }
      // Fallback: try to extract coords from the path (e.g., /dir/lat,lon/...)
      const pathMatch = u.pathname.match(/(-?\d+\.\d+),(-?\d+\.\d+)/);
      if (pathMatch) {
        return `https://waze.com/ul?ll=${pathMatch[1]},${pathMatch[2]}&navigate=yes`;
      }
    } catch (err) {
      // ignore and fallback below
    }
    return nav; // fallback to the original URL
  };
  const wazeUrl = deriveWazeUrl(navigationUrl || '');

  // Try to produce a universal link that will open the native map app when possible:
  const deriveUniversalUrl = (nav: string) => {
    try {
      const u = new URL(nav);
      const dest = u.searchParams.get('destination');
      let lat: string | null = null;
      let lon: string | null = null;
      if (dest) {
        const coordMatch = dest.match(/(-?\d+\.\d+),\s*(-?\d+\.\d+)/);
        if (coordMatch) {
          lat = coordMatch[1];
          lon = coordMatch[2];
        }
      }
      if (!lat || !lon) {
        const pathMatch = u.pathname.match(/(-?\d+\.\d+),(-?\d+\.\d+)/);
        if (pathMatch) {
          lat = pathMatch[1];
          lon = pathMatch[2];
        }
      }

      if (lat && lon) {
        const isIOS = typeof navigator !== 'undefined' && /iPhone|iPad|iPod/.test(navigator.userAgent);
        if (isIOS) {
          // Apple Maps URL scheme
          return `maps://?daddr=${lat},${lon}`;
        }
        // Android and others: geo URI (many apps will register this and trigger a chooser)
        // include a query so some apps show label/search
        return `geo:${lat},${lon}?q=${lat},${lon}`;
      }
    } catch (err) {
      // ignore
    }
    // fallback to original navigation url
    return nav;
  };
  const universalNavUrl = deriveUniversalUrl(navigationUrl || '');

  const handleCopy = () => {
    navigator.clipboard.writeText(sms).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div
      className="fixed inset-0 bg-black/70 z-50 flex justify-center items-center p-4 animate-fade-in"
      aria-labelledby="sms-preview-title"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-slate-800 rounded-lg shadow-2xl w-full max-w-md relative">
        <div className="flex justify-between items-center p-6 border-b border-slate-700">
          <h2 id="sms-preview-title" className="text-xl font-semibold">
            {t('smsPreview.title')}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
            aria-label={t('general.closeModal')}
          >
            <CloseIcon />
          </button>
        </div>
        <div className="p-6">
          {driverPhone && (
            <p className="mb-4">
              <strong className='text-gray-400'>{t('smsPreview.driverPhone')}:</strong> 
              <a href={`tel:${driverPhone}`} className="font-mono text-teal-400 hover:underline ml-2">{driverPhone}</a>
            </p>
          )}
          <div className="relative bg-slate-900 p-4 rounded-lg border border-slate-700">
            <p className="text-gray-200 whitespace-pre-wrap font-mono text-sm break-words">{sms}</p>
            <div className="absolute top-2 right-2 flex items-center space-x-2">
              <a
                href={navigationUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 rounded-md bg-slate-700 text-gray-300 transition-colors hover:bg-slate-600 hover:text-white"
                title={t('assignment.openNavigation') + ' (Google Maps)'}
              >
                <NavigationIcon className="w-5 h-5"/>
              </a>
              <a
                className="btn btn-ghost px-2"
                title={t('sms.openInApp')}
                href={universalNavUrl || '#'}
                target="_blank"
                rel="noreferrer"
              >
                {t('sms.open')}
              </a>
              <a
                href={wazeUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-2 px-2 py-1 rounded-md bg-slate-700 text-gray-300 text-xs transition-colors hover:bg-slate-600 hover:text-white"
                title={t('assignment.openNavigation') + ' (Waze)'}
              >
                Waze
              </a>
              {messagingApp === 'SMS' ? (
                <button
                  type="button"
                  onClick={async () => cleanDriverPhone && onSendViaGateway && await onSendViaGateway()}
                  className={`p-2 rounded-md bg-slate-700 text-gray-300 transition-colors ${!cleanDriverPhone || !onSendViaGateway ? 'opacity-50 cursor-not-allowed' : 'hover:bg-slate-600 hover:text-white'}`}
                  title={cleanDriverPhone ? t('assignment.sendVia', { app: messagingApp }) : t('smsPreview.noPhoneNumber')}
                  disabled={!cleanDriverPhone || !onSendViaGateway}
                >
                  <ShareIcon className="w-5 h-5"/>
                </button>
              ) : (
                <a
                  href={shareLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`p-2 rounded-md bg-slate-700 text-gray-300 transition-colors ${!cleanDriverPhone ? 'opacity-50 cursor-not-allowed' : 'hover:bg-slate-600 hover:text-white'}`}
                  title={cleanDriverPhone ? t('assignment.sendVia', { app: messagingApp }) : t('smsPreview.noPhoneNumber')}
                  onClick={(e) => !cleanDriverPhone && e.preventDefault()}
                >
                  <ShareIcon className="w-5 h-5"/>
                </a>
              )}
              <button
                type="button"
                onClick={handleCopy}
                className="p-2 rounded-md bg-slate-700 hover:bg-slate-600 text-gray-300 hover:text-white transition-colors"
                title={t('assignment.copyText')}
              >
                {copied ? <CheckCircleIcon className="w-5 h-5 text-green-400" /> : <ClipboardIcon className="w-5 h-5"/>}
              </button>
            </div>
          </div>
        </div>
        <div className="flex justify-end items-center p-6 bg-slate-900 border-t border-slate-700 rounded-b-lg space-x-3">
          {/* If onConfirm exists (scheduled dispatch), show cancel + send + confirm */}
          {onConfirm ? (
            <>
                <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium rounded-md bg-slate-600 text-gray-200 hover:bg-slate-500 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 focus:ring-offset-slate-800">
                    {t('general.cancel')}
                </button>
                {onSendViaGateway && (
                  <button type="button" onClick={async () => await onSendViaGateway()} className="px-4 py-2 text-sm font-medium rounded-md shadow-sm text-white bg-emerald-600 hover:bg-emerald-700 transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 focus:ring-offset-slate-800">
                    {t('smsPreview.send')}
                  </button>
                )}
                <button type="button" onClick={onConfirm} className="px-4 py-2 text-sm font-medium rounded-md shadow-sm text-white bg-amber-600 hover:bg-amber-700 transition-colors focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 focus:ring-offset-slate-800">
                    {t('smsPreview.confirmDispatch')}
                </button>
            </>
          ) : (
            <>
              {onSendViaGateway && (
                <button type="button" onClick={async () => await onSendViaGateway()} className="px-4 py-2 text-sm font-medium rounded-md shadow-sm text-white bg-emerald-600 hover:bg-emerald-700 transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 focus:ring-offset-slate-800">
                  {t('smsPreview.sendSms')}
                </button>
              )}
              <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium rounded-md shadow-sm text-white bg-amber-600 hover:bg-amber-700 transition-colors focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 focus:ring-offset-slate-800">
                  {t('general.close')}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};