import React from 'react';
import type { Notification } from '../types';
import { BellIcon, CloseIcon } from './icons';
import { useTranslation } from '../contexts/LanguageContext';

interface NotificationCenterProps {
  notifications: Notification[];
  onDismiss: (id: string) => void;
}

const NotificationToast: React.FC<{
  notification: Notification;
  onDismiss: (id: string) => void;
}> = ({ notification, onDismiss }) => {
  const { t } = useTranslation();
  const { id, type, titleKey, messageKey, messageParams } = notification;
  const iconColor = type === 'delay' ? 'text-red-400' : type === 'customerOrder' ? 'text-green-400' : 'text-amber-400';
  
  const title = t(titleKey);
  const message = t(messageKey, messageParams);

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg shadow-2xl w-full max-w-sm p-4 animate-fade-in">
      <div className="flex items-start space-x-4">
        <div className={`flex-shrink-0 ${iconColor}`}>
          <BellIcon />
        </div>
        <div className="flex-grow">
          <h4 className="font-bold text-white">{title}</h4>
          <p className="text-sm text-gray-300 mt-1">{message}</p>
        </div>
        <button
          onClick={() => onDismiss(id)}
          className="p-1 -m-1 text-gray-500 hover:text-white transition-colors rounded-full"
          aria-label={t('notifications.dismiss')}
        >
          <CloseIcon size={20} />
        </button>
      </div>
    </div>
  );
};

export const NotificationCenter: React.FC<NotificationCenterProps> = ({ notifications, onDismiss }) => {
  if (notifications.length === 0) {
    return null;
  }

  return (
    <div
      className="fixed top-6 right-6 z-[100] space-y-4"
      aria-live="polite"
      aria-atomic="true"
    >
      {notifications.map(notification => (
        <NotificationToast
          key={notification.id}
          notification={notification}
          onDismiss={onDismiss}
        />
      ))}
    </div>
  );
};