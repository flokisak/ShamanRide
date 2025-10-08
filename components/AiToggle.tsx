import React from 'react';

interface AiToggleProps {
  isEnabled: boolean;
  onToggle: () => void;
}

export const AiToggle: React.FC<AiToggleProps> = ({ isEnabled, onToggle }) => {
  return (
    <div className="flex items-center space-x-3">
        <span className={`text-sm font-medium ${!isEnabled ? 'text-white' : 'text-gray-400'}`}>
            Manuálně
        </span>
        <button
            onClick={onToggle}
            type="button"
            className={`${
            isEnabled ? 'bg-amber-600' : 'bg-slate-600'
            } relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 focus:ring-offset-slate-900`}
            role="switch"
            aria-checked={isEnabled}
        >
            <span
            aria-hidden="true"
            className={`${
                isEnabled ? 'translate-x-5' : 'translate-x-0'
            } pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out`}
            />
        </button>
        <span className={`text-sm font-medium ${isEnabled ? 'text-white' : 'text-gray-400'}`}>
            AI Režim
        </span>
    </div>
  );
};